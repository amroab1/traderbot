import React, { useState } from "react";
import { chat, uploadImage } from "../api.js";

const userAvatar = "🧑"; // you can replace with image URL
const aiAvatar = "🤖";

export default function Chat({
  userId,
  topic,
  onBack,
  onLimitExceeded,
  status,
  onStatusRefresh,
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    if (!input.trim() && !image) return;
    setLoading(true);
    setError(null);
    let imageDescription = "";

    try {
      if (image) {
        const form = new FormData();
        form.append("image", image);
        form.append("userId", userId);
        const up = await uploadImage(form);
        const filename = up?.data?.filename || up?.filename;
        imageDescription = filename
          ? `Uploaded image: ${filename}`
          : "Attached image";
      }

      const res = await chat({
        userId,
        topic,
        message: input,
        imageDescription,
      });

      const reply = res?.data?.reply || res.reply || "";
      setHistory((h) => [
        ...h,
        { role: "user", text: input, timestamp: Date.now() },
        { role: "ai", text: reply, timestamp: Date.now() + 1 },
      ]);
      setInput("");
      setImage(null);
      onStatusRefresh && onStatusRefresh();
    } catch (err) {
      console.error("Chat error:", err);
      const msg =
        err?.response?.data?.error || err?.error || "Failed to get response";
      setError(msg);
      if (msg === "Trial expired" || msg === "Request limit reached") {
        onLimitExceeded && onLimitExceeded();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: 800,
        margin: "0 auto",
        background: "#0f111a",
        color: "#eee",
        fontFamily:
          "-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#1f2233",
          borderBottom: "1px solid #2f3249",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
        )}
        <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>
          {topic.replace(/_/g, " ").toUpperCase()}
        </h2>
        <div
          style={{
            fontSize: 12,
            padding: "4px 10px",
            background: "#222645",
            borderRadius: 999,
          }}
        >
          {status?.package} • Used {status?.requestsWeek} /{" "}
          {status.package === "Elite" ? "∞" : topic === "Pro" ? 10 : 5}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {history.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: isUser ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: 8,
                animation: "fadein 0.3s ease",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isUser ? "#684ed6" : "#3a3f6b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#fff",
                }}
              >
                {isUser ? userAvatar : aiAvatar}
              </div>
              <div
                style={{
                  maxWidth: "80%",
                  background: isUser ? "#2f2a55" : "#1f2245",
                  padding: "12px 16px",
                  borderRadius: 16,
                  position: "relative",
                  color: "#f0f0f0",
                  fontSize: 14,
                  lineHeight: 1.4,
                  boxShadow:
                    isUser
                      ? "0 4px 16px rgba(104,78,214,0.2)"
                      : "0 4px 16px rgba(58,63,107,0.2)",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        {error && (
          <div
            style={{
              background: "#5c1f1f",
              padding: 10,
              borderRadius: 8,
              color: "#ffe3e3",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #2f3249",
          padding: "12px 16px",
          background: "#1f2233",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your setup or feeling..."
              rows={2}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                resize: "none",
                border: "1px solid #2f3249",
                background: "#1c1f38",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxShadow: "inset 0 0 8px rgba(255,255,255,0.03)",
              }}
            />
            {image && (
              <div
                style={{
                  position: "absolute",
                  top: "-24px",
                  left: 0,
                  background: "#272f5d",
                  padding: "6px 10px",
                  borderRadius: 8,
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 12,
                  color: "#c0c8ff",
                }}
              >
                <div style={{ marginRight: 6 }}>📷 {image.name}</div>
                <button
                  onClick={() => setImage(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  aria-label="remove image"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                cursor: "pointer",
                padding: "8px 12px",
                background: "#2f2a55",
                borderRadius: 8,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#fff",
              }}
            >
              Attach
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) =>
                  setImage(e.target.files ? e.target.files[0] : null)
                }
                disabled={loading}
              />
            </label>
            <button
              onClick={send}
              disabled={loading || (!input.trim() && !image)}
              style={{
                background: "#6c63ff",
                border: "none",
                padding: "10px 18px",
                borderRadius: 12,
                cursor: loading ? "default" : "pointer",
                color: "#fff",
                fontWeight: "600",
                fontSize: 14,
                minWidth: 100,
                alignSelf: "flex-end",
                boxShadow: "0 12px 24px rgba(108,99,255,0.3)",
              }}
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#888",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div>{status?.package} plan</div>
          <div>
            Used: {status?.requestsWeek} /{" "}
            {status.package === "Elite" ? "∞" : status.package === "Pro" ? 10 : 5}
          </div>
        </div>
      </div>
    </div>
  );
}
