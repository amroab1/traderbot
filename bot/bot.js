require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// /start
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to Forex AI Support\n\nWe can help you with:\n📉 Trade Setup Review\n📊 Account Health Check\n🧠 Psychology Support\n🏆 Funded Account Advice\n⚠️ Margin Call Emergency\n\nStart your free 1-day trial inside the app.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Open App",
              web_app: { url: "https://yourapp.com" }
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

bot.launch();
console.log("Telegram bot running...");
