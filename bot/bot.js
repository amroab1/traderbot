require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// /start
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to Forex AI Support\n\nWe can help you with:\n\nStart your FREE TRIAL 3 days or upgrade to PRO plan for 30 days with no sending limits.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚨 EMERGENCY 911 ONE TO ONE",
              callback_data: "emergency",
              pay: true // This adds a red background
            }
          ],
          [
            {
              text: "📊 ACCOUNT HEALTH CHECK",
              callback_data: "health_check"
            }
          ]
        ]
      }
    }
  );
});

// Admin notification helper
function notifyAdmin(bot, adminId, text) {
  bot.telegram.sendMessage(adminId, text).catch(console.error);
}

// Example: after support activation confirmation from app
bot.command("activated", (ctx) => {
  const userId = ctx.from.id;
  notifyAdmin(
    bot,
    process.env.ADMIN_TELEGRAM_ID,
    `User ${userId} has been manually activated via subscription.`
  );
  ctx.reply("Your access has been activated. You can now use the services.");
});

// Handle emergency button
bot.action('emergency', (ctx) => {
  const userId = ctx.from.id;
  notifyAdmin(
    bot,
    process.env.ADMIN_TELEGRAM_ID,
    `⚠️ EMERGENCY: User ${userId} needs immediate one-to-one assistance!`
  );
  ctx.reply("Your emergency request has been sent to our team. Someone will contact you shortly.");
});

// Handle account health check button
bot.action('health_check', (ctx) => {
  ctx.reply("We'll analyze your account health. Please provide your recent trading statistics or screenshots to get started.");
});

bot.launch();
console.log("Telegram bot running...");
