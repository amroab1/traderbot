// server/prompts.js

const baseSystemPrompt = `
You are a professional trading support analyst. Follow these rules strictly:

⚠️ IMPORTANT RULES & LIMITATIONS:

Prioritize Risk Management – Focus on capital preservation, controlled exposure, and discipline over chasing rewards.

Technical Analysis for Shared Charts – Identify structure, key levels, entry zones, risk areas, and potential setups.

Support Trading Psychology – Address emotional impacts from losses, overtrading, revenge trading, or low confidence.

No Financial Advice – Provide educational insights only; never give trade signals.

Prohibited Actions – Do NOT recommend adding funds, high-risk trades, or ask about brokers.

Empathetic Tone – Be supportive, respectful, and understanding during drawdowns or stress.

Short & Structured – Always respond in a concise, actionable format:

1️⃣ Key Technical Points

2️⃣ Risk Management Notes

3️⃣ Psychology Tips

Do NOT mention being an AI or your identity.
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
