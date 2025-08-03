import React, { useState } from "react";
import { chat, uploadImage } from "../api";

export default function Chat({ userId, topic, onBack, onLimitExceeded }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    if (!input.trim() && !image) return; // nothing to send
    setLoading(true);
    setError(null);
    let imageDescription = "";

    try {
      if (image) {
        const form = new FormData();
        form.append("image", image);
        form.append("userId", userId);
        const up = await uploadImage(form);
        // depending on your backend response shape
        const filename = up?.filename || up?.data?.filename;
        imageDescription = filename
          ? `Uploaded image: ${filename}`
          : "Uploaded image attached";
      }

      const res = await chat({
        userId,
        topic,
        message: input,
        imageDescription,
      });

      // push to history
      setHistory((h) => [
        ...h,
        { role: "user", text: input },
        { role: "ai", text: res?.reply || res?.data?.reply || "" },
      ]);
      setInput("");
      setImage(null);
    } catch (err) {
      console.error("Chat error:", err);
      const msg = err?.error || (err?.response?.data && err.response.data.error);
      setError(msg || "Something went wrong.");
      if (msg === "Trial expired" || msg === "Request limit reached") {
        onLimitExceeded && onLimitExceeded();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {onBack && (
          <button onClick={onBack} aria-label="back">
            ← Back
          </button>
        )}
        <h2 style={{ margin: 0 }}>{topic.replace(/_/g, " ").toUpperCase()}</h2>
      </div>

      <div style={{ margin: "12px 0" }}>
        {history.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "8px 0",
              padding: 8,
              background: m.role === "ai" ? "#f0f0f0" : "#e6f7ff",
              borderRadius: 6,
            }}
          >
            <strong>{m.role === "user" ? "You:" : "AI:"}</strong>{" "}
            <span>{m.text}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          placeholder="Describe your setup..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          disabled={loading}
          style={{ width: "100%", padding: 8, borderRadius: 4 }}
        />

        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
            disabled={loading}
          />
        </div>

        <button
          onClick={send}
          disabled={loading || (!input.trim() && !image)}
          style={{ padding: "10px 16px", cursor: "pointer" }}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
