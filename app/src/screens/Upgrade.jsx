// app/src/screens/Upgrade.jsx
import React, { useState, useEffect } from "react";
import { activatePackage } from "../api.js"; // if still needed elsewhere

const API_BASE = import.meta.env.VITE_API_URL || "https://server-production-dd28.up.railway.app";

export default function Upgrade({ userId, status, onActivated }) {
  const [selectedPlan, setSelectedPlan] = useState("Starter");
  const [txid, setTxid] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);

  const planPrices = {
    Starter: "$49",
    Pro: "$119",
    Elite: "$299",
  };

  // Load persisted selection & pending payment
  useEffect(() => {
    const storedPlan = localStorage.getItem("selectedPlan");
    if (storedPlan) setSelectedPlan(storedPlan);
    const storedTxid = localStorage.getItem("pendingTxid");
    if (storedTxid) setTxid(storedTxid);

    (async () => {
      if (!userId) return;
      try {
        const res = await fetch(`${API_BASE}/api/pending-payment?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          const p = await res.json();
          if (p && p.txid) {
            setSelectedPlan(p.package);
            setTxid(p.txid);
            if (p.status === "pending") {
              setMessage("Payment previously submitted, awaiting verification.");
            } else if (p.status === "approved") {
              setMessage(`✅ Payment approved. You have access to the ${p.package} plan.`);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch existing pending payment:", e);
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [userId]);

  // persist selection locally
  useEffect(() => {
    localStorage.setItem("selectedPlan", selectedPlan);
  }, [selectedPlan]);

  useEffect(() => {
    localStorage.setItem("pendingTxid", txid);
  }, [txid]);

  const handleSubmitPayment = async () => {
    if (!txid.trim()) {
      setMessage("Please enter the transaction hash (TXID).");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/submit-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          package: selectedPlan,
          txid: txid.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Payment submitted. Awaiting verification. You’ll be notified when approved.");
      } else {
        setMessage(data.error || "Failed to submit payment. Please try again or contact support.");
      }
    } catch (e) {
      console.error("Submit payment error:", e);
      setMessage("Network error submitting payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 700,
        margin: "0 auto",
        color: "#fff",
        fontFamily:
          "-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Upgrade Required</h2>
      <p style={{ fontSize: 16 }}>
        Current package: <strong>{status.package}</strong>.{" "}
        {status.package === "trial" && status.expired
          ? "Your trial expired."
          : "You’ve exhausted your quota."}
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        {["Starter", "Pro", "Elite"].map((plan) => (
          <div
            key={plan}
            onClick={() => setSelectedPlan(plan)}
            style={{
              flex: "1 1 200px",
              border: selectedPlan === plan ? "2px solid #6c63ff" : "1px solid #444",
              padding: 16,
              borderRadius: 8,
              cursor: "pointer",
              background: selectedPlan === plan ? "#1f1b44" : "#1c1f38",
              position: "relative",
              minWidth: 160,
            }}
          >
            <h3 style={{ marginTop: 0, color: "#fff" }}>
              {plan} – {planPrices[plan]}
            </h3>
            <p style={{ margin: 0, color: "#ddd" }}>
              {plan === "Starter" && "5 requests/week"}
              {plan === "Pro" && "10 requests/week + priority"}
              {plan === "Elite" && "Unlimited access + live call"}
            </p>
            {selectedPlan === plan && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "#6c63ff",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  color: "#fff",
                }}
              >
                Selected
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <p>
          <strong>Payment method:</strong> USDT (TRC20) on TRON network. Send the amount for{" "}
          <strong>{selectedPlan}</strong> to:
        </p>
        <code
          style={{
            display: "block",
            background: "#272f5d",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 8,
            userSelect: "all",
            color: "#fff",
          }}
        >
          TE6cbin6JJ5EFVFBso6stgV9HM6X2wRgrP
        </code>
        <p>After sending payment, paste the transaction hash (TXID) below for verification.</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Transaction hash (TXID)"
            value={txid}
            onChange={(e) => setTxid(e.target.value)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1c1f38",
              color: "#fff",
              minWidth: 250,
            }}
          />
          <button
            onClick={handleSubmitPayment}
            disabled={submitting}
            style={{
              background: "#6c63ff",
              border: "none",
              padding: "10px 16px",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            {submitting ? "Submitting..." : `Submit Payment for ${selectedPlan}`}
          </button>
        </div>
      </div>

      <div>
        <p>
          Once verified manually by admin, your plan will be activated and your access restored.
        </p>
        <p>
          Need help? Contact support: <strong>@LiveTradeDM</strong>
        </p>
      </div>

      {message && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#222645",
            borderRadius: 6,
            color: "#fff",
          }}
        >
          {message}
        </div>
      )}

      {loadingExisting && <div style={{ marginTop: 8 }}>Loading previous submission...</div>}
    </div>
  );
}
