require('dotenv').config();

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');

const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= GOOGLE SHEETS =================

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

      const date = new Date(now.getFullYear(), month - 1, day);

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

bot.start(async (ctx) => {
  await ctx.reply(
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
    text += `• ${s.name}: осталось ${s.remaining}\n`;
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
        d.label,
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

// ================= DATE SELECTED =================

bot.action(/date_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const col = ctx.match[1];

  const students = await getStudents();

  const buttons = students.map(s => [
    Markup.button.callback(
      `${s.name} (${s.remaining})`,
      `student_${s.row}_${col}`
    )
  ]);

  buttons.push([
    Markup.button.callback('⬅️ Назад', 'mark')
  ]);

  await ctx.editMessageText(
    '👤 Выбери ученика:',
    Markup.inlineKeyboard(buttons)
  );
});

// ================= MARK STUDENT =================

bot.action(/student_(.+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const row = Number(ctx.match[1]);
  const col = Number(ctx.match[2]);

  const colLetter = columnToLetter(col);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${colLetter}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['✅']]
    }
  });

  const usedCell = `E${row}`;
  const remainingCell = `F${row}`;

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E${row}:F${row}`
  });

  const values = current.data.values?.[0] || [];

  const used = Number(values[0] || 0) + 1;
  const remaining = Math.max(Number(values[1] || 0) - 1, 0);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E${row}:F${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[used, remaining]]
    }
  });

  await ctx.editMessageText(
    '✅ Занятие отмечено',
    mainMenu()
  );
});

// ================= RENEW =================

bot.catch((err) => {
  console.error('BOT ERROR:', err);
});

bot.action(/date_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const students = await getStudents();

  const buttons = students.map(s => [
    Markup.button.callback(
      `${s.name} (${s.remaining})`,
      `renew_${s.row}`
    )
  ]);

  buttons.push([
    Markup.button.callback('⬅️ Назад', 'menu')
  ]);

  await ctx.editMessageText(
    '🔄 Кого продлить?',
    Markup.inlineKeyboard(buttons)
  );
});

// ================= MENU BACK =================

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '🧘 Йога-журнал',
    mainMenu()
  );
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
    await bot.telegram.setWebhook(`${url}/webhook`);
    console.log('Webhook set');
  }
});
