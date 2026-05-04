import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { WebSocketServer, WebSocket } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);

// Validate git commit hashes and refs to prevent command injection
function isValidGitRef(ref) {
  return typeof ref === "string" && /^[a-zA-Z0-9._/~^@{}:!-]+$/.test(ref) && ref.length < 256;
}
function isValidCommitHash(hash) {
  return typeof hash === "string" && /^[a-f0-9]{7,40}$/i.test(hash);
}
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

const ALLOWED_ORIGINS = [
  "http://localhost:5173", "http://localhost:5174", "http://localhost:5176",
  "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5176",
  "http://[::1]:5173",     "http://[::1]:5174",     "http://[::1]:5176",
];
app.use(cors({ origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)) }));
app.use(express.json({ limit: "10mb" }));

// Request logger
app.use((req, _res, next) => {
  const q = Object.keys(req.query).length ? JSON.stringify(req.query) : "";
  log.req(`${req.method} ${req.path} ${q}`);
  next();
});

const client = new Anthropic({ apiKey });

// Path allowlist — default to the filesystem root so any local path is reachable.
// Set ALLOWED_BASE_PATH env var to restrict to a subtree (e.g. /home/user/projects).
// path.parse(os.homedir()).root gives "C:\" on Windows and "/" on Unix/macOS.
function buildAllowedBase(rawPath) {
  const resolved = path.resolve(rawPath);
  const prefix = resolved.endsWith(path.sep) ? resolved : resolved + path.sep;
  return { exact: resolved, prefix };
}

const fsRoot = path.parse(os.homedir()).root;
const allowedBase = buildAllowedBase(process.env.ALLOWED_BASE_PATH || fsRoot);
if (!process.env.ALLOWED_BASE_PATH) {
  log.warn("File operations are allowed on the entire filesystem. Set ALLOWED_BASE_PATH to restrict access.");
}

function isPathAllowed(targetPath) {
  const resolved = path.resolve(targetPath);
  if (process.platform === "win32") {
    const lower = resolved.toLowerCase();
    return lower === allowedBase.exact.toLowerCase() || lower.startsWith(allowedBase.prefix.toLowerCase());
  }
  return resolved === allowedBase.exact || resolved.startsWith(allowedBase.prefix);
}

// List files
app.get("/api/files", (req, res) => {
  const dirPath = req.query.path || process.cwd();
  try {
    const resolved = path.resolve(dirPath);
    if (!isPathAllowed(resolved)) {
      log.warn(`Blocked path traversal attempt: ${resolved}`);
      return res.status(403).json({ error: "Access denied: path outside allowed directory" });
    }
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
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) {
      log.warn(`Blocked file read attempt: ${resolved}`);
      return res.status(403).json({ error: "Access denied: path outside allowed directory" });
    }
    const content = fs.readFileSync(resolved, "utf-8");
    log.ok(`Read: ${resolved} (${content.length} chars)`);
    res.json({ content, path: resolved });
  } catch (err) {
    log.error(`readFile: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

async function findGitRoot(fromPath) {
  const resolved = path.resolve(fromPath);
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: resolved });
    return stdout.trim();
  } catch {
    throw new Error(`Not a git repository (or any parent): ${resolved}`);
  }
}

// Git diff
app.get("/api/git/diff", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  const target = req.query.target || "HEAD";
  if (!isValidGitRef(target)) return res.status(400).json({ error: "Invalid git ref" });
  try {
    const gitRoot = await findGitRoot(repoPath);
    const { stdout } = await execFileAsync("git", ["diff", target], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    log.ok(`git diff (${gitRoot}): ${stdout.length} chars`);
    res.json({ diff: stdout, path: gitRoot });
  } catch (err) {
    log.error(`git diff: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git staged
app.get("/api/git/staged", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  try {
    const gitRoot = await findGitRoot(repoPath);
    const { stdout } = await execFileAsync("git", ["diff", "--staged"], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    log.ok(`git staged (${gitRoot}): ${stdout.length} chars`);
    res.json({ diff: stdout, path: gitRoot });
  } catch (err) {
    log.error(`git staged: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Git log
app.get("/api/git/log", async (req, res) => {
  const repoPath = req.query.path || process.cwd();
  try {
    const gitRoot = await findGitRoot(repoPath);
    const { stdout } = await execFileAsync(
      "git", ["log", "--oneline", "-20", '--pretty=format:%H|%s|%an|%ar'],
      { cwd: gitRoot }
    );
    const commits = stdout.split("\n").filter(Boolean).map((line) => {
      const [hash, subject, author, date] = line.split("|");
      return { hash, subject, author, date };
    });
    log.ok(`git log (${gitRoot}): ${commits.length} commits`);
    res.json({ commits, path: gitRoot });
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
  if (!isValidCommitHash(hash)) return res.status(400).json({ error: "Invalid commit hash" });
  try {
    const gitRoot = await findGitRoot(repoPath);
    const { stdout } = await execFileAsync("git", ["show", hash], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    log.ok(`git show ${hash}: ${stdout.length} chars`);
    res.json({ diff: stdout });
  } catch (err) {
    log.error(`git show: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Keep in sync with CLAUDE_MODELS in client/src/lib/api.ts
const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Claude streaming review
app.post("/api/review", async (req, res) => {
  const { messages, systemPrompt, reviewContext, model: requestedModel } = req.body;
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;

  log.info(`Review — model: ${model}, ${messages?.length ?? 0} messages, ${reviewContext?.files?.length ?? 0} files, diff: ${reviewContext?.diff ? reviewContext.diff.length + " chars" : "none"}`);

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
      model,
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
  res.json({ ok: true, apiKeySet: !!apiKey, githubTokenSet: !!process.env.GITHUB_TOKEN });
});

// ─── GitHub Routes ────────────────────────────────────────────────────────────

function parsePRUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error("Invalid GitHub PR URL — expected https://github.com/owner/repo/pull/123");
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "code-reviewer/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// Fetch PR metadata + file diffs
app.get("/api/github/pr", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url query param required" });

  try {
    const { owner, repo, prNumber } = parsePRUrl(url);
    log.info(`Fetching PR: ${owner}/${repo}#${prNumber}`);

    const [prRes, filesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers: githubHeaders() }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`, { headers: githubHeaders() }),
    ]);

    if (!prRes.ok) {
      const err = await prRes.json();
      throw new Error(`GitHub API ${prRes.status}: ${err.message ?? prRes.statusText}`);
    }

    const pr = await prRes.json();
    const files = filesRes.ok ? await filesRes.json() : [];

    log.ok(`PR fetched: "${pr.title}" — ${files.length} files`);
    res.json({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      base: pr.base.ref,
      head: pr.head.ref,
      author: pr.user.login,
      url: pr.html_url,
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
    });
  } catch (err) {
    log.error(`github/pr: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// Post a review to a GitHub PR
app.post("/api/github/review", async (req, res) => {
  const { prUrl, body, event: reviewEvent } = req.body;
  if (!prUrl || !body) return res.status(400).json({ error: "prUrl and body are required" });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(401).json({ error: "No GitHub token configured — add GITHUB_TOKEN to server/.env" });

  try {
    const { owner, repo, prNumber } = parsePRUrl(prUrl);
    log.info(`Posting review to ${owner}/${repo}#${prNumber} as ${reviewEvent ?? "COMMENT"}`);

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
      method: "POST",
      headers: { ...githubHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ body, event: reviewEvent ?? "COMMENT" }),
    });

    if (!ghRes.ok) {
      const err = await ghRes.json();
      throw new Error(`GitHub API ${ghRes.status}: ${err.message ?? ghRes.statusText}`);
    }

    const data = await ghRes.json();
    log.ok(`Review posted: id=${data.id}`);
    res.json({ ok: true, reviewId: data.id, htmlUrl: data.html_url });
  } catch (err) {
    log.error(`github/review: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// GitHub token status
app.get("/api/github/status", (_req, res) => {
  const token = process.env.GITHUB_TOKEN;
  res.json({ configured: !!token, preview: token ? `ghp_...${token.slice(-4)}` : null });
});

// Save GitHub token
app.post("/api/setup/github", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") return res.status(400).json({ error: "token is required" });

  // Quick validation — hit the /user endpoint
  log.info("Validating GitHub token…");
  try {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "code-reviewer/1.0" },
    });
    if (!ghRes.ok) throw new Error(`GitHub returned ${ghRes.status}`);
    const user = await ghRes.json();
    log.ok(`GitHub token valid — logged in as @${user.login}`);
  } catch (err) {
    return res.status(401).json({ error: `Token validation failed: ${err.message}` });
  }

  const envPath = new URL(".env", import.meta.url).pathname;
  try {
    let existing = "";
    try { existing = fs.readFileSync(envPath, "utf-8"); } catch {}
    if (existing.includes("GITHUB_TOKEN=")) {
      existing = existing.replace(/GITHUB_TOKEN=.*/g, `GITHUB_TOKEN=${token}`);
    } else {
      existing = existing.trimEnd() + `\nGITHUB_TOKEN=${token}\n`;
    }
    fs.writeFileSync(envPath, existing, "utf-8");
    process.env.GITHUB_TOKEN = token;
    log.ok("GitHub token saved");
  } catch (err) {
    return res.status(500).json({ error: `Could not write .env: ${err.message}` });
  }

  res.json({ ok: true, preview: `ghp_...${token.slice(-4)}` });
});

// Remove GitHub token
app.delete("/api/setup/github", (_req, res) => {
  const envPath = new URL(".env", import.meta.url).pathname;
  try {
    let existing = "";
    try { existing = fs.readFileSync(envPath, "utf-8"); } catch {}
    existing = existing.replace(/GITHUB_TOKEN=.*/g, "GITHUB_TOKEN=");
    fs.writeFileSync(envPath, existing, "utf-8");
    process.env.GITHUB_TOKEN = "";
    log.ok("GitHub token removed");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);

// ─── Terminal WebSocket ────────────────────────────────────────────────────────

const shell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "/bin/bash");
const shellArgs = process.platform === "win32" ? [] : ["-i", "-l"];
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  const params = new URL(req.url, `http://localhost`).searchParams;
  const requestedCwd = params.get("cwd") || os.homedir();
  const cwd = path.resolve(requestedCwd);

  if (!isPathAllowed(cwd)) {
    log.warn(`Terminal rejected — cwd not allowed: ${cwd}`);
    ws.close(1008, "Path not allowed");
    return;
  }

  // Resolve symlinks and re-check to prevent symlink traversal attacks
  let realCwd;
  try {
    realCwd = fs.realpathSync(cwd);
  } catch {
    log.warn(`Terminal rejected — path does not exist: ${cwd}`);
    ws.close(1011, "Invalid cwd");
    return;
  }
  try {
    if (!fs.statSync(realCwd).isDirectory()) {
      log.warn(`Terminal rejected — not a directory: ${realCwd}`);
      ws.close(1011, "Not a directory");
      return;
    }
  } catch (err) {
    log.warn(`Terminal rejected — cannot stat path ${realCwd}: ${err.message}`);
    ws.close(1011, "Invalid cwd");
    return;
  }
  if (!isPathAllowed(realCwd)) {
    log.warn(`Terminal rejected — cwd resolves outside allowed path (symlink): ${realCwd}`);
    ws.close(1008, "Path not allowed");
    return;
  }

  log.info(`Terminal opened — shell: ${shell}, cwd: ${realCwd}`);

  // Strip npm_config_prefix so nvm doesn't warn in the spawned shell
  const { npm_config_prefix, ...cleanEnv } = process.env;
  const proc = spawn(shell, shellArgs, {
    cwd: realCwd,
    env: { ...cleanEnv, TERM: "xterm-256color", COLORTERM: "truecolor", FORCE_COLOR: "1" },
    stdio: "pipe",
    detached: process.platform !== "win32",
  });

  const send = (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "output", data }));
  };

  // Without a PTY, programs emit bare \n; xterm needs \r\n. Translate, but skip \n already preceded by \r.
  const normalize = (s) => s.replace(/\r?\n/g, "\r\n");
  proc.stdout.on("data", (d) => send(normalize(d.toString())));
  proc.stderr.on("data", (d) => send(normalize(d.toString())));

  let shellExited = false;
  proc.on("close", (code) => {
    shellExited = true;
    log.info(`Terminal exited — code: ${code}`);
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "exit", exitCode: code }));
  });
  proc.on("error", (err) => {
    log.error(`Shell error: ${err.message}`);
    send(`\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") {
        if (!proc.killed && proc.stdin.writable) proc.stdin.write(msg.data);
      } else if (msg.type === "signal" && msg.data === "SIGINT") {
        // Signal the shell's process group, not just the shell — and never the server's group
        if (process.platform !== "win32" && proc.pid) {
          try { process.kill(-proc.pid, "SIGINT"); } catch (err) {
            log.error(`Terminal SIGINT failed: ${err.message}`);
          }
        } else if (proc.stdin.writable) {
          proc.stdin.write("\x03");
        }
      }
    } catch (err) {
      log.error(`Terminal message error: ${err.message}`);
    }
  });

  ws.on("close", () => {
    log.info("Terminal WS closed — killing shell");
    if (process.platform !== "win32" && proc.pid) {
      const pid = proc.pid; // capture before proc can be GC'd or PID recycled
      try { process.kill(-pid, "SIGTERM"); } catch { proc.kill(); }
      // SIGKILL fallback for processes that ignore SIGTERM; guard against PID recycling
      setTimeout(() => {
        if (shellExited) return;
        try { process.kill(-pid, "SIGKILL"); } catch { /* already dead */ }
      }, 3000);
    } else {
      proc.kill();
    }
  });
});

server.on("upgrade", (req, socket, head) => {
  // Unlike the HTTP API (which allows same-origin/no-origin requests), we require an
  // explicit allowed Origin for WebSocket connections because we're exposing a shell.
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    log.warn(`WebSocket upgrade rejected — origin: ${origin ?? "(none)"}`);
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  if (req.url?.startsWith("/terminal")) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
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
