# Improvements Roadmap

Each item ships as its own PR off `main`.

---

## PR 1 — Fix Windows path compatibility `fix/windows-paths`

**Problem:** `ALLOWED_BASE` defaults to `process.env.HOME`, which on Windows points to
`C:\Users\<name>`. Any project outside the home directory (e.g. `C:\Dev\Github\repo`)
gets a 403 "Access denied: path outside allowed directory".

**Fix:** Use `os.homedir()` for cross-platform home detection, and change the default
allowed root to `path.parse(os.homedir()).root` (i.e. `C:\` on Windows, `/` on Unix).
CORS is the real network-level guard; `isPathAllowed` only needs to ensure the resolved
path is a valid absolute path on the local machine.

Files: `server/index.js`

---

## PR 2 — Persist sidebar state `feat/persist-sidebar`

**Problem:** `sideWidth` (256 px default) and `sideTab` ("files") reset to defaults on
every page reload, losing the user's layout preference.

**Fix:** Read initial values from `localStorage` at startup; write on every change via
`useEffect`. Keys: `cr_side_width`, `cr_side_tab`.

Files: `client/src/App.tsx`

---

## PR 3 — Cross-browser textarea auto-resize `fix/textarea-resize`

**Problem:** The chat textarea uses `fieldSizing: content` (CSS Working Draft), which
works in Chrome 123+ but not Firefox or Safari.

**Fix:** Replace with a `useEffect` that sets `textarea.style.height = "auto"` then
`textarea.style.height = scrollHeight + "px"` whenever `input` changes. Cap at
`max-height: 8rem` via Tailwind (already `max-h-32`).

Files: `client/src/App.tsx`

---

## PR 4 — Clear context when switching repos `fix/clear-context-on-navigate`

**Problem:** When the user navigates to a different repo, `selectedFiles` still holds
paths from the old repo. Those paths silently fail during `buildFileContext` and may
confuse the AI.

**Fix:** In `navigate()`, detect when `resolved !== repoPath` and call
`setSelectedFiles(new Set())`. Also clear `diff` / `diffLabel` / `loadedPR` if the
repo root changes.

Files: `client/src/App.tsx`

---

## PR 5 — Selectable Claude model `feat/model-selector`

**Problem:** Model is hardcoded to `claude-opus-4-5` in `server/index.js`. Opus is
powerful but slow and expensive; Haiku is better for quick checks.

**Fix:**
- Client sends `model` field in the `/api/review` request body (defaults to `"claude-sonnet-4-6"`).
- Server reads `req.body.model`, validates it against an allowlist, falls back to Sonnet.
- UI: small segmented control in the chat input bar — **Haiku · Sonnet · Opus** — stored
  in `localStorage` as `cr_model`.

Files: `server/index.js`, `client/src/App.tsx`, `client/src/lib/api.ts`

---

## Order of execution

1. PR 1 (Windows fix) — blocking bug, merge first
2. PR 2 (persist sidebar) — low risk, isolated
3. PR 3 (textarea resize) — low risk, isolated
4. PR 4 (clear context) — low risk, isolated
5. PR 5 (model selector) — touches server + client, save for last
