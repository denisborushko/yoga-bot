require('dotenv').config();

const express = require('express');
const { Telegraf } = require('telegraf');

const { mainMenu } = require('./helpers/menu');

const { registerCheckActions } = require('./actions/check');

const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== START =====

bot.start(async (ctx) => {
  await ctx.reply(
    '🧘 Йога-журнал',
    mainMenu()
  );
});

// ===== ACTIONS =====

registerCheckActions(bot);

// ===== ERROR =====

bot.catch((err) => {
  console.error(err);
});

// ===== SERVER =====

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.use(bot.webhookCallback('/webhook'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {

  console.log('Server started');

  if (process.env.RENDER_EXTERNAL_URL) {

    await bot.telegram.setWebhook(
      `${process.env.RENDER_EXTERNAL_URL}/webhook`
    );

    console.log('Webhook set');
  }
});
