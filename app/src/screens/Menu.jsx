import React from "react";
import { useNavigate } from "react-router-dom";

export default function Menu() {
  return (
    <div>
      <h2>📋 Services</h2>
      <button onClick={() => window.location.href = "/chat?topic=trade_setup"}>
        📉 Trade Setup Review
      </button>
      <button onClick={() => window.location.href = "/chat?topic=account_health"}>
        📊 Account Health Check
      </button>
      <button onClick={() => window.location.href = "/chat?topic=psychology"}>
        🧠 Psychology Support
      </button>
      <button onClick={() => window.location.href = "/chat?topic=funded_account"}>
        🏆 Funded Account Advice
      </button>
      <button onClick={() => window.location.href = "/chat?topic=margin_call"}>
        ⚠️ Margin Call Emergency
      </button>
    </div>
  );
}
