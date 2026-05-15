const { Markup } = require('telegraf');

const { mainMenu } = require('../helpers/menu');

function registerMarkActions(bot) {

  bot.action('mark', async (ctx) => {

    await ctx.answerCbQuery();

    await ctx.editMessageText(
      '🚧 Отметка занятий пока переносится в новый модуль',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Назад', 'menu')]
      ])
    );

  });

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
