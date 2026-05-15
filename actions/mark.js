const { Markup } = require('telegraf');

const { mainMenu } = require('../helpers/menu');

const {
  sheets,
  SPREADSHEET_ID,
  SHEET_NAME
} = require('../helpers/google');

// ================= STATE =================

const sessions = {};

// ================= HELPERS =================

const FIRST_DATE_COL = 8;
const FIRST_DATA_ROW = 3;

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

function getWeekday(dateString) {

  const [day, month] = dateString.split('.');

  const date = new Date(
    new Date().getFullYear(),
    month - 1,
    day
  );

  const days = [
    'вс',
    'пн',
    'вт',
    'ср',
    'чт',
    'пт',
    'сб'
  ];

  return days[date.getDay()];
}

async function getStudents() {

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A3:F`
  });

  const rows = res.data.values || [];

  return rows.map((row, i) => ({
    row: i + FIRST_DATA_ROW,
    name: row[0],
    remaining: Number(row[5] || 0)
  }));

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
    .filter(x => x.label);

}

// ================= REGISTER =================

function registerMarkActions(bot) {

  // ===== OPEN DATES =====

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

  // ===== DATE SELECTED =====

  bot.action(/date_(.+)/, async (ctx) => {

    await ctx.answerCbQuery();

    const col = Number(ctx.match[1]);

    const students = await getStudents();

    sessions[ctx.from.id] = {
      col,
      selected: []
    };

    const buttons = [];

    for (let i = 0; i < students.length; i += 2) {

      const row = [];

      const s1 = students[i];

      row.push(
        Markup.button.callback(
          `${s1.name} (${s1.remaining})`,
          `toggle_${s1.row}`
        )
      );

      const s2 = students[i + 1];

      if (s2) {

        row.push(
          Markup.button.callback(
            `${s2.name} (${s2.remaining})`,
            `toggle_${s2.row}`
          )
        );

      }

      buttons.push(row);

    }

    buttons.push([
      Markup.button.callback(
        '✅ Готово',
        'save_marks'
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

  // ===== TOGGLE =====

  bot.action(/toggle_(.+)/, async (ctx) => {

    await ctx.answerCbQuery('Отмечено');

    const row = Number(ctx.match[1]);

    const session = sessions[ctx.from.id];

    if (!session) return;

    if (session.selected.includes(row)) {

      session.selected =
        session.selected.filter(x => x !== row);

    } else {

      session.selected.push(row);

    }

  });

  // ===== SAVE =====

  bot.action('save_marks', async (ctx) => {

    await ctx.answerCbQuery();

    const session = sessions[ctx.from.id];

    if (!session || !session.selected.length) {

      return ctx.answerCbQuery(
        'Никто не выбран'
      );

    }

    const colLetter = columnToLetter(session.col);

    for (const row of session.selected) {

      // ===== CHECKMARK =====

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${colLetter}${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['✅']]
        }
      });

      // ===== COUNTERS =====

      const current =
        await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!E${row}:F${row}`
        });

      const values =
        current.data.values?.[0] || [];

      const used =
        Number(values[0] || 0) + 1;

      const remaining =
        Math.max(
          Number(values[1] || 0) - 1,
          0
        );

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!E${row}:F${row}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[used, remaining]]
        }
      });

    }

const students = await getStudents();

const selectedStudents = students.filter(
  s => session.selected.includes(s.row)
);

const dates = await getDates();

const currentDate = dates.find(
  d => d.col === session.col
);

let text =
  `✅ Отмечены занятия\n\n` +
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

  // ===== MENU =====

  bot.action('menu', async (ctx) => {

    await ctx.answerCbQuery();

    await ctx.editMessageText(
      '🧘 Йога-журнал',
      mainMenu()
    );

  });

}

module.exports = {
  registerMarkActions
};
