

require("dotenv").config();


require("dotenv").config();

// defer until next tick so dotenv has injected
setImmediate(() => {
  console.log("ENV status:", {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_KEY: !!process.env.OPENAI_KEY,
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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// OpenAI client (v4+)
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Simple storage for uploaded images (could swap with Supabase Storage)
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Utility: get or create user row
async function getUser(userId) {
    // Try to fetch existing user
    const { data, error, status } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
  
    if (error && status !== 406) { // 406 means no rows found
      console.error("Supabase select error in getUser:", error);
      // You could choose to throw or proceed to upsert; we'll proceed to upsert below
    }
  
    if (data) return data;
  
    // No user found or select had a recoverable error: create/upsert
    const now = new Date().toISOString();
    const { data: upserted, error: upsertErr } = await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          trial_start: now,
          package: "trial",
          requests_week: 0,
          last_request_reset: now
        },
        { onConflict: "id" } // ensure upsert semantics
      )
      .select()
      .single();
  
    if (upsertErr) {
      console.error("Supabase upsert error in getUser:", upsertErr);
      throw upsertErr;
    }
  
    return upserted;
  }
  

// Middleware to enforce limits
async function checkAndIncrement(userId) {
  const user = await getUser(userId);
  const now = new Date();
  const lastReset = new Date(user.last_request_reset);
  // reset weekly counts if >7 days passed
  if ((now - lastReset) > 7 * 24 * 60 * 60 * 1000) {
    await supabase
      .from("users")
      .update({ requests_week: 0, last_request_reset: now.toISOString() })
      .eq("id", userId);
    user.requests_week = 0;
  }
  // determine limit
  let limit;
  if (user.package === "Elite") limit = Infinity;
  else if (user.package === "Pro") limit = parseInt(process.env.PRO_WEEKLY_LIMIT || "10", 10);
  else if (user.package === "Starter") limit = parseInt(process.env.STARTER_WEEKLY_LIMIT || "5", 10);
  else if (user.package === "trial") limit = parseInt(process.env.STARTER_WEEKLY_LIMIT || "5", 10); // trial gets Starter-level
  else limit = 0;

  if (user.requests_week >= limit) return { allowed: false, limit };

  // increment
  await supabase
    .from("users")
    .update({ requests_week: user.requests_week + 1 })
    .eq("id", userId);
  return { allowed: true, limit };
}

// Endpoint: get user status
app.get("/api/user/:id", async (req, res) => {
  const user = await getUser(req.params.id);
  const now = new Date();
  const trialStart = new Date(user.trial_start);
  const elapsedHours = (now - trialStart) / (1000 * 60 * 60);
  const trialActive = user.package === "trial" && elapsedHours < parseInt(process.env.TRIAL_DURATION_HOURS || "24", 10);
  const expired = user.package === "trial" && !trialActive;
  res.json({
    trialActive,
    expired,
    package: user.package,
    requestsWeek: user.requests_week
  });
});

// Start trial (1-day)
app.post("/api/start-trial", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const now = new Date().toISOString();
  await supabase
    .from("users")
    .upsert({
      id: userId,
      trial_start: now,
      package: "trial",
      requests_week: 0,
      last_request_reset: now
    });
  res.json({ success: true });
});

// Manual activation (after USDT payment)
app.post("/api/activate", async (req, res) => {
  const { userId, package: pkg } = req.body; // "Starter","Pro","Elite"
  if (!userId || !pkg) return res.status(400).json({ error: "Missing userId or package" });
  await supabase
    .from("users")
    .upsert({
      id: userId,
      package: pkg,
      requests_week: 0,
      last_request_reset: new Date().toISOString()
    });
  res.json({ success: true });
});

// Upload image
app.post("/api/upload", upload.single("image"), async (req, res) => {
  const userId = req.body.userId;
  const file = req.file;
  if (!userId || !file) return res.status(400).json({ error: "Missing userId or image" });
  await supabase.from("images").insert({
    user_id: userId,
    file_path: file.filename,
    uploaded_at: new Date().toISOString()
  });
  res.json({ success: true, filename: file.filename });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { userId, topic, message, imageDescription } = req.body;
  if (!userId || !topic || !message) return res.status(400).json({ error: "Missing required fields" });

  // enforce trial/subscription & limits
  const userRow = await getUser(userId);
  // trial expiry logic
  if (userRow.package === "trial") {
    const now = new Date();
    const trialStart = new Date(userRow.trial_start);
    if ((now - trialStart) > (parseInt(process.env.TRIAL_DURATION_HOURS || "24", 10) * 60 * 60 * 1000)) {
      return res.status(403).json({ error: "Trial expired" });
    }
  }

  const { allowed, limit } = await checkAndIncrement(userId);
  if (!allowed) {
    return res.status(429).json({ error: "Request limit reached", limit });
  }

  // Build GPT prompt sequence
  const promptBuilder = prompts[topic];
  if (!promptBuilder) return res.status(400).json({ error: "Unknown topic" });

  const messages = promptBuilder(message, imageDescription || "");

  // Call OpenAI (v4+ API)
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages
    });

    const reply = completion.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: "No reply from OpenAI" });
    }
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "OpenAI request failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server listening on", PORT));
