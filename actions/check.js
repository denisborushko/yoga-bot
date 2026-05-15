const { mainMenu } = require('../helpers/menu');
const {
  sheets,
  SPREADSHEET_ID,
  SHEET_NAME
} = require('../helpers/google');

function registerCheckActions(bot) {

  bot.action('check', async (ctx) => {

    await ctx.answerCbQuery();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A3:F`
    });

    const rows = res.data.values || [];

    const low = rows.filter(r => Number(r[5] || 0) <= 2);

    if (!low.length) {
      return ctx.editMessageText(
        '✅ У всех достаточно занятий',
        mainMenu()
      );
    }

    let text = '⚠️ Заканчиваются занятия:\n\n';

    low.forEach(r => {
      text += `• ${r[0]}: ${r[5]}\n`;
    });

    await ctx.editMessageText(
      text,
      mainMenu()
    );
  });

}

module.exports = {
  registerCheckActions
};
