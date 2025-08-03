import React, { useEffect, useState } from "react";
import { getUser, startTrial, chat } from "./api.js";

export default function App() {
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.warn("Not running inside Telegram WebApp");
      // for local dev you can mock:
      window.Telegram = {
        WebApp: {
          expand: () => {},
          initDataUnsafe: { user: { id: "12345" } },
        },
      };
    }
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    const uid = String(user.id);
    setUserId(uid);

    (async () => {
      const s = await getUser(uid);
      setStatus(s.data);
    })();
  }, []);

  const handleChat = async () => {
    if (!userId) return;
    const res = await chat({
      userId,
      topic: "trade_setup",
      message: "Test trade message",
      imageDescription: "",
    });
    setReply(res.data.reply || res.reply);
  };

  if (!status) return <div>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Package: {status.package}</h1>
      <p>Trial active: {String(status.trialActive)}</p>
      <button onClick={() => startTrial(userId)}>Start Trial</button>
      <div style={{ marginTop: 20 }}>
        <button onClick={handleChat}>Send Test Chat</button>
        {reply && (
          <div style={{ marginTop: 10 }}>
            <strong>GPT reply:</strong>
            <div>{reply}</div>
          </div>
        )}
      </div>
    </div>
  );
}
