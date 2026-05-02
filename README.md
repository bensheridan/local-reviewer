# 🔍 Code Reviewer

A local AI-powered code review tool built with React, shadcn/ui, Tailwind, and the Anthropic Claude API.
Designed to run locally — no data leaves your machine except the code you choose to send to Claude.

## Features

- 📁 **File Explorer** — Browse and select files for review
- 🔀 **Git Integration** — Load unstaged changes, staged diff, or any commit
- 💬 **Chat Interface** — Conversational code review powered by Claude
- 🌊 **Streaming** — Real-time streaming responses
- 🤖 **Model Selector** — Switch between Haiku, Sonnet, and Opus per conversation
- 🖥️ **Integrated Terminal** — Run `gh` commands using your local CLI auth, no GitHub token needed
- 🎨 **shadcn sidebar-07 layout** — Familiar, IDE-like feel
- 🔌 **MCP Server** — Use without an API key via Claude Code or Claude Desktop
- 🪟 **Windows compatible** — Works on Windows, macOS, and Linux

## Setup

### Option A — API Key (web app)

#### 1. Install dependencies

```bash
npm run install:all
```

> **Windows note:** The integrated terminal uses `node-pty`, a native module that requires
> [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
> Install them before running `npm run install:all`.
> If you update your Node.js version, run `npm rebuild node-pty` in the `server/` directory.

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
6. **Switch models** — use the Haiku · Sonnet · Opus selector in the chat input bar
7. **Open a terminal** — click the terminal icon in the sidebar rail; opens in the current repo's directory

### Integrated Terminal

The terminal runs in your local shell (`$SHELL` on macOS/Linux, PowerShell on Windows) with the current repo as its working directory. Because it uses your local environment, `gh` CLI commands work with your existing GitHub auth — no token configuration needed in the app.

You can open multiple tabs with the `+` button. Tabs survive repo navigation and page focus changes. Close a tab to kill that shell process.

> **Tip:** Use `gh pr comment`, `gh pr review`, `gh pr merge`, and other `gh` commands directly
> in the terminal to interact with GitHub without configuring a token in the app.

---

## Restricting file access

By default the server allows access to your entire filesystem (needed so you can open any local repo). To restrict it to a specific directory, set `ALLOWED_BASE_PATH` in `server/.env`:

```env
ALLOWED_BASE_PATH=/home/yourname/projects
```

---

## Architecture

```
code-reviewer/
├── server/          # Express + Node.js + WebSocket
│   ├── index.js     # File API, git commands, Claude streaming proxy, terminal WS
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
        │   ├── ChatMessage.tsx    # Markdown chat bubbles
        │   ├── Terminal.tsx       # xterm.js instance + WebSocket PTY
        │   └── TerminalDrawer.tsx # Tab bar + resizable drawer
        ├── lib/
        │   ├── api.ts             # All server calls + SSE stream + model types
        │   └── utils.ts           # shadcn cn() helper
        └── App.tsx                # Main layout
```
