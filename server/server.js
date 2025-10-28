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
    ADMIN_TELEGRAM_ID: !!process.env.ADMIN_TELEGRAM_ID,
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
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
// Serve uploaded files so they are accessible in the browser
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Telegram helper
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
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

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Helper: get user (no auto-create)
async function getUser(userId) {
  const { data, error, status } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && status !== 406) console.warn("getUser select:", error);
  return data || null;
}

// Helper: calculate trial status
function getPlanStatus(user) {
  if (!user) return { plan: "Unknown", status: "unknown" };

  if (user.package === "trial") {
    const now = Date.now();
    const start = new Date(user.trial_start).getTime();
    const durationHours = +process.env.TRIAL_DURATION_HOURS || 72;
    const elapsedHrs = (now - start) / 36e5;
    if (elapsedHrs > durationHours) {
      return { plan: "Trial", status: "expired" };
    } else {
      return { plan: "Trial", status: "active" };
    }
  }
  return { plan: user.package, status: "active" };
}

// Helper: enforce weekly rate limit
async function checkAndIncrement(userId) {
  const user = await getUser(userId);
  if (!user) return { allowed: false, limit: 0, notFound: true };
  const now = Date.now();
  const lastReset = new Date(user.last_request_reset).getTime();
  if (now - lastReset > 7 * 24 * 60 * 60 * 1000) {
    await supabase
      .from("users")
      .update({ requests_week: 0, last_request_reset: new Date().toISOString() })
      .eq("id", userId);
    user.requests_week = 0;
  }
  let limit = 0;
  switch (user.package) {
    case "Elite":
      limit = Infinity;
      break;
    case "trial":
      limit = 15;
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
    if (!user) return res.status(404).json({ error: "User not found" });
    const { plan, status } = getPlanStatus(user);
    
    // Calculate package expiry
    let packageExpiry = null;
    if (user.package === "Elite") {
      // Ensure package_start exists; default to now for missing legacy records
      if (!user.package_start) {
        const packageStart = new Date().toISOString();
        await supabase
          .from("users")
          .update({ package_start: packageStart })
          .eq("id", user.id);
        user.package_start = packageStart;
      }
      
      const startDate = new Date(user.package_start);
      const expiryDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
      const now = new Date();
      const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      packageExpiry = {
        daysLeft: Math.max(0, daysLeft),
        expiryDate: expiryDate.toISOString(),
        isExpired: daysLeft <= 0
      };
    }
    
    // Align expired flag with Elite expiry as well, so UI correctly gates access
    const eliteExpired = !!(packageExpiry && packageExpiry.isExpired);
    const effectiveExpired = (status === "expired") || eliteExpired;
    const effectivePlanStatus = eliteExpired ? "expired" : status;

    res.json({
      trialActive: status === "active" && plan === "Trial",
      expired: effectiveExpired,
      package: plan,
      planStatus: effectivePlanStatus,
      requestsWeek: user.requests_week,
      packageExpiry: packageExpiry,
    });
  } catch (e) {
    console.error("GET /api/user error:", e);
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
    package_start: new Date().toISOString(),
    requests_week: 0,
    last_request_reset: new Date().toISOString(),
  });
  res.json({ success: true });
});

// Submit payment for verification
app.post("/api/submit-payment", async (req, res) => {
  const { userId, package: pkg, txid } = req.body;
  if (!userId || !pkg || !txid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Check if payment already exists
    const { data: existing } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("txid", txid)
      .single();

    if (existing) {
      return res.status(400).json({ error: "Payment already submitted" });
    }

    // Create new pending payment
    const { data, error } = await supabase
      .from("pending_payments")
      .insert({
        user_id: userId,
        package: pkg,
        txid: txid.trim(),
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Notify admin of new pending payment
    if (ADMIN_TELEGRAM_ID) {
      const createdAt = data?.created_at || new Date().toISOString();
      await sendTelegramMessage(
        ADMIN_TELEGRAM_ID,
        `💳 New pending payment\nUser: ${userId}\nPackage: ${pkg}\nTXID: ${txid.trim()}\nTime: ${createdAt}`,
        {
          parse_mode: "Markdown",
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: "🛠️ Open Admin Panel",
                  web_app: { url: process.env.PUBLIC_BASE_URL }
                }
              ]
            ]
          })
        }
      );
    }

    res.json({ success: true, payment: data });
  } catch (e) {
    console.error("POST /api/submit-payment error:", e);
    res.status(500).json({ error: "Failed to submit payment" });
  }
});

// Check pending payment status
app.get("/api/pending-payment", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const { data, error } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json(null);
    }

    res.json(data[0]);
  } catch (e) {
    console.error("GET /api/pending-payment error:", e);
    res.status(500).json({ error: "Failed to fetch pending payment" });
  }
});

app.post("/api/upload", upload.single("image"), async (req, res) => {
  const { userId } = req.body;
  const file = req.file;

  if (!userId || !file) {
    return res.status(400).json({ error: "Missing userId or image" });
  }

  try {
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("chat-uploads") // change to your bucket name if different
      .upload(filePath, fs.readFileSync(file.path), {
        cacheControl: "3600",
        upsert: false,
        contentType: file.mimetype
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res.status(500).json({ error: "Failed to upload to storage" });
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from("chat-uploads")
      .getPublicUrl(filePath);

    // Save to DB
    await supabase.from("images").insert({
      user_id: userId,
      file_path: publicData.publicUrl,
      uploaded_at: new Date().toISOString(),
    });

    // Clean up temp file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      filename: filePath,
      publicUrl: publicData.publicUrl
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});



// Main chat endpoint
app.post("/api/chat", async (req, res) => {
  const { userId, topic, message, imageUrl } = req.body;
  if (!userId || !topic || !message) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const userRow = await getUser(userId);
    if (!userRow) return res.status(404).json({ error: "User not found" });
    const { plan, status } = getPlanStatus(userRow);

    if (plan === "Trial" && status === "expired") {
      return res.status(403).json({ error: "Trial expired" });
    }

    // Check Elite package expiry
    if (plan === "Elite") {
      if (!userRow.package_start) {
        // Align with /api/user behavior: when Elite has no package_start,
        // initialize it to now (not trial_start) to avoid false immediate expiry.
        const packageStart = new Date().toISOString();
        await supabase
          .from("users")
          .update({ package_start: packageStart })
          .eq("id", userId);
        userRow.package_start = packageStart;
      }

      const startDate = new Date(userRow.package_start);
      const expiryDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000));
      const now = new Date();
      const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysLeft <= 0) {
        return res.status(403).json({ error: "Package expired" });
      }
    }

    const { allowed } = await checkAndIncrement(userId);
    if (!allowed) return res.status(429).json({ error: "Rate limit" });

    // fetch or create conversation
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
      image_url: imageUrl || null,
    });

    // 🧠 Skip AI generation for image uploads — handled manually in admin panel
    let aiReply = null;

    // Store admin reply — either with AI draft or placeholder
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "admin",
      content:
        aiReply ||
        "🕑 Thank you for your message. One of our specialists will reply as soon as possible.",
      image_url: null,
    });


    // Notify admin in Telegram
    if (ADMIN_TELEGRAM_ID) {
      await sendTelegramMessage(
        ADMIN_TELEGRAM_ID,
        `🆕 *New Request* from user \`${userId}\` on *${topic.replace(
          "_",
          " "
        )}*:\n>${message}`,
        { parse_mode: "Markdown" }
      );
    }

    res.json({
      reply: aiReply || "🕑 Thank you for your message. One of our specialists will reply as soon as possible.",
    });
  } catch (e) {
    console.error("POST /api/chat error:", e);
    res.status(500).json({ error: "Chat failed" });
  }
});

// Expose conversation for user side
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
    console.error("GET /api/conversation error:", e);
    res.status(500).json({ error: "Fetch conversation failed" });
  }
});

// --- Admin-only endpoints ---
app.get("/api/admin/pending-payments", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const { data, error } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error("GET /api/admin/pending-payments error:", e);
    res.status(500).json({ error: "Failed to fetch pending payments" });
  }
});

// Completed payments list
app.get("/api/admin/completed-payments", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const { data, error } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("status", "approved")
      .order("verified_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error("GET /api/admin/completed-payments error:", e);
    res.status(500).json({ error: "Failed to fetch completed payments" });
  }
});

// Approve a pending payment
app.post("/api/admin/approve-payment", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { txid, admin_notes } = req.body;
  if (!txid) return res.status(400).json({ error: "txid required" });

  try {
    const { data: pending } = await supabase
      .from("pending_payments")
      .select("*")
      .eq("txid", txid)
      .single();

    if (!pending) return res.status(404).json({ error: "Pending payment not found" });

    await supabase.from("users").upsert({
      id: pending.user_id,
      package: pending.package,
      package_start: new Date().toISOString(),
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
      pending.user_id,
      `🎉 Your *${pending.package}* plan is now active!`,
      { parse_mode: "Markdown" }
    );

    res.json({ success: true, activated: pending.package });
  } catch (e) {
    console.error("POST /api/admin/approve-payment error:", e);
    res.status(500).json({ error: "Approval failed" });
  }
});


// List all users with conversations (including trial, expired, active)
app.get("/api/admin/users-with-conversations", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, package, trial_start, last_request_reset")
      .order("trial_start", { ascending: false });

    if (error) throw error;

    // mark expired vs active and set package_start for existing Elite users
    const now = Date.now();
    const trialDuration = (+process.env.TRIAL_DURATION_HOURS || 72) * 36e5;
    const users = data.map(u => {
      let status = "active";
      if (u.package === "trial" && now - new Date(u.trial_start).getTime() > trialDuration) {
        status = "expired";
      }
      
      // Set package_start for existing Elite users who don't have it
      if (u.package === "Elite" && !u.package_start) {
        // Use trial_start as the package start date for existing Elite users
        // This gives them a realistic countdown based on when they first joined
        const packageStart = u.trial_start || new Date().toISOString();
        u.package_start = packageStart;
        
        // Update in database (async, don't wait)
        supabase
          .from("users")
          .update({ package_start: packageStart })
          .eq("id", u.id)
          .then(() => console.log(`Set package_start for user ${u.id} to ${packageStart}`))
          .catch(e => console.warn(`Failed to set package_start for user ${u.id}:`, e));
      }
      
      return { ...u, status };
    });

    res.json(users);
  } catch (e) {
    console.error("GET /api/admin/users-with-conversations error:", e);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


// Fetch conversation as admin
app.get("/api/admin/conversation", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { userId, topic } = req.query;
  if (!userId || !topic)
    return res.status(400).json({ error: "userId and topic required" });

  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!convs?.length) {
      return res.json({ conversation: null, messages: [] });
    }

    const conv = convs[0];
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    res.json({ conversation: conv, messages });
  } catch (e) {
    console.error("GET /api/admin/conversation error:", e);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Admin: generate AI draft for a user's conversation
app.post("/api/admin/generate-ai-draft", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { userId, topic } = req.body;
  if (!userId || !topic) {
    return res.status(400).json({ error: "Missing userId or topic" });
  }

  try {
    // Get latest conversation
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!convs?.length) {
      return res.json({ draft: "No conversation history available." });
    }

    const conv = convs[0];

    // Fetch messages
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    if (!messages?.length) {
      return res.status(404).json({ error: "No messages found." });
    }

    // Get the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

    if (!lastUserMsg) {
      return res.status(404).json({ error: "No user message found." });
    }

    let completion;

    // GPT-4 Vision if image_url present
    if (lastUserMsg.image_url) {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analyze this trading chart and provide insight or feedback. The user also wrote:\n\n" +
                  (lastUserMsg.content || ""),
              },
              {
                type: "image_url",
                image_url: {
                  url: lastUserMsg.image_url,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });
    } else {
      // Regular GPT-4 text completion
      const systemPrompt = {
        role: "system",
        content:
          "You are a trading support assistant. Generate a helpful, concise reply for the user based on the conversation history. Do not include greetings or sign-offs.",
      };

      const conversationMessages = messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content + (m.image_url ? `\n\nAttached chart: ${m.image_url}` : ""),
      }));

      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [systemPrompt, ...conversationMessages],
        max_tokens: 1000,
      });
    }

    const draft = completion.choices?.[0]?.message?.content || "";
    res.json({ draft });
  } catch (err) {
    console.error("❌ generate-ai-draft error:", err.message);
    console.error(err.stack); // 👈 add this
    res.status(500).json({ error: "Failed to generate AI draft" });
  }
});



// Admin: respond & notify user
app.post("/api/admin/respond", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { userId, topic, reply, markFinal } = req.body;
  if (!userId || !topic || !reply)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("topic", topic)
      .order("created_at", { ascending: false })
      .limit(1);

    let conv = convs[0];
    if (!conv) {
      const { data: nc } = await supabase
        .from("conversations")
        .insert({ user_id: userId, topic })
        .select()
        .single();
      conv = nc;
    }

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "admin",
      content: reply,
      is_final: !!markFinal,
    });

    await sendTelegramMessage(
      userId,
      `🔔 You have a new support reply. Open the app to view.`,
      { parse_mode: "Markdown" }
    );

    await sendTelegramMessage(
      userId,
      `✉️ *Support Reply*\n\n${reply}`,
      { parse_mode: "Markdown" }
    );

    await sendTelegramMessage(
      userId,
      `Click below to view the full chat in the app:`,
      {
        parse_mode: "Markdown",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              {
                text: "💬 Open Support App",
                web_app: { url: process.env.PUBLIC_BASE_URL }
              }
            ]
          ]
        })
      }
    );

    res.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/respond error:", e);
    res.status(500).json({ error: "Respond failed" });
  }
});

// Admin: delete a user and related data
app.post("/api/admin/delete-user", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    // Fetch conversations to delete messages
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId);

    const convIds = (convs || []).map(c => c.id);
    if (convIds.length) {
      await supabase
        .from("messages")
        .delete()
        .in("conversation_id", convIds);
    }

    // Delete conversations
    await supabase
      .from("conversations")
      .delete()
      .eq("user_id", userId);

    // Delete payments (pending/approved are in same table)
    await supabase
      .from("pending_payments")
      .delete()
      .eq("user_id", userId);

    // Delete user
    await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    // Notify admin (optional)
    if (ADMIN_TELEGRAM_ID) {
      await sendTelegramMessage(
        ADMIN_TELEGRAM_ID,
        `🗑️ User deleted\nID: ${userId}`,
        { parse_mode: "Markdown" }
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/delete-user error:", e);
    res.status(500).json({ error: "Delete user failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server listening on", PORT));
