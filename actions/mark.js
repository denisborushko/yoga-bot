require('dotenv').config();

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');

const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= GOOGLE =================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({
  version: 'v4',
  auth
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Журнал посещений';

const FIRST_DATE_COL = 8;
const FIRST_DATA_ROW = 3;

const LOW_THRESHOLD = 2;

// ================= SESSIONS =================

const sessions = {};

// ================= HELPERS =================

function columnToLetter(column) {
  let temp;
  let letter = '';

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}

function getWeekday(dateLabel) {
  const [day, month] = dateLabel.split('.').map(Number);

  const date = new Date(
    new Date().getFullYear(),
    month - 1,
    day
  );

  return ['вс','пн','вт','ср','чт','пт','сб'][date.getDay()];
}

async function getStudents() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A3:G`
  });

  const rows = res.data.values || [];

  return rows.map((row, i) => ({
    row: i + FIRST_DATA_ROW,
    name: row[0],
    pack: Number(row[1] || 0),
    start: row[2],
    until: row[3],
    used: Number(row[4] || 0),
    remaining: Number(row[5] || 0)
  })).filter(x => x.name);
}

async function getDates() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!H1:ZZ1`
  });

  const row = res.data.values?.[0] || [];

  return row
    .map((v, i) => ({
      label: v,
      col: FIRST_DATE_COL + i
    }))
    .filter(x => {
      if (!x.label) return false;

      const parts = x.label.split('.');

      if (parts.length !== 2) return false;

      const day = Number(parts[0]);
      const month = Number(parts[1]);

      const now = new Date();

      const date = new Date(
        now.getFullYear(),
        month - 1,
        day
      );

      return date <= now;
    });
}

// ================= MENU =================

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Отметить занятие', 'mark')],
    [Markup.button.callback('📊 Проверить абонементы', 'check')],
    [Markup.button.callback('🔄 Продлить абонемент', 'renew')]
  ]);
}

// ================= START =================

bot.start(async (ctx) => {
  await ctx.reply(
    '🧘 Йога-журнал',
    mainMenu()
  );
});

// ================= MENU =================

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '🧘 Йога-журнал',
    mainMenu()
  );
});

// ================= CHECK =================

bot.action('check', async (ctx) => {
  await ctx.answerCbQuery();

  const students = await getStudents();

  const low = students
    .filter(s => s.remaining <= LOW_THRESHOLD)
    .sort((a, b) => a.remaining - b.remaining);

  if (!low.length) {
    return ctx.editMessageText(
      '✅ У всех достаточно занятий',
      mainMenu()
    );
  }

  let text = '⚠️ Заканчиваются занятия:\n\n';

  low.forEach(s => {
    text += `• ${s.name}: ${s.remaining}\n`;
  });

  await ctx.editMessageText(
    text,
    mainMenu()
  );
});

// ================= MARK =================

bot.action('mark', async (ctx) => {
  await ctx.answerCbQuery();

  const dates = await getDates();

  const buttons = dates
    .slice(-10)
    .reverse()
    .map(d => [
      Markup.button.callback(
        `${d.label} (${getWeekday(d.label)})`,
        `date_${d.col}`
      )
    ]);

  buttons.push([
    Markup.button.callback('⬅️ Назад', 'menu')
  ]);

  await ctx.editMessageText(
    '📅 Выбери дату:',
    Markup.inlineKeyboard(buttons)
  );
});

// ================= DATE =================

bot.action(/date_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const col = Number(ctx.match[1]);

  sessions[ctx.from.id] = {
    col,
    selected: []
  };

  const students = await getStudents();

  const buttons = [];

  for (let i = 0; i < students.length; i += 2) {
    const rowButtons = [];

    const s1 = students[i];

    rowButtons.push(
      Markup.button.callback(
        `${s1.name} (${s1.remaining})`,
        `toggle_${s1.row}`
      )
    );

    const s2 = students[i + 1];

    if (s2) {
      rowButtons.push(
        Markup.button.callback(
          `${s2.name} (${s2.remaining})`,
          `toggle_${s2.row}`
        )
      );
    }

    buttons.push(rowButtons);
  }

  buttons.push([
    Markup.button.callback(
      '✅ Готово',
      'done_mark'
    )
  ]);

  buttons.push([
    Markup.button.callback(
      '⬅️ Назад',
      'mark'
    )
  ]);

  await ctx.editMessageText(
    '👤 Выбери учениц:',
    Markup.inlineKeyboard(buttons)
  );
});

// ================= TOGGLE =================

bot.action(/toggle_(.+)/, async (ctx) => {

  await ctx.answerCbQuery();

  const row = Number(ctx.match[1]);

  const session = sessions[ctx.from.id];

  if (!session) return;

  // toggle
  if (session.selected.includes(row)) {

    session.selected =
      session.selected.filter(
        x => x !== row
      );

  } else {

    session.selected.push(row);

  }

  const students = await getStudents();

  const buttons = [];

  for (let i = 0; i < students.length; i += 2) {

    const rowButtons = [];

    // LEFT

    const left = students[i];

    const leftChecked =
      session.selected.includes(left.row)
        ? '✅ '
        : '';

    rowButtons.push(

      Markup.button.callback(
        `${leftChecked}${left.name} (${left.remaining})`,
        `toggle_${left.row}`
      )

    );

    // RIGHT

    const right = students[i + 1];

    if (right) {

      const rightChecked =
        session.selected.includes(right.row)
          ? '✅ '
          : '';

      rowButtons.push(

        Markup.button.callback(
          `${rightChecked}${right.name} (${right.remaining})`,
          `toggle_${right.row}`
        )

      );

    }

    buttons.push(rowButtons);

  }

  buttons.push([

    Markup.button.callback(
      `✅ Готово (${session.selected.length})`,
      'done_mark'
    )

  ]);

  buttons.push([

    Markup.button.callback(
      '⬅️ Назад',
      'mark'
    )

  ]);

  await ctx.editMessageText(

    `👤 Выбери учениц:\n\nВыбрано: ${session.selected.length}`,

    Markup.inlineKeyboard(buttons)

  );

});
// ================= DONE MARK =================

bot.action('done_mark', async (ctx) => {
  await ctx.answerCbQuery();

  const session = sessions[ctx.from.id];

  if (!session || !session.selected.length) {
    return ctx.answerCbQuery(
      'Никто не выбран'
    );
  }

  const students = await getStudents();

  const selectedStudents = students.filter(
    s => session.selected.includes(s.row)
  );

  const colLetter = columnToLetter(session.col);

for (const student of selectedStudents) {

  const cell = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${colLetter}${student.row}`
  });

  const currentValue =
    cell.data.values?.[0]?.[0];

  // уже отмечено
  if (currentValue) {
    continue;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${colLetter}${student.row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['✔']]
    }
  });

  const used = student.used + 1;

  const remaining = Math.max(
    student.remaining - 1,
    0
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E${student.row}:F${student.row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[used, remaining]]
    }
  });
}

  const dates = await getDates();

  const currentDate = dates.find(
    d => d.col === session.col
  );

  let text =
    `✅ Занятия отмечены\n\n` +
    `📅 ${currentDate.label} (${getWeekday(currentDate.label)})\n\n`;

  selectedStudents.forEach(s => {
    text += `• ${s.name}\n`;
  });

  delete sessions[ctx.from.id];

  await ctx.editMessageText(
    text,
    mainMenu()
  );
});

// ================= RENEW =================

bot.action('renew', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '🔄 Продление скоро добавим',
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '⬅️ Назад',
          'menu'
        )
      ]
    ])
  );
});

// ================= ERROR =================

bot.catch((err) => {
  console.error('BOT ERROR:', err);
});

// ================= SERVER =================

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.use(bot.webhookCallback('/webhook'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('Server started');

  const url = process.env.RENDER_EXTERNAL_URL;

  if (url) {
    await bot.telegram.setWebhook(
      `${url}/webhook`
    );

    console.log('Webhook set');
  }
});
