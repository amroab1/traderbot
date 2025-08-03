import React, { useState } from "react";
import { chat, uploadImage } from "../api";

export default function Chat({ user, topic }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [image, setImage] = useState(null);

  const send = async () => {
    let imageDescription = "";
    if (image) {
      const form = new FormData();
      form.append("image", image);
      form.append("userId", user.id);
      const up = await uploadImage(form);
      imageDescription = `Uploaded image filename: ${up.data.filename}`;
    }
    const res = await chat({
      userId: user.id,
      topic,
      message: input,
      imageDescription
    });
    setHistory((h) => [...h, { role: "user", text: input }, { role: "ai", text: res.data.reply }]);
    setInput("");
  };

  return (
    <div>
      <h2>{topic.replace("_", " ")}</h2>
      <div>
        {history.map((m, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <b>{m.role === "user" ? "You:" : "AI:"}</b> {m.text}
          </div>
        ))}
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <input type="file" onChange={(e) => setImage(e.target.files[0])} />
      <button onClick={send}>Send</button>
    </div>
  );
}
