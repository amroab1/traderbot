require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// /start
bot.start((ctx) => {
  ctx.reply(
    "🚨 Welcome to LiveTrade DM\nYour 24/7 hotline when the market turns against you.\nGet instant help from real trading experts — anytime you panic, hesitate, or face tough decisions.\nStay calm, stay in control.\n🎁 Claim your 3-day free trial now.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Open App",
              web_app: { url: "https://traderbot-inky.vercel.app/" }
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
