# 🔍 Code Reviewer

A local AI-powered code review tool built with React, shadcn/ui, Tailwind, and the Anthropic Claude API.
No GitHub auth required — reviews local files directly.

## Features

- 📁 **File Explorer** — Browse and select files for review
- 🔀 **Git Integration** — Load unstaged changes, staged diff, or any commit
- 💬 **Chat Interface** — Conversational code review powered by Claude
- 🌊 **Streaming** — Real-time streaming responses
- 🎨 **shadcn sidebar-07 layout** — Familiar, IDE-like feel
- 🔌 **MCP Server** — Use without an API key via Claude Code or Claude Desktop

## Setup

### Option A — API Key (web app)

#### 1. Install dependencies

```bash
npm run install:all
```

#### 2. Configure your API key

```bash
cp server/.env.example server/.env
# Edit server/.env and add your Anthropic API key:
# ANTHROPIC_API_KEY=sk-ant-...
```

Or skip this — the app will prompt you on first launch.

#### 3. Run

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

---

### Option B — MCP (no API key needed)

Connect this tool as an MCP server so Claude Code or Claude Desktop can call it directly. Claude uses your existing session — no separate API key required.

#### 1. Build the MCP server

```bash
npm run build:mcp
```

#### 2. Add to Claude Code

```bash
claude mcp add code-reviewer -- node /absolute/path/to/mcp-server/dist/index.js
```

#### 3. Or add to Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "code-reviewer": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

#### 4. Use it

Ask Claude: *"Review my changes in /path/to/my/project"*

#### Available MCP tools

| Tool | Description |
|---|---|
| `list_files` | Browse a directory tree |
| `read_file` | Read any source file |
| `git_diff` | Get unstaged changes |
| `git_staged` | Get staged changes |
| `git_log` | Last 20 commits |
| `git_show` | Diff for a specific commit |
| `review_code` | Full structured review (files + diff) |

---

## Usage (web app)

1. **Set your repo path** — type the path to your repo in the top bar and press Enter
2. **Add files** — hover a file in the explorer and click `+` to add it to review context
3. **Or load a diff** — click the Git tab, then Unstaged / Staged / pick a commit
4. **Review context** — see what's loaded in the right panel
5. **Start Review** — click the button for a full automated review, or just chat freely

## Architecture

```
code-reviewer/
├── server/          # Express + Node.js
│   ├── index.js     # File API, git commands, Claude streaming proxy
│   └── .env         # Your API key (Option A only)
├── mcp-server/      # MCP server (Option B — no API key)
│   └── src/
│       └── index.ts # list_files, read_file, git_*, review_code tools
└── client/          # React + Vite + Tailwind + shadcn
    └── src/
        ├── components/
        │   ├── SetupScreen.tsx    # Choose: API Key or MCP setup
        │   ├── FileSidebar.tsx    # File tree explorer
        │   ├── GitPanel.tsx       # Git diff/commit browser
        │   ├── ContextPanel.tsx   # Review context summary
        │   └── ChatMessage.tsx    # Markdown chat bubbles
        ├── lib/
        │   ├── api.ts             # All server calls + SSE stream
        │   └── utils.ts           # shadcn cn() helper
        └── App.tsx                # Main layout
```
