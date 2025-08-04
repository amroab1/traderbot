// app/src/screens/Chat.jsx
import React, { useState, useEffect, useRef } from "react";
import { chat, uploadImage } from "../api.js"; // ensure these are exported

const topicTitles = {
  trade_setup: "Trade Setup Review",
  account_health: "Account Health Check",
  psychology: "Psychology Support",
  funded_account: "Funded Account Advice",
  margin_call: "Margin Call Emergency",
};

export default function Chat({
  userId,
  topic,
  onBack,
  status,
  onLimitExceeded,
  onStatusRefresh,
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]); // { role: "user"|"ai", text, image? }
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const [usageInfo, setUsageInfo] = useState(null);
  const [isWarmed, setIsWarmed] = useState(false);

  // Pre-warm user row so first chat doesn't race
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await fetch(
          `${import.meta.env.VITE_API_URL || "https://server-production-dd28.up.railway.app"}/api/user/${encodeURIComponent(
            userId
          )}`
        );
      } catch (e) {
        console.warn("Pre-warm user failed:", e);
      } finally {
        setIsWarmed(true);
      }
    })();
  }, [userId]);

  // refresh parent status if provided
  useEffect(() => {
    if (onStatusRefresh) onStatusRefresh();
  }, []);

  // scroll to bottom when history updates
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current?.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  // compute usage info
  useEffect(() => {
    if (status) {
      const limits = {
        trial: parseInt(import.meta.env.VITE_STARTER_WEEKLY_LIMIT || "5", 10),
        Starter: parseInt(import.meta.env.VITE_STARTER_WEEKLY_LIMIT || "5", 10),
        Pro: parseInt(import.meta.env.VITE_PRO_WEEKLY_LIMIT || "10", 10),
        Elite: Infinity,
      };
      const limit = limits[status.package] ?? 0;
      setUsageInfo({
        used: status.requestsWeek,
        limit,
      });
      if (limit !== Infinity && status.requestsWeek >= limit && onLimitExceeded) {
        onLimitExceeded();
      }
    }
  }, [status]);

  const handleAttach = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !image) return;
    setError(null);
    setSending(true);

    const userMessage = input.trim();
    // optimistic user bubble
    setHistory((h) => [
      ...h,
      {
        role: "user",
        text: userMessage || "(image only)",
        image: image ? URL.createObjectURL(image) : null,
      },
    ]);
    setInput("");

    let imageDescription = "";

    const doChatRequest = async () => {
      if (image) {
        const form = new FormData();
        form.append("image", image);
        form.append("userId", userId);
        try {
          const up = await uploadImage(form);
          imageDescription = `Uploaded image filename: ${up.data.filename}`;
        } catch (e) {
          console.warn("Image upload failed:", e);
        }
      }

      try {
        const res = await chat({
          userId,
          topic,
          message: userMessage || "(image only)",
          imageDescription,
        });

        if (res.data?.reply) {
          setHistory((h) => [...h, { role: "ai", text: res.data.reply }]);
          return;
        }
        if (res.data?.error) {
          throw new Error(res.data.error);
        }
        throw new Error("Unknown response from server");
      } catch (err) {
        throw err;
      }
    };

    try {
      await doChatRequest();
    } catch (firstErr) {
      console.warn("First attempt failed:", firstErr);
      await new Promise((r) => setTimeout(r, 500));
      try {
        await doChatRequest();
      } catch (secondErr) {
        console.error("Second attempt failed:", secondErr);
        setError(secondErr.message || "Failed to send. Try again.");
      }
    } finally {
      setSending(false);
      setImage(null);
      if (onStatusRefresh) onStatusRefresh();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f111a",
        color: "#fff",
        fontFamily:
          "-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          gap: 12,
          position: "sticky",
          top: 0,
          background: "#0f111a",
          zIndex: 10,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
            padding: 8,
            marginRight: 4,
          }}
          aria-label="Back"
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {topicTitles[topic] || topic.replace(/_/g, " ").toUpperCase()}
          </div>
        </div>
        {usageInfo && (
          <div
            style={{
              background: "#1f2255",
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {status?.package} • Used {usageInfo.used} /{" "}
              {usageInfo.limit === Infinity ? "∞" : usageInfo.limit}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          scrollBehavior: "smooth",
        }}
      >
        {history.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: m.role === "ai" ? "row" : "row-reverse",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: "50%",
                background: m.role === "ai" ? "#6c63ff" : "#444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: "600",
                color: "#fff",
              }}
            >
              {m.role === "ai" ? "AI" : "You"}
            </div>
            <div
              style={{
                maxWidth: "100%",
                background: m.role === "ai" ? "#1f2255" : "#1e1f2f",
                padding: "12px 16px",
                borderRadius: 12,
                position: "relative",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                flex: 1,
              }}
            >
              {m.text && <div>{m.text}</div>}
              {m.image && (
                <div style={{ marginTop: 8 }}>
                  <img
                    src={m.image}
                    alt="uploaded"
                    style={{
                      maxWidth: "100%",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div
            style={{
              textAlign: "center",
              opacity: 0.8,
              fontSize: 12,
              marginTop: 8,
            }}
          >
            Sending...
          </div>
        )}
        {error && (
          <div
            style={{
              background: "#ff4d4f",
              padding: "8px 12px",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
              maxWidth: 500,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "#0f111a",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {image && (
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              background: "#1f224f",
              padding: 8,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 6,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <img
                src={URL.createObjectURL(image)}
                alt="preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{image.name}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {Math.round(image.size / 1024)} KB
              </div>
            </div>
            <button
              onClick={() => setImage(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: 20,
                padding: 4,
              }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        )}

        <textarea
          aria-label="Your message"
          placeholder="Describe your setup or feeling..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            resize: "none",
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#1e1f2f",
            color: "#fff",
            fontSize: 14,
            outline: "none",
            overflow: "auto",
            boxSizing: "border-box",
            minHeight: 64,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              background: "#2a2f7f",
              padding: "10px 16px",
              borderRadius: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Attach
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleAttach}
            />
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={handleSend}
              disabled={
                sending || ((!input.trim() && !image) || !isWarmed)
              }
              style={{
                background: "#6c63ff",
                border: "none",
                padding: "12px 24px",
                borderRadius: 14,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                color: "#fff",
                minWidth: 100,
                opacity: sending ? 0.8 : 1,
                position: "relative",
              }}
            >
              {sending
                ? "Sending..."
                : !isWarmed
                ? "Preparing..."
                : "Send"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          {status?.package} plan • Used {status?.requestsWeek} /{" "}
          {status?.package === "Elite" ? "∞" : usageInfoText(status)}
        </div>
      </div>
    </div>
  );
}

function usageInfoText(status) {
  if (!status) return "";
  const limits = {
    trial: parseInt(import.meta.env.VITE_STARTER_WEEKLY_LIMIT || "5", 10),
    Starter: parseInt(import.meta.env.VITE_STARTER_WEEKLY_LIMIT || "5", 10),
    Pro: parseInt(import.meta.env.VITE_PRO_WEEKLY_LIMIT || "10", 10),
    Elite: Infinity,
  };
  const limit = limits[status.package] ?? 0;
  return limit === Infinity ? `${status.requestsWeek} / ∞` : `${status.requestsWeek} / ${limit}`;
}
