// app/src/App.jsx
import React, { useEffect, useState } from "react";
import { getUser, startTrial } from "./api.js";
import Menu from "./screens/Menu.jsx";
import Chat from "./screens/Chat.jsx";
import Upgrade from "./screens/Upgrade.jsx";

const LIMITS = {
  trial: 15,
  Elite: Infinity,
};

export default function App() {
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [topic, setTopic] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [error, setError] = useState(null);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);

  useEffect(() => {
    let resolved = false;

    const proceed = async (uid) => {
      setUserId(uid);
      try {
        const res = await getUser(uid);
        setStatus(res.data);
      } catch (e) {
        console.error("Failed to fetch user status:", e);
        setError("Failed to fetch user status.");
      }
    };

    const initialize = () => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.expand?.();
        if (tg.initDataUnsafe?.user?.id) {
          resolved = true;
          proceed(String(tg.initDataUnsafe.user.id));
          return;
        }
        // Poll for a short time
        setWaitingForTelegram(true);
        const interval = setInterval(() => {
          if (tg.initDataUnsafe?.user?.id) {
            clearInterval(interval);
            setWaitingForTelegram(false);
            resolved = true;
            proceed(String(tg.initDataUnsafe.user.id));
          }
        }, 200);
        setTimeout(() => {
          if (!resolved) {
            clearInterval(interval);
            setWaitingForTelegram(false);
            // fallback for local/dev
            proceed("12345");
          }
        }, 2000);
      } else {
        // Not inside Telegram, fallback
        proceed("12345");
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (!status) return;
    const limit = LIMITS[status.package] ?? 0;
    if (
      (status.package === "trial" && status.expired) ||
      (limit !== Infinity && status.requestsWeek >= limit)
    ) {
      setShowUpgrade(true);
    } else {
      setShowUpgrade(false);
    }
  }, [status]);

  const refreshStatus = async () => {
    if (!userId) return;
    try {
      const res = await getUser(userId);
      setStatus(res.data);
    } catch (e) {
      console.error("Refresh status failed", e);
    }
  };

  if (waitingForTelegram) {
    return <div style={{ padding: 20 }}>Waiting for Telegram context...</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!status) {
    return <div style={{ padding: 20 }}>Loading user status...</div>;
  }

  // Upgrade screen takes priority
  if (showUpgrade) {
    return <Upgrade userId={userId} status={status} onActivated={refreshStatus} />;
  }

  // If topic selected, show chat
  if (topic) {
    return (
      <Chat
        userId={userId}
        topic={topic}
        onBack={() => setTopic(null)}
        onLimitExceeded={() => setShowUpgrade(true)}
        status={status}
        onStatusRefresh={refreshStatus}
      />
    );
  }

  // If trial not active, show start trial CTA
  if (status.package === "trial" && !status.trialActive) {
    return (
      <div style={{ padding: 20, textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 20, lineHeight: 1.3 }}>
          🚨 Welcome to LiveTrade DM
        </h1>
        <div style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 30, color: "#e0e0e0" }}>
          <p style={{ marginBottom: 16 }}>
            Your 24/7 hotline when the market turns against you.
          </p>
          <p style={{ marginBottom: 16 }}>
            Get instant help from real trading experts — anytime you panic, hesitate, or face tough decisions.
          </p>
          <p style={{ marginBottom: 20, fontWeight: 600 }}>
            Stay calm, stay in control.
          </p>
          <p style={{ fontSize: 18, color: "#6c63ff", fontWeight: 600 }}>
            🎁 Claim your 3-day free trial now.
          </p>
        </div>
        <button
          onClick={async () => {
            await startTrial(userId);
            await refreshStatus();
          }}
          style={{
            background: "#6c63ff",
            color: "#fff",
            border: "none",
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "20px"
          }}
        >
          Start Trial
        </button>
        <div style={{ marginTop: 20 }}>
          <button 
            onClick={() => setTopic("trade_setup")}
            style={{
              background: "transparent",
              color: "#6c63ff",
              border: "1px solid #6c63ff",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            Go to Trade Setup Review
          </button>
        </div>
      </div>
    );
  }

  // Otherwise show service menu
  return (
    <Menu
      status={status}
      onSelectTopic={(t) => {
        setTopic(t);
      }}
    />
  );
}
