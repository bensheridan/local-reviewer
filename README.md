# 🔍 Code Reviewer

A local AI-powered code review tool built with React, shadcn/ui, Tailwind, and the Anthropic Claude API.
No GitHub auth required — reviews local files directly.

## Features

- 📁 **File Explorer** — Browse and select files for review
- 🔀 **Git Integration** — Load unstaged changes, staged diff, or any commit
- 💬 **Chat Interface** — Conversational code review powered by Claude
- 🌊 **Streaming** — Real-time streaming responses
- 🎨 **shadcn sidebar-07 layout** — Familiar, IDE-like feel

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure your API key

```bash
cp server/.env.example server/.env
# Edit server/.env and add your Anthropic API key:
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

## Usage

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
│   └── .env         # Your API key goes here
└── client/          # React + Vite + Tailwind + shadcn
    └── src/
        ├── components/
        │   ├── FileSidebar.tsx    # File tree explorer
        │   ├── GitPanel.tsx       # Git diff/commit browser
        │   ├── ContextPanel.tsx   # Review context summary
        │   └── ChatMessage.tsx    # Markdown chat bubbles
        ├── lib/
        │   ├── api.ts             # All server calls + SSE stream
        │   └── utils.ts           # shadcn cn() helper
        └── App.tsx                # Main layout
```
