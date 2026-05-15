const { Markup } = require('telegraf');

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Отметить занятие', 'mark')],
    [Markup.button.callback('📊 Проверить абонементы', 'check')],
    [Markup.button.callback('🔄 Продлить абонемент', 'renew')]
  ]);
}

module.exports = {
  mainMenu
};
