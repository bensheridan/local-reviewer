import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

// Logger
function ts() { return new Date().toISOString().slice(11, 23); }
const log = {
  info:   (...a) => console.log (`[${ts()}] ℹ️  `, ...a),
  ok:     (...a) => console.log (`[${ts()}] ✅ `, ...a),
  warn:   (...a) => console.warn(`[${ts()}] ⚠️  `, ...a),
  error:  (...a) => console.error(`[${ts()}] ❌ `, ...a),
  req:    (...a) => console.log (`[${ts()}] →  `, ...a),
  stream: (...a) => console.log (`[${ts()}] 〰️  `, ...a),
};

// Startup check
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  log.error("ANTHROPIC_API_KEY is not set in server/.env !");
  log.error("Copy server/.env.example to server/.env and add your key.");
} else {
  log.ok(`API key loaded: sk-ant-...${apiKey.slice(-6)}`);
}

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));

// Request logger
app.use((req, _res, next) => {
  const q = Object.keys(req.query).length ? JSON.stringify(req.query) : "";
  log.req(`${req.method} ${req.path} ${q}`);
  next();
});

const client = new Anthropic({ apiKey });

// List files
app.get("/api/files", (req, res) => {
  const dirPath = req.query.path || process.cwd();
  try {
    const resolved = path.resolve(dirPath);
    log.info(`Listing: ${resolved}`);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith(".") || e.name === ".git")
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(resolved, e.name),
        ext: e.isDirectory() ? null : path.extname(e.name).slice(1),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    log.ok(`Listed ${items.length} items`);
    res.json({ path: resolved, items });
  } catch (err) {
    log.error(`listFiles: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Read file
app.get("/api/file", (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "path required" });
  try {
    const content = fs.readFileSync(path.resolve(filePath), "utf-8");
    log.ok(`Read: ${filePath} (${content.length} chars)`);
    res.json({ content, path: filePath });
  } catch (err) {
    log.error(`readFile: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git diff
app.get("/api/git/diff", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  const target = req.query.target || "HEAD";
  try {
    const resolved = path.resolve(repoPath);
    const { stdout } = await execAsync(`git diff ${target}`, { cwd: resolved });
    log.ok(`git diff: ${stdout.length} chars`);
    res.json({ diff: stdout, path: resolved });
  } catch (err) {
    log.error(`git diff: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git staged
app.get("/api/git/staged", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  try {
    const resolved = path.resolve(repoPath);
    const { stdout } = await execAsync("git diff --staged", { cwd: resolved });
    log.ok(`git staged: ${stdout.length} chars`);
    res.json({ diff: stdout, path: resolved });
  } catch (err) {
    log.error(`git staged: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git log
app.get("/api/git/log", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  try {
    const resolved = path.resolve(repoPath);
    const { stdout } = await execAsync(
      'git log --oneline -20 --pretty=format:"%H|%s|%an|%ar"',
      { cwd: resolved }
    );
    const commits = stdout.split("\n").filter(Boolean).map((line) => {
      const [hash, subject, author, date] = line.split("|");
      return { hash, subject, author, date };
    });
    log.ok(`git log: ${commits.length} commits`);
    res.json({ commits });
  } catch (err) {
    log.error(`git log: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git show commit
app.get("/api/git/commit", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  const hash = req.query.hash;
  if (!hash) return res.status(400).json({ error: "hash required" });
  try {
    const resolved = path.resolve(repoPath);
    const { stdout } = await execAsync(`git show ${hash}`, { cwd: resolved });
    log.ok(`git show ${hash}: ${stdout.length} chars`);
    res.json({ diff: stdout });
  } catch (err) {
    log.error(`git show: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Claude streaming review
app.post("/api/review", async (req, res) => {
  const { messages, systemPrompt, reviewContext } = req.body;

  log.info(`Review — ${messages?.length ?? 0} messages, ${reviewContext?.files?.length ?? 0} files, diff: ${reviewContext?.diff ? reviewContext.diff.length + " chars" : "none"}`);

  if (!apiKey) {
    log.error("Cannot call Claude — API key missing");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in server/.env" });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    log.error("No messages in request body");
    return res.status(400).json({ error: "messages array is required" });
  }

  messages.forEach((m, i) => {
    const preview = String(m.content || "").slice(0, 100);
    log.info(`  msg[${i}] ${m.role}: ${preview}${m.content?.length > 100 ? "…" : ""}`);
  });

  const system = systemPrompt || buildDefaultSystemPrompt(reviewContext);
  log.info(`System prompt: ${system.length} chars`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    log.stream("Opening Claude stream…");

    const stream = client.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 8096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    let charCount = 0;

    stream.on("text", (text) => {
      charCount += text.length;
      if (charCount <= text.length) log.stream("First tokens received ✨");
      res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
    });

    stream.on("message", (msg) => {
      log.ok(`Stream done — ${charCount} chars, stop: ${msg.stop_reason}`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    });

    stream.on("error", (err) => {
      log.error(`Stream error: ${err.message}`);
      log.error(`Full error:`, JSON.stringify(err, null, 2));
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.end();
    });

  } catch (err) {
    log.error(`Failed to start stream: ${err.message}`);
    log.error(`Stack:`, err.stack);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  }
});

function buildDefaultSystemPrompt(context) {
  return `You are an expert code reviewer with deep knowledge of software engineering best practices, security, performance, and maintainability.

Your job is to help developers improve their code through thoughtful, constructive review.

${context?.files?.length ? `## Files Under Review\n${context.files.map((f) => `- ${f}`).join("\n")}` : ""}
${context?.diff ? `## Git Diff / Changes\n\`\`\`diff\n${context.diff.slice(0, 8000)}\n\`\`\`` : ""}

## Review Guidelines
- Be specific and actionable — reference line numbers and file names where relevant
- Categorize issues: 🔴 Critical / 🟡 Warning / 🟢 Suggestion
- Explain *why* something is an issue, not just what
- Acknowledge what's done well — positive reinforcement matters
- Consider: correctness, security, performance, readability, testability, edge cases
- Keep a collegial, constructive tone — you're a senior peer, not a gatekeeper

Format your responses in clear Markdown. When showing code, use fenced code blocks with language hints.`;
}

// Health check
app.get("/api/health", (_, res) => {
  log.info("Health check");
  res.json({ ok: true, apiKeySet: !!apiKey });
});

app.listen(PORT, () => {
  console.log(`\n🔍 Code Reviewer server → http://localhost:${PORT}`);
  console.log(`   API key: ${apiKey ? `✅ set (...${apiKey.slice(-6)})` : "❌ MISSING — add to server/.env"}`);
  console.log(`   CORS:    http://localhost:5173\n`);
});

// ─── Setup Routes ─────────────────────────────────────────────────────────────

// Check if API key is configured
app.get("/api/setup/status", (_req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  res.json({ configured: !!key, preview: key ? `sk-ant-...${key.slice(-6)}` : null });
});

// Save API key to server/.env and reload
app.post("/api/setup/key", async (req, res) => {
  const { apiKey: newKey } = req.body;
  if (!newKey || typeof newKey !== "string") {
    return res.status(400).json({ error: "apiKey is required" });
  }
  if (!newKey.startsWith("sk-ant-")) {
    return res.status(400).json({ error: "Invalid key format — Anthropic API keys start with sk-ant-" });
  }

  // Validate the key actually works before saving
  log.info("Validating API key with Anthropic...");
  try {
    const testClient = new Anthropic({ apiKey: newKey });
    await testClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }],
    });
    log.ok("API key validated successfully");
  } catch (err) {
    log.error(`API key validation failed: ${err.message}`);
    return res.status(401).json({ error: `Key validation failed: ${err.message}` });
  }

  // Write to server/.env
  const envPath = new URL(".env", import.meta.url).pathname;
  try {
    let existing = "";
    try { existing = fs.readFileSync(envPath, "utf-8"); } catch {}
    
    if (existing.includes("ANTHROPIC_API_KEY=")) {
      existing = existing.replace(/ANTHROPIC_API_KEY=.*/g, `ANTHROPIC_API_KEY=${newKey}`);
    } else {
      existing = existing.trimEnd() + `\nANTHROPIC_API_KEY=${newKey}\n`;
    }
    fs.writeFileSync(envPath, existing, "utf-8");
    log.ok(`Saved API key to ${envPath}`);
  } catch (err) {
    log.error(`Failed to write .env: ${err.message}`);
    return res.status(500).json({ error: `Could not write .env file: ${err.message}` });
  }

  // Hot-reload the key in this process
  process.env.ANTHROPIC_API_KEY = newKey;
  // Re-init client with new key
  Object.assign(client, new Anthropic({ apiKey: newKey }));

  log.ok("API key updated and reloaded — no restart needed");
  res.json({ ok: true, preview: `sk-ant-...${newKey.slice(-6)}` });
});

// Remove API key
app.delete("/api/setup/key", (_req, res) => {
  const envPath = new URL(".env", import.meta.url).pathname;
  try {
    let existing = "";
    try { existing = fs.readFileSync(envPath, "utf-8"); } catch {}
    existing = existing.replace(/ANTHROPIC_API_KEY=.*/g, "ANTHROPIC_API_KEY=");
    fs.writeFileSync(envPath, existing, "utf-8");
    process.env.ANTHROPIC_API_KEY = "";
    log.ok("API key removed");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
