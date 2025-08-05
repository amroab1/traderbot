// server/prompts.js

const baseSystemPrompt = `
You are a professional trading support analyst. Follow these rules strictly:

⚠️ IMPORTANT RULES & LIMITATIONS:

2. 📉 Always prioritize risk management:
   • Focus on capital preservation and avoiding unnecessary losses.
   • Encourage discipline and controlled exposure over reward-seeking.
3. 📷 Provide detailed technical analysis when users share chart screenshots:
   • Highlight structure, key levels, entry zones, risk areas, and potential setups.
4. 🧠 Support trading psychology:
   • Offer emotional support during losses, overtrading, revenge trading, and confidence drops.
5. 🚫 Do NOT provide financial advice:
   • Offer educational insight, not investment instructions or trade signals.
6. 💸 Never advise the following:
   • Do NOT recommend adding money to a trading account.
   • Do NOT encourage high-risk trades.
   • Do NOT ask which broker the trader is using.
7. 🤝 Be supportive and understanding:
   • Respect the emotional intensity of trading.
   • Respond with empathy, especially during tough drawdowns or psychological distress.
8. Do not mention that you are an AI or refer to yourself as a model. Speak as a human professional.

9- reply with short answers and straight to the point.

Always keep answers concise, structured, and actionable. Do not deviate from the user's specified topic.
`.trim();

function buildMessage(userContent) {
  return [
    { role: "system", content: baseSystemPrompt },
    { role: "user", content: userContent },
  ];
}

module.exports = {
  trade_setup: (tradeDetails, imageUrl = "") => {
    const parts = [];
    if (imageUrl) {
      parts.push(`Chart screenshot: ${imageUrl}`);
    }
    parts.push(`Trade details: ${tradeDetails}`);
    parts.push(
      `Please analyze in sections:
- Entry quality
- Stop loss appropriateness
- Take profit realism
- Risk/Reward ratio
- Suggestions to improve
- Potential red flags`
    );
    const userContent = parts.join("\n\n");
    return buildMessage(userContent);
  },

  account_health: (accountInfo, imageUrl = "") => {
    const parts = [];
    if (imageUrl) {
      parts.push(`Account screenshot: ${imageUrl}`);
    }
    parts.push(
      `Account details: ${accountInfo}. Provide a breakdown of:
- Risk exposure
- Lot sizing
- Overtrading signs
- Recommendations to stabilize the account`
    );
    const userContent = parts.join("\n\n");
    return buildMessage(userContent);
  },

  psychology: (stateDescription, imageUrl = "") => {
    const parts = [];
    if (imageUrl) {
      parts.push(`Optional context screenshot: ${imageUrl}`);
    }
    parts.push(
      `User emotional state: ${stateDescription}. Provide mindset support, actionable coping techniques, and encouragement. Identify if they show signs of revenge trading, overtrading, fear, or overconfidence. Emphasize staying disciplined and preserving capital, and help them refocus.`
    );
    const userContent = parts.join("\n\n");
    return buildMessage(userContent);
  },

  funded_account: (details, imageUrl = "") => {
    const parts = [];
    if (imageUrl) {
      parts.push(`Challenge/stats screenshot: ${imageUrl}`);
    }
    parts.push(
      `Details: ${details}. Review whether the user is at risk of violation, managing position sizing properly, and on track to pass the evaluation. Highlight compliance with rules, drawdown risk, and give suggestions to stay within acceptable boundaries.`
    );
    const userContent = parts.join("\n\n");
    return buildMessage(userContent);
  },

  margin_call: (details, imageUrl = "") => {
    const parts = [];
    if (imageUrl) {
      parts.push(`Critical screenshot: ${imageUrl}`);
    }
    parts.push(
      `Emergency margin call details: ${details}. Provide immediate risk mitigation steps, including what to close first, how to reduce exposure, and psychological advice to remain calm. Emphasize preserving capital above all.`
    );
    const userContent = parts.join("\n\n");
    return buildMessage(userContent);
  },
};
