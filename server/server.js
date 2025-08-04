// server/server.js
require("dotenv").config(); // only once

// defer until next tick so dotenv has injected (optional debug)
setImmediate(() => {
  console.log("ENV status:", {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_KEY: !!process.env.OPENAI_KEY,
    ADMIN_SECRET: !!process.env.ADMIN_SECRET,
    PORT: process.env.PORT,
  });
});

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prompts = require("./prompts");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI client (v4+)
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Simple storage for uploaded images
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Utility: get or create user row
async function getUser(userId) {
  const { data, error, status } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && status !== 406) {
    console.warn("Supabase select warning in getUser:", error);
    // continue to upsert fallback
  }

  if (data) return data;

  // create / upsert new user
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
    console.error("Supabase upsert error in getUser:", upsertErr);
    throw upsertErr;
  }

  return upserted;
}

// Middleware-style helper: enforce limits
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
      limit = parseInt(process.env.STARTER_WEEKLY_LIMIT || "5", 10); // trial = Starter level
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

// Endpoint: get user status
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

// Start trial (1-day)
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

// Manual activation (after payment)
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
    res.json({ success: true, filename: file.filename });
  } catch (e) {
    console.error("POST /api/upload error:", e);
    res.status(500).json({ error: "Image upload failed" });
  }
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { userId, topic, message, imageDescription } = req.body;
  if (!userId || !topic || !message)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const userRow = await getUser(userId);

    // trial expiry
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
        return res.status(403).json({ error: "Trial expired" });
      }
    }

    const { allowed, limit } = await checkAndIncrement(userId);
    if (!allowed) {
      return res
        .status(429)
        .json({ error: "Request limit reached", limit });
    }

    const promptBuilder = prompts[topic];
    if (!promptBuilder)
      return res.status(400).json({ error: "Unknown topic" });

    const messages = promptBuilder(message, imageDescription || "");

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: "No reply from OpenAI" });
    }

    res.json({ reply });
  } catch (err) {
    console.error("POST /api/chat error:", err);
    res
      .status(500)
      .json({ error: err?.message || "Chat processing failed" });
  }
});

// Submit payment (user side)
app.post("/api/submit-payment", async (req, res) => {
  const { userId, package: pkg, txid } = req.body;
  if (!userId || !pkg || !txid)
    return res
      .status(400)
      .json({ error: "userId, package, and txid required" });

  try {
    const { error } = await supabase.from("pending_payments").insert({
      user_id: userId,
      package: pkg,
      txid,
      status: "pending",
    });

    if (error) {
      console.error("Failed to insert pending payment:", error);
      return res
        .status(500)
        .json({ error: "Failed to store pending payment" });
    }

    // TODO: notify admin (e.g., via Telegram) about new pending payment

    res.json({
      success: true,
      message: "Payment submitted, awaiting manual verification.",
    });
  } catch (e) {
    console.error("POST /api/submit-payment error:", e);
    res.status(500).json({ error: "Submission failed" });
  }
});

// Admin: list pending payments (protected)
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
      console.error("GET pending-payments error:", error);
      return res.status(500).json({ error: "Failed to fetch pending payments" });
    }

    res.json(data);
  } catch (e) {
    console.error("GET /api/admin/pending-payments error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin: approve payment and activate user
app.post("/api/admin/approve-payment", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { txid, admin_notes } = req.body;
  if (!txid) return res.status(400).json({ error: "txid required" });

  try {
    // Fetch pending payment
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

    // Activate user
    await supabase.from("users").upsert({
      id: userId,
      package: pkg,
      requests_week: 0,
      last_request_reset: new Date().toISOString(),
    });

    // Update pending payment
    await supabase
      .from("pending_payments")
      .update({
        status: "approved",
        verified_at: new Date().toISOString(),
        admin_notes: admin_notes || "Manually approved",
      })
      .eq("txid", txid);

    res.json({ success: true, activated: pkg });
  } catch (e) {
    console.error("POST /api/admin/approve-payment error:", e);
    res.status(500).json({ error: "Approval failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server listening on", PORT));
