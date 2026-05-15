const { Markup } = require('telegraf');

const { mainMenu } = require('../helpers/menu');

function registerRenewActions(bot) {

  bot.action('renew', async (ctx) => {

    await ctx.answerCbQuery();

    await ctx.editMessageText(
      '🚧 Продление абонементов переносится в новый модуль',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Назад', 'menu')]
      ])
    );

  });

}

module.exports = {
  registerRenewActions
};
