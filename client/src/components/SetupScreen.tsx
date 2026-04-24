import React, { useState } from "react";
import { KeyRound, ExternalLink, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SetupScreenProps {
  onComplete: (preview: string) => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
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
      onComplete(data.preview);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background dark">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo / title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <KeyRound className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome to Code Reviewer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your Anthropic API key to get started
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          {/* Step 1 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
              <span className="text-sm font-medium text-foreground">Get your API key</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7 mb-2">
              Log into the Anthropic console with your Teams account and create an API key.
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

          {/* Divider */}
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
                onKeyDown={handleKeyDown}
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

            {/* Validation hint */}
            {key.length > 0 && !isValid && (
              <p className="ml-7 mt-1.5 text-xs text-muted-foreground">
                Key should start with <span className="font-mono">sk-ant-</span>
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="ml-7 mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="ml-7">
            <Button
              className="w-full gap-2"
              onClick={save}
              disabled={!isValid || status === "loading"}
            >
              {status === "loading" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Validating key…</>
              ) : (
                <>Connect <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your key is saved locally to <span className="font-mono">server/.env</span> and never leaves your machine.
        </p>
      </div>
    </div>
  );
}
