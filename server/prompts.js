const baseSystem = (topic) => ({
    role: "system",
    content: `You are a highly experienced Forex trading expert. The user requested a *${topic}*. You must answer strictly about this topic. Do not give unrelated advice or promote other services. Be concise, actionable, and mention risk management.`
  });
  
  const prompts = {
    trade_setup: (userMessage, imageDescription = "") => [
      baseSystem("Trade Setup Review"),
      {
        role: "user",
        content: `Here is my trade setup:\n${userMessage}${imageDescription ? `\nChart context: ${imageDescription}` : ""}\nProvide:
  - Assessment of entry, stop loss, take profit
  - Risk/reward ratio
  - Suggestions to improve the setup
  - Any red flags`
      }
    ],
    account_health: (userMessage, imageDescription = "") => [
      baseSystem("Account Health Check"),
      {
        role: "user",
        content: `Account health data:\n${userMessage}${imageDescription ? `\nAttached screenshot info: ${imageDescription}` : ""}\nAnalyze:
  - Risk exposure
  - Lot sizing
  - Drawdown threats
  - Suggestions to stabilize and optimize account`
      }
    ],
    psychology: (userMessage) => [
      baseSystem("Trade Psychology Support"),
      {
        role: "user",
        content: `User emotional state / description: ${userMessage}\nProvide advice to:
  - Recenter mindset
  - Avoid revenge trading
  - Build discipline
  - Quick actionable techniques to manage emotions during live trading`
      }
    ],
    funded_account: (userMessage, imageDescription = "") => [
      baseSystem("Funded Account Risk Advice"),
      {
        role: "user",
        content: `Prop firm challenge data:\n${userMessage}${imageDescription ? `\nScreenshot context: ${imageDescription}` : ""}\nEvaluate:
  - Risk of violation
  - Position sizing
  - Progress vs rules
  - Recommendations to stay compliant and pass the challenge`
      }
    ],
    margin_call: (userMessage, imageDescription = "") => [
      baseSystem("Margin Call Emergency"),
      {
        role: "user",
        content: `Emergency margin call details:\n${userMessage}${imageDescription ? `\nScreenshot context: ${imageDescription}` : ""}\nImmediately advise:
  - Which positions to close first
  - How to preserve capital
  - Steps to recover safely`
      }
    ]
  };
  
  module.exports = prompts;
  