// server/server.js
require("dotenv").config();

setImmediate(() => {
  console.log("ENV status:", {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_KEY: !!process.env.OPENAI_KEY,
    ADMIN_SECRET: !!process.env.ADMIN_SECRET,
    BOT_TOKEN: !!process.env.BOT_TOKEN,
    PUBLIC_BASE_URL: !!process.env.PUBLIC_BASE_URL,
    PORT: process.env.PORT,
  });
});

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prompts = require("./prompts");

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(bodyParser.json());

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Telegram helper
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
async function sendTelegramMessage(chatId, text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, ...options }),
      }
    );
    const data = await resp.json();
    if (!data.ok) console.warn("Telegram send failed:", data);
  } catch (e) {
    console.error("Telegram error:", e);
  }
}

// Uploads folder
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Helpers: get/create user, rate limit
async function getUser(userId) {
  const { data, error, status } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && status !== 406) console.warn("getUser select:", error);
  if (data) return data;
  const now = new Date().toISOString();
  const { data: upserted, error: upsertErr } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        trial_start: now,
        package: "trial",
        requests_week: 0,
        last_request_reset: now,
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (upsertErr) throw upsertErr;
  return upserted;
}

async function checkAndIncrement(userId) {
  const user = await getUser(userId);
  const now = new Date(),
    lastReset = new Date(user.last_request_reset);
  if (now - lastReset > 7 * 24 * 60 * 60 * 1000) {
    await supabase
      .from("users")
      .update({ requests_week: 0, last_request_reset: now.toISOString() })
      .eq("id", userId);
    user.requests_week = 0;
  }
  let limit = 0;
  switch (user.package) {
    case "Elite":
      limit = Infinity;
      break;
    case "Pro":
      limit = +process.env.PRO_WEEKLY_LIMIT || 10;
      break;
    case "Starter":
      limit = +process.env.STARTER_WEEKLY_LIMIT || 5;
      break;
    case "trial":
      limit = +process.env.STARTER_WEEKLY_LIMIT || 5;
      break;
  }
  if (user.requests_week >= limit) return { allowed: false, limit };
  await supabase
    .from("users")
    .update({ requests_week: user.requests_week + 1 })
    .eq("id", userId);
  return { allowed: true, limit };
}

// --- Public endpoints ---

app.get("/health", (_, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.get("/api/user/:id", async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    const now = new Date(),
      trialStart = new Date(user.trial_start),
      elapsed = (now - trialStart) / 36e5,
      trialActive =
        user.package === "trial" &&
        elapsed < +process.env.TRIAL_DURATION_HOURS || 24,
      expired = user.package === "trial" && !trialActive;
    res.json({
      trialActive,
      expired,
      package: user.package,
      requestsWeek: user.requests_week,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.post("/api/start-trial", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const now = new Date().toISOString();
  await supabase.from("users").upsert({
    id: userId,
    trial_start: now,
    package: "trial",
    requests_week: 0,
    last_request_reset: now,
  });
  res.json({ success: true });
});

app.post("/api/activate", async (req, res) => {
  const { userId, package: pkg } = req.body;
  if (!userId || !pkg)
    return res.status(400).json({ error: "Missing userId or package" });
  await supabase.from("users").upsert({
    id: userId,
    package: pkg,
    requests_week: 0,
    last_request_reset: new Date().toISOString(),
  });
  res.json({ success: true });
});

app.post("/api/upload", upload.single("image"), async (req, res) => {
  const { userId } = req.body,
    file = req.file;
  if (!userId || !file)
    return res.status(400).json({ error: "Missing userId or image" });
  await supabase.from("images").insert({
    user_id: userId,
    file_path: file.filename,
    uploaded_at: new Date().toISOString(),
  });
  res.json({ success: true, filename: file.filename });
});

// Main chat
app.post("/api/chat", async (req, res) => {
  const { userId, topic, message, imageDescription } = req.body;
  if (!userId || !topic || !message)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const userRow = await getUser(userId);
    // expire trial
    if (userRow.package === "trial") {
      const now = Date.now(),
        start = new Date(userRow.trial_start).getTime(),
        limitMs = (+process.env.TRIAL_DURATION_HOURS || 24) * 36e5;
      if (now - start > limitMs)
        return res.status(403).json({ error: "Trial expired" });
    }
    const { allowed } = await checkAndIncrement(userId);
    if (!allowed) return res.status(429).json({ error: "Rate limit" });

    // conversation storage
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);
    let conversation = convs?.[0];
    if (!conversation) {
      const { data: nc } = await supabase
        .from("conversations")
        .insert({ user_id: userId, topic })
        .select()
        .single();
      conversation = nc;
    }
    // store user message
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: message,
      image_url: null,
    });

    // run AI
    const systemPrompt = prompts[topic]?.(message, imageDescription || "");
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: systemPrompt,
    });
    const reply = completion.choices[0].message.content;
    // store AI
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "ai",
      content: reply,
      image_url: null,
    });
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Chat failed" });
  }
});

// --- New: expose conversation to user-side ---
app.get("/api/conversation", async (req, res) => {
  const { userId, topic } = req.query;
  if (!userId || !topic)
    return res.status(400).json({ error: "userId and topic required" });
  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);
    let conversation = convs?.[0];
    if (!conversation) {
      const { data: nc } = await supabase
        .from("conversations")
        .insert({ user_id: userId, topic })
        .select()
        .single();
      conversation = nc;
    }
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    res.json({ conversation, messages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Fetch conversation failed" });
  }
});

// Admin: respond (already in your flow)
app.post("/api/admin/respond", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });
  const { userId, topic, reply, markFinal } = req.body;
  if (!userId || !topic || !reply)
    return res.status(400).json({ error: "Missing fields" });
  try {
    // get conversation
    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);
    let conv = convs?.[0];
    if (!conv) {
      const { data: nc } = await supabase
        .from("conversations")
        .insert({ user_id: userId, topic })
        .select()
        .single();
      conv = nc;
    }
    // store admin message
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "admin",
      content: reply,
      is_final: !!markFinal,
    });
    // notify Telegram user
    await sendTelegramMessage(
      userId,
      `✉️ *Support Reply*\n\n${reply}`,
      { parse_mode: "Markdown" }
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Respond failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server listening on", PORT));
