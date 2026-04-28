import React, { useState } from "react";
import {
  KeyRound, ExternalLink, Eye, EyeOff, Loader2,
  AlertCircle, ArrowRight, Terminal, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SetupScreenProps {
  onComplete: (preview: string, githubTokenSet?: boolean) => void;
}

type Mode = "choose" | "apikey" | "mcp";

// ─── MCP Setup Panel ──────────────────────────────────────────────────────────

function McpPanel({ onBack }: { onBack: () => void }) {
  const steps = [
    {
      label: "Build the MCP server",
      code: "cd mcp-server && npm install && npm run build",
    },
    {
      label: "Add to Claude Code",
      code: "claude mcp add code-reviewer -- node /absolute/path/to/mcp-server/dist/index.js",
    },
    {
      label: "Or add to Claude Desktop — edit claude_desktop_config.json",
      code: JSON.stringify(
        {
          mcpServers: {
            "code-reviewer": {
              command: "node",
              args: ["/absolute/path/to/mcp-server/dist/index.js"],
            },
          },
        },
        null,
        2
      ),
    },
  ];

  return (
    <div className="w-full max-w-lg px-6">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
          <Terminal className="h-7 w-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Use via MCP</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No API key needed — Claude uses your existing session.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-xl space-y-5">
        {/* Tools */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Available tools</p>
          <div className="space-y-1.5">
            {[
              ["list_files", "Browse the file tree"],
              ["read_file", "Read any source file"],
              ["git_diff / git_staged", "Get unstaged or staged changes"],
              ["git_log / git_show", "Browse commit history"],
              ["review_code", "Full structured review"],
            ].map(([name, desc]) => (
              <div key={name} className="flex items-center gap-2.5">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-blue-400 whitespace-nowrap">{name}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Steps */}
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-foreground">{step.label}</span>
              </div>
              <pre className="ml-7 rounded-lg bg-muted px-3 py-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                {step.code}
              </pre>
            </li>
          ))}
        </ol>

        <div className="border-t border-border" />

        {/* Usage hint */}
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2.5">
          <p className="text-xs text-blue-300">
            Then ask Claude: <span className="font-medium">"Review my changes in /path/to/my/project"</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── API Key Panel ────────────────────────────────────────────────────────────

function ApiKeyPanel({ onComplete, onBack }: { onComplete: (preview: string, githubTokenSet?: boolean) => void; onBack: () => void }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const isValid = key.startsWith("sk-ant-") && key.length > 20;

  const save = async () => {
    if (!isValid || status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/setup/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save key");

      let githubTokenSet = false;
      if (githubToken.trim()) {
        try {
          const ghRes = await fetch("/api/setup/github", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: githubToken.trim() }),
          });
          if (ghRes.ok) githubTokenSet = true;
        } catch {}
      }

      onComplete(data.preview, githubTokenSet);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="w-full max-w-md px-6">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
          <KeyRound className="h-7 w-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Connect API Key</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the web app with your Anthropic API key
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
        {/* Step 1 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
            <span className="text-sm font-medium text-foreground">Get your API key</span>
          </div>
          <p className="text-xs text-muted-foreground ml-7 mb-2">
            Log into the Anthropic console and create an API key.
          </p>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-7 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            console.anthropic.com/settings/keys
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="my-5 border-t border-border" />

        {/* Step 2 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
            <span className="text-sm font-medium text-foreground">Paste your key</span>
          </div>

          <div className="relative ml-7">
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => { setKey(e.target.value); setStatus("idle"); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="sk-ant-api03-..."
              className={cn(
                "w-full h-10 rounded-lg border bg-background px-3 pr-10 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all",
                status === "error"
                  ? "border-destructive focus:ring-destructive/30"
                  : isValid
                  ? "border-emerald-500/50 focus:ring-emerald-500/30"
                  : "border-input focus:ring-ring/30"
              )}
              autoComplete="off"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {key.length > 0 && !isValid && (
            <p className="ml-7 mt-1.5 text-xs text-muted-foreground">
              Key should start with <span className="font-mono">sk-ant-</span>
            </p>
          )}
        </div>

        {/* Step 3 — GitHub token (optional) */}
        <div className="my-5 border-t border-border" />

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">3</span>
            <span className="text-sm font-medium text-foreground">
              GitHub token <span className="text-xs text-muted-foreground font-normal ml-1">optional — to review & post on remote PRs</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground ml-7 mb-2">
            Create a fine-grained PAT with <span className="font-mono">Pull requests: Read &amp; Write</span>.
          </p>
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-7 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mb-3"
          >
            github.com/settings/tokens
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="ml-7">
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="github_pat_... or ghp_..."
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
              autoComplete="off"
            />
          </div>
        </div>

        {error && (
          <div className="ml-7 mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <div className="ml-7">
          <Button className="w-full gap-2" onClick={save} disabled={!isValid || status === "loading"}>
            {status === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Validating…</>
            ) : (
              <>Connect <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Keys are saved locally to <span className="font-mono">server/.env</span> and never leave your machine.
      </p>
    </div>
  );
}

// ─── Choose Panel ─────────────────────────────────────────────────────────────

function ChoosePanel({ onSelect }: { onSelect: (mode: "apikey" | "mcp") => void }) {
  return (
    <div className="w-full max-w-md px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Code Reviewer</h1>
        <p className="mt-2 text-sm text-muted-foreground">How would you like to connect Claude?</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => onSelect("apikey")}
          className="w-full rounded-xl border border-border bg-card p-5 text-left hover:border-primary/50 hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">API Key</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Use the web app directly. Paste your Anthropic API key and start reviewing local files in the browser.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onSelect("mcp")}
          className="w-full rounded-xl border border-border bg-card p-5 text-left hover:border-primary/50 hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                MCP <span className="ml-1.5 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400">No API key needed</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add this as an MCP server to Claude Code or Claude Desktop. Reviews run via your existing Claude session.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── SetupScreen ──────────────────────────────────────────────────────────────

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background dark">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
      <div className="relative z-10 w-full flex justify-center">
        {mode === "choose" && <ChoosePanel onSelect={setMode} />}
        {mode === "apikey" && <ApiKeyPanel onComplete={onComplete} onBack={() => setMode("choose")} />}
        {mode === "mcp" && <McpPanel onBack={() => setMode("choose")} />}
      </div>
    </div>
  );
}
