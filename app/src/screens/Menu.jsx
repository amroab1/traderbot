// app/src/screens/Menu.jsx
import React from "react";

const LIMITS = {
  trial: 5,
  Starter: 5,
  Pro: 10,
  Elite: Infinity,
};

export default function Menu({ status, onSelectTopic }) {
  const used = status.requestsWeek;
  const limit = LIMITS[status.package] ?? 0;
  const remaining = limit === Infinity ? "unlimited" : Math.max(limit - used, 0);

  return (
    <div style={{ padding: 20 }}>
      <h2>Services</h2>
      <div>
        <strong>Package:</strong> {status.package}
      </div>
      <div>
        <strong>Requests used:</strong> {used} / {limit === Infinity ? "∞" : limit}
      </div>
      <div>
        <strong>Remaining this week:</strong> {remaining}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <button onClick={() => onSelectTopic("trade_setup")}>
          📉 Trade Setup Review
        </button>
        <button onClick={() => onSelectTopic("account_health")}>
          📊 Account Health Check
        </button>
        <button onClick={() => onSelectTopic("psychology")}>
          🧠 Psychology Support
        </button>
        <button onClick={() => onSelectTopic("funded_account")}>
          🏆 Funded Account Advice
        </button>
        <button onClick={() => onSelectTopic("margin_call")}>
          ⚠️ Margin Call Emergency
        </button>
      </div>
    </div>
  );
}
