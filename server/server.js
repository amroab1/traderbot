// server/server.js
require("dotenv").config();

// Crash visibility
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

// Deferred env log
setImmediate(() => {
  console.log("ENV status:", {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_KEY: !!process.env.OPENAI_KEY,
    OPENAI_MODEL: !!process.env.OPENAI_MODEL,
    VISION_MODEL: !!process.env.VISION_MODEL,
    PUBLIC_BASE_URL: !!process.env.PUBLIC_BASE_URL,
    BOT_TOKEN: !!process.env.BOT_TOKEN,
    ADMIN_SECRET: !!process.env.ADMIN_SECRET,
    PORT: process.env.PORT,
  });
});

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = global.fetch || require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prompts = require("./prompts");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health probe
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Telegram helper for notifications
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
async function sendTelegramMessage(chatId, text, options = {}) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body = { chat_id: chatId, text, ...options };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await resp.json();
    if (!j.ok) console.warn("Telegram send failed:", j);
  } catch (e) {
    console.error("Telegram send error:", e);
  }
}

// Upload setup
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Utils
async function getUser(userId) {
  const { data, error, status } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && status !== 406) {
    console.warn("getUser select warning:", error);
  }
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

  if (upsertErr) {
    console.error("getUser upsert error:", upsertErr);
    throw upsertErr;
  }
  return upserted;
}

async function checkAndIncrement(userId) {
  const user = await getUser(userId);
  const now = new Date();
  const lastReset = new Date(user.last_request_reset);
  if ((now - lastReset) > 7 * 24 * 60 * 60 * 1000) {
    await supabase
      .from("users")
      .update({ requests_week: 0, last_request_reset: now.toISOString() })
      .eq("id", userId);
    user.requests_week = 0;
  }

  let limit;
  switch (user.package) {
    case "Elite":
      limit = Infinity;
      break;
    case "Pro":
      limit = parseInt(process.env.PRO_WEEKLY_LIMIT || "10", 10);
      break;
    case "Starter":
      limit = parseInt(process.env.STARTER_WEEKLY_LIMIT || "5", 10);
      break;
    case "trial":
      limit = parseInt(process.env.STARTER_WEEKLY_LIMIT || "5", 10);
      break;
    default:
      limit = 0;
  }

  if (user.requests_week >= limit) return { allowed: false, limit };

  await supabase
    .from("users")
    .update({ requests_week: user.requests_week + 1 })
    .eq("id", userId);

  return { allowed: true, limit };
}

function sanitizeReply(text) {
  if (!text) return text;
  const lines = text
    .split("\n")
    .filter(
      (l) =>
        !/As an AI/i.test(l) &&
        !/I('?| cannot| can’t) (assist with|view|see) images?/.test(l)
    );
  return lines.join("\n").trim();
}

// Simple echo for diagnostics
app.post("/api/test-echo", (req, res) => {
  console.log("ECHO /api/test-echo", req.body);
  res.json({ received: req.body });
});

// Get user status
app.get("/api/user/:id", async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    const now = new Date();
    const trialStart = new Date(user.trial_start);
    const elapsedHours = (now - trialStart) / (1000 * 60 * 60);
    const trialActive =
      user.package === "trial" &&
      elapsedHours < parseInt(process.env.TRIAL_DURATION_HOURS || "24", 10);
    const expired = user.package === "trial" && !trialActive;
    res.json({
      trialActive,
      expired,
      package: user.package,
      requestsWeek: user.requests_week,
    });
  } catch (e) {
    console.error("GET /api/user error:", e);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Start trial
app.post("/api/start-trial", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const now = new Date().toISOString();
    await supabase.from("users").upsert({
      id: userId,
      trial_start: now,
      package: "trial",
      requests_week: 0,
      last_request_reset: now,
    });
    res.json({ success: true });
  } catch (e) {
    console.error("POST /api/start-trial error:", e);
    res.status(500).json({ error: "Failed to start trial" });
  }
});

// Activate package manually
app.post("/api/activate", async (req, res) => {
  const { userId, package: pkg } = req.body;
  if (!userId || !pkg)
    return res.status(400).json({ error: "Missing userId or package" });
  try {
    await supabase.from("users").upsert({
      id: userId,
      package: pkg,
      requests_week: 0,
      last_request_reset: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error("POST /api/activate error:", e);
    res.status(500).json({ error: "Activation failed" });
  }
});

// Upload image
app.post("/api/upload", upload.single("image"), async (req, res) => {
  const userId = req.body.userId;
  const file = req.file;
  if (!userId || !file)
    return res.status(400).json({ error: "Missing userId or image" });
  try {
    await supabase.from("images").insert({
      user_id: userId,
      file_path: file.filename,
      uploaded_at: new Date().toISOString(),
    });

    const base =
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${base}/uploads/${file.filename}`;

    res.json({ success: true, filename: file.filename, url: fileUrl });
  } catch (e) {
    console.error("POST /api/upload error:", e);
    res.status(500).json({ error: "Image upload failed" });
  }
});

// Chat endpoint (hardened + defensive response)
// Chat endpoint (simplified response send)
app.post("/api/chat", async (req, res) => {
  const { userId, topic, message, imageFilename } = req.body;
  console.log("Incoming /api/chat", { userId, topic, message, imageFilename });

  if (!userId || !topic || !message) {
    console.warn("Validation failed: missing fields", { userId, topic, message });
    return res.status(400).json({ error: "Missing required fields: userId, topic, message" });
  }

  let userRow;
  try {
    userRow = await getUser(userId);
    console.log("User row:", { id: userRow.id, package: userRow.package });
  } catch (err) {
    console.error("getUser failed:", err);
    return res.status(500).json({ error: "User lookup failed" });
  }

  if (userRow.package === "trial") {
    const now = new Date();
    const trialStart = new Date(userRow.trial_start);
    if (
      now - trialStart >
      parseInt(process.env.TRIAL_DURATION_HOURS || "24", 10) * 60 * 60 * 1000
    ) {
      console.log("Trial expired for", userId);
      return res.status(403).json({ error: "Trial expired" });
    }
  }

  let rateCheck;
  try {
    rateCheck = await checkAndIncrement(userId);
    console.log("Rate check:", rateCheck);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: "Request limit reached", limit: rateCheck.limit });
    }
  } catch (err) {
    console.error("Rate check failed:", err);
    return res.status(500).json({ error: "Rate limit check failed" });
  }

  let imageUrl = "";
  if (imageFilename) {
    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    imageUrl = `${base}/uploads/${imageFilename}`;
  }

  if (!prompts[topic]) {
    console.warn("Unknown topic:", topic);
    return res.status(400).json({ error: "Unknown topic" });
  }

  let messages;
  try {
    messages = prompts[topic](message, imageUrl);
  } catch (err) {
    console.error("Prompt builder error:", err);
    return res.status(500).json({ error: "Prompt construction failed" });
  }

  let model = process.env.OPENAI_MODEL || "gpt-4";
  if (imageUrl && process.env.VISION_MODEL) {
    model = process.env.VISION_MODEL;
  }
  console.log("Using model:", model);

  try {
    const completion = await Promise.race([
      openai.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI request timed out")), 20000)
      ),
    ]);

    let reply = completion.choices?.[0]?.message?.content || "";
    reply = sanitizeReply(reply);
    if (reply.length > 4000) {
      reply = reply.slice(0, 4000) + "\n\n*(response truncated for stability)*";
    }
    console.log("Reply generated (truncated):", reply.slice(0, 200));

    // Use normal express response
    return res.json({ reply });
  } catch (err) {
    console.error("OpenAI error or timeout:", err);
    return res.status(500).json({
      error: err.message || "OpenAI request failed or timed out",
    });
  }
});


  // Trial expiration
  if (userRow.package === "trial") {
    const now = new Date();
    const trialStart = new Date(userRow.trial_start);
    if (
      now - trialStart >
      parseInt(process.env.TRIAL_DURATION_HOURS || "24", 10) *
        60 *
        60 *
        1000
    ) {
      console.log("Trial expired for", userId);
      return res.status(403).json({ error: "Trial expired" });
    }
  }

  // Rate limit
  let rateCheck;
  try {
    rateCheck = await checkAndIncrement(userId);
    console.log("Rate check:", rateCheck);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: "Request limit reached", limit: rateCheck.limit });
    }
  } catch (err) {
    console.error("Rate check failed:", err);
    return res.status(500).json({ error: "Rate limit check failed" });
  }

  // Build prompt (with optional image)
  let imageUrl = "";
  if (imageFilename) {
    const base =
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    imageUrl = `${base}/uploads/${imageFilename}`;
  }

  if (!prompts[topic]) {
    console.warn("Unknown topic:", topic);
    return res.status(400).json({ error: "Unknown topic" });
  }

  let messages;
  try {
    messages = prompts[topic](message, imageUrl);
  } catch (err) {
    console.error("Prompt builder error:", err);
    return res.status(500).json({ error: "Prompt construction failed" });
  }

  // Model selection
  let model = process.env.OPENAI_MODEL || "gpt-4";
  if (imageUrl && process.env.VISION_MODEL) {
    model = process.env.VISION_MODEL;
  }
  console.log("Using model:", model);

  // OpenAI call with timeout
  const openAiCall = async () => {
    return openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
    });
  };
  const timeoutMs = 20000;

  let reply = "";
  try {
    const completion = await Promise.race([
      openAiCall(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI request timed out")), timeoutMs)
      ),
    ]);

    reply = completion.choices?.[0]?.message?.content || "";
    reply = sanitizeReply(reply);
    console.log("Reply generated (truncated):", reply.slice(0, 200));
  } catch (err) {
    console.error("OpenAI error or timeout:", err);
    return res.status(500).json({
      error: err.message || "OpenAI request failed or timed out",
    });
  }

  // Defensive send
  try {
    const payload = { reply };
    const bodyStr = JSON.stringify(payload);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", Buffer.byteLength(bodyStr));
    res.write(bodyStr);
    res.end();
    console.log("Response successfully sent to client");
  } catch (err) {
    console.error("Failed to send response to client:", err);
  }
});

// Payment submission
app.post("/api/submit-payment", async (req, res) => {
  const { userId, package: pkg, txid } = req.body;
  if (!userId || !pkg || !txid)
    return res.status(400).json({ error: "userId, package, and txid required" });

  try {
    const { error } = await supabase.from("pending_payments").insert({
      user_id: userId,
      package: pkg,
      txid,
      status: "pending",
    });
    if (error) {
      console.error("pending payment insert error:", error);
      return res.status(500).json({ error: "Failed to store pending payment" });
    }

    await sendTelegramMessage(
      userId,
      `✅ Payment submission received for *${pkg}* plan.\nTXID: \`${txid}\`\nOur team will review and activate shortly.`,
      { parse_mode: "Markdown" }
    );
    res.json({
      success: true,
      message: "Payment submitted, awaiting manual verification.",
    });
  } catch (e) {
    console.error("submit-payment error:", e);
    res.status(500).json({ error: "Submission failed" });
  }
});

// Get latest pending payment
app.get("/api/pending-payment", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const { data, error } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") {
      console.warn("pending-payment fetch warning:", error);
    }
    res.json(data || {});
  } catch (e) {
    console.error("pending-payment retrieval error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: list pending payments
app.get("/api/admin/pending-payments", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const { data, error } = await supabase
      .from("pending_payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("admin pending-payments error:", error);
      return res.status(500).json({ error: "Failed to fetch pending payments" });
    }
    res.json(data);
  } catch (e) {
    console.error("admin/pending-payments error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: approve payment
app.post("/api/admin/approve-payment", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { txid, admin_notes } = req.body;
  if (!txid) return res.status(400).json({ error: "txid required" });

  try {
    const { data: pending, error: fetchErr } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("txid", txid)
      .single();
    if (fetchErr || !pending) {
      return res.status(404).json({ error: "Pending payment not found" });
    }

    const userId = pending.user_id;
    const pkg = pending.package;

    await supabase.from("users").upsert({
      id: userId,
      package: pkg,
      requests_week: 0,
      last_request_reset: new Date().toISOString(),
    });

    await supabase
      .from("pending_payments")
      .update({
        status: "approved",
        verified_at: new Date().toISOString(),
        admin_notes: admin_notes || "Manually approved",
      })
      .eq("txid", txid);

    await sendTelegramMessage(
      userId,
      `🎉 Your *${pkg}* plan has been activated. You now have access.`,
      { parse_mode: "Markdown" }
    );

    res.json({ success: true, activated: pkg });
  } catch (e) {
    console.error("approve-payment error:", e);
    res.status(500).json({ error: "Approval failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server listening on", PORT));
