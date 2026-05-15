require('dotenv').config();

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');

const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= GOOGLE SHEETS =================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(
    process.env.GOOGLE_CREDENTIALS
  ),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets'
  ]
});

const sheets = google.sheets({
  version: 'v4',
  auth
});

const SPREADSHEET_ID =
  process.env.SPREADSHEET_ID;

const SHEET_NAME =
  'Журнал посещений';

const FIRST_DATE_COL = 8;
const FIRST_DATA_ROW = 3;

const LOW_THRESHOLD = 2;

// ================= TEMP SELECTIONS =================

const selectedStudents = {};

// ================= HELPERS =================

function columnToLetter(column) {
  let temp;
  let letter = '';

  while (column > 0) {
    temp = (column - 1) % 26;

    letter =
      String.fromCharCode(temp + 65) +
      letter;

    column =
      (column - temp - 1) / 26;
  }

  return letter;
}

async function getStudents() {
  const res =
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A3:G`
    });

  const rows = res.data.values || [];

  return rows
    .map((row, i) => ({
      row: i + FIRST_DATA_ROW,
      name: row[0],
      pack: Number(row[1] || 0),
      start: row[2],
      until: row[3],
      used: Number(row[4] || 0),
      remaining: Number(row[5] || 0)
    }))
    .filter(x => x.name);
}

async function getDates() {
  const res =
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!H1:ZZ1`
    });

  const row = res.data.values?.[0] || [];

  const now = new Date();

  const weekdays = [
    'Вс',
    'Пн',
    'Вт',
    'Ср',
    'Чт',
    'Пт',
    'Сб'
  ];

  return row
    .map((v, i) => {
      if (!v) return null;

      const parts = v.split('.');

      if (parts.length !== 2) {
        return null;
      }

      const day = Number(parts[0]);
      const month = Number(parts[1]);

      if (
        isNaN(day) ||
        isNaN(month)
      ) {
        return null;
      }

      let year = now.getFullYear();

      // фикс перехода года
      if (
        month < now.getMonth() + 1 &&
        now.getMonth() === 11
      ) {
        year++;
      }

      const date = new Date(
        year,
        month - 1,
        day
      );

      return {
        label:
          `${v} (${weekdays[date.getDay()]})`,
        col: FIRST_DATE_COL + i,
        date
      };
    })
    .filter(x => x);
}

async function safeEdit(
  ctx,
  text,
  keyboard
) {
  try {
    await ctx.editMessageText(
      text,
      keyboard
    );
  } catch (e) {
    try {
      await ctx.reply(
        text,
        keyboard
      );
    } catch (_) {}
  }
}

async function renderStudentsSelection(
  ctx,
  userId
) {
  const session =
    selectedStudents[userId];

  if (!session) return;

  const students =
    await getStudents();

  const buttons = [];

  for (
    let i = 0;
    i < students.length;
    i += 2
  ) {
    const row = [];

    const s1 = students[i];

    const selected1 =
      session.selected.includes(
        s1.row
      );

    const icon1 =
      s1.remaining <= 0
        ? '🔴'
        : s1.remaining <= 2
        ? '🟡'
        : '🟢';

    row.push(
      Markup.button.callback(
        `${selected1 ? '✅ ' : ''}${icon1} ${s1.name} (${s1.remaining})`,
        `toggle_${s1.row}`
      )
    );

    if (students[i + 1]) {
      const s2 = students[i + 1];

      const selected2 =
        session.selected.includes(
          s2.row
        );

      const icon2 =
        s2.remaining <= 0
          ? '🔴'
          : s2.remaining <= 2
          ? '🟡'
          : '🟢';

      row.push(
        Markup.button.callback(
          `${selected2 ? '✅ ' : ''}${icon2} ${s2.name} (${s2.remaining})`,
          `toggle_${s2.row}`
        )
      );
    }

    buttons.push(row);
  }

  buttons.push([
    Markup.button.callback(
      '✅ Подтвердить',
      'confirm_students'
    )
  ]);

  buttons.push([
    Markup.button.callback(
      '⬅️ Назад',
      'mark'
    )
  ]);

  await safeEdit(
    ctx,
    '👤 Выбери учениц:',
    Markup.inlineKeyboard(buttons)
  );
}

// ================= MENU =================

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '✅ Отметить занятие',
        'mark'
      )
    ],
    [
      Markup.button.callback(
        '📊 Проверить абонементы',
        'check'
      )
    ],
    [
      Markup.button.callback(
        '🔄 Продлить абонемент',
        'renew'
      )
    ]
  ]);
}

// ================= START =================

bot.start(async ctx => {
  await ctx.reply(
    '🧘 Йога-журнал',
    mainMenu()
  );
});

// ================= CHECK =================

bot.action('check', async ctx => {
  await ctx.answerCbQuery();

  try {
    const students =
      await getStudents();

    const low = students
      .filter(
        s =>
          s.remaining <=
          LOW_THRESHOLD
      )
      .sort(
        (a, b) =>
          a.remaining -
          b.remaining
      );

    if (!low.length) {
      return safeEdit(
        ctx,
        '✅ У всех достаточно занятий',
        mainMenu()
      );
    }

    let text =
      '⚠️ Заканчиваются занятия:\n\n';

    low.forEach(s => {
      text +=
        `• ${s.name}: осталось ${s.remaining}\n`;
    });

    await safeEdit(
      ctx,
      text,
      mainMenu()
    );
  } catch (e) {
    console.log(e);

    await ctx.reply(
      'Ошибка загрузки данных'
    );
  }
});

// ================= MARK =================

bot.action('mark', async ctx => {
  await ctx.answerCbQuery();

  try {
    const dates =
      await getDates();

    const now = new Date();

    now.setHours(
      0,
      0,
      0,
      0
    );

    // сегодня и будущие даты
    const futureDates =
      dates.filter(d => {
        const date =
          new Date(d.date);

        date.setHours(
          0,
          0,
          0,
          0
        );

        return date >= now;
      });

    const buttons =
      futureDates
        .slice(0, 10)
        .map(d => [
          Markup.button.callback(
            d.label,
            `date_${d.col}`
          )
        ]);

    buttons.push([
      Markup.button.callback(
        '⬅️ Назад',
        'menu'
      )
    ]);

    await safeEdit(
      ctx,
      '📅 Выбери дату:',
      Markup.inlineKeyboard(
        buttons
      )
    );
  } catch (e) {
    console.log(e);

    await ctx.reply(
      'Ошибка загрузки дат'
    );
  }
});

// ================= DATE SELECT =================

bot.action(
  /^date_(\d+)$/,
  async ctx => {
    await ctx.answerCbQuery();

    try {
      const col = parseInt(
        ctx.match[1]
      );

      const userId =
        ctx.from.id;

      selectedStudents[userId] = {
        col,
        selected: []
      };

      await renderStudentsSelection(
        ctx,
        userId
      );
    } catch (e) {
      console.log(e);

      await ctx.reply(
        'Ошибка выбора даты'
      );
    }
  }
);

// ================= TOGGLE STUDENT =================

bot.action(
  /^toggle_(\d+)$/,
  async ctx => {
    await ctx.answerCbQuery();

    try {
      const row = Number(
        ctx.match[1]
      );

      const userId =
        ctx.from.id;

      const session =
        selectedStudents[userId];

      if (!session) {
        return ctx.reply(
          'Сессия истекла'
        );
      }

      const exists =
        session.selected.includes(
          row
        );

      if (exists) {
        session.selected =
          session.selected.filter(
            x => x !== row
          );
      } else {
        session.selected.push(
          row
        );
      }

      await renderStudentsSelection(
        ctx,
        userId
      );
    } catch (e) {
      console.log(e);

      await ctx.reply(
        'Ошибка выбора ученицы'
      );
    }
  }
);

// ================= CONFIRM STUDENTS =================

bot.action(
  'confirm_students',
  async ctx => {
    await ctx.answerCbQuery();

    try {
      const userId =
        ctx.from.id;

      const session =
        selectedStudents[userId];

      if (!session) {
        return ctx.reply(
          'Сессия истекла'
        );
      }

      const {
        col,
        selected
      } = session;

      if (!selected.length) {
        return ctx.reply(
          'Выберите хотя бы одну ученицу'
        );
      }

      const colLetter =
        columnToLetter(col);

      for (const row of selected) {
        // проверяем отметку
        const existing =
          await sheets.spreadsheets.values.get({
            spreadsheetId:
              SPREADSHEET_ID,
            range:
              `${SHEET_NAME}!${colLetter}${row}`
          });

        const alreadyMarked =
          existing.data.values?.[0]?.[0];

        if (
          alreadyMarked ===
          '✅'
        ) {
          continue;
        }

        // ставим галочку
        await sheets.spreadsheets.values.update({
          spreadsheetId:
            SPREADSHEET_ID,
          range:
            `${SHEET_NAME}!${colLetter}${row}`,
          valueInputOption:
            'USER_ENTERED',
          requestBody: {
            values: [['✅']]
          }
        });

        // получаем used / remaining
        const current =
          await sheets.spreadsheets.values.get({
            spreadsheetId:
              SPREADSHEET_ID,
            range:
              `${SHEET_NAME}!E${row}:F${row}`
          });

        const values =
          current.data.values?.[0] ||
          [];

        const used =
          Number(
            values[0] || 0
          ) + 1;

        const remaining =
          Math.max(
            Number(
              values[1] || 0
            ) - 1,
            0
          );

        // обновляем
        await sheets.spreadsheets.values.update({
          spreadsheetId:
            SPREADSHEET_ID,
          range:
            `${SHEET_NAME}!E${row}:F${row}`,
          valueInputOption:
            'USER_ENTERED',
          requestBody: {
            values: [[
              used,
              remaining
            ]]
          }
        });
      }

      delete selectedStudents[
        userId
      ];

      await safeEdit(
        ctx,
        `✅ Отмечено учениц: ${selected.length}`,
        mainMenu()
      );
    } catch (e) {
      console.log(e);

      await ctx.reply(
        'Ошибка подтверждения'
      );
    }
  }
);

// ================= RENEW =================

bot.action('renew', async ctx => {
  await ctx.answerCbQuery();

  try {
    const students =
      await getStudents();

    const buttons =
      students.map(s => [
        Markup.button.callback(
          `${s.name} (${s.remaining})`,
          `renew_student_${s.row}`
        )
      ]);

    buttons.push([
      Markup.button.callback(
        '⬅️ Назад',
        'menu'
      )
    ]);

    await safeEdit(
      ctx,
      '🔄 Кого продлить?',
      Markup.inlineKeyboard(
        buttons
      )
    );
  } catch (e) {
    console.log(e);

    await ctx.reply(
      'Ошибка загрузки учеников'
    );
  }
});

// ================= RENEW STUDENT =================

bot.action(
  /^renew_student_(\d+)$/,
  async ctx => {
    await ctx.answerCbQuery();

    try {
      const row = Number(
        ctx.match[1]
      );

      const students =
        await getStudents();

      const student =
        students.find(
          s => s.row === row
        );

      if (!student) {
        return ctx.reply(
          'Ошибка'
        );
      }

      const newUsed = 0;
      const newRemaining =
        student.pack;

      await sheets.spreadsheets.values.update({
        spreadsheetId:
          SPREADSHEET_ID,
        range:
          `${SHEET_NAME}!E${row}:F${row}`,
        valueInputOption:
          'USER_ENTERED',
        requestBody: {
          values: [[
            newUsed,
            newRemaining
          ]]
        }
      });

      await safeEdit(
        ctx,
        `✅ Абонемент продлен: ${student.name}`,
        mainMenu()
      );
    } catch (e) {
      console.log(e);

      await ctx.reply(
        'Ошибка продления'
      );
    }
  }
);

// ================= MENU =================

bot.action('menu', async ctx => {
  await ctx.answerCbQuery();

  await safeEdit(
    ctx,
    '🧘 Йога-журнал',
    mainMenu()
  );
});

// ================= ERROR =================

bot.catch(err => {
  console.error(
    'BOT ERROR:',
    err
  );
});

// ================= SERVER =================

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.use(
  bot.webhookCallback(
    '/webhook'
  )
);

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  async () => {
    console.log(
      'Server started'
    );

    const url =
      process.env
        .RENDER_EXTERNAL_URL;

    if (url) {
      await bot.telegram.setWebhook(
        `${url}/webhook`
      );

      console.log(
        'Webhook set'
      );
    }
  }
);
