// app/src/screens/Upgrade.jsx
import React, { useState } from "react";
import { activatePackage } from "../api.js";

export default function Upgrade({ userId, status, onActivated }) {
  const [message, setMessage] = useState("");
  const [activating, setActivating] = useState(false);

  const handleManualActivate = async (pkg) => {
    setActivating(true);
    try {
      await activatePackage(userId, pkg);
      setMessage(`Activated ${pkg} successfully.`);
      onActivated && onActivated();
    } catch (e) {
      console.error("Activation error:", e);
      setMessage("Activation failed.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h2>Upgrade Required</h2>
      <p>
        Your trial expired or you’ve exhausted your quota. Current package:{" "}
        <strong>{status.package}</strong>
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <h3>Starter – $49/month</h3>
          <p>5 live support requests per week</p>
          <button onClick={() => handleManualActivate("Starter")} disabled={activating}>
            Activate Starter
          </button>
        </div>

        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <h3>Pro – $119/month</h3>
          <p>10 live support requests/week + priority</p>
          <button onClick={() => handleManualActivate("Pro")} disabled={activating}>
            Activate Pro
          </button>
        </div>

        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <h3>Elite – $299/month</h3>
          <p>Unlimited access + live call</p>
          <button onClick={() => handleManualActivate("Elite")} disabled={activating}>
            Activate Elite
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <p>
          Pay with USDT (TRC20): <code>TE6cbin6JJ5EFVFBso6stgV9HM6X2wRgrP</code>
        </p>
        <p>
          After payment, press the appropriate activate button above or contact support via Telegram to
          confirm and manually activate.
        </p>
      </div>

      {message && <div style={{ marginTop: 12 }}>{message}</div>}
    </div>
  );
}
