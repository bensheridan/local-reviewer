import { useState, useMemo } from "react";
import { GitPullRequest, Loader2, AlertCircle, ArrowRight, User, GitBranch, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type PullRequestData } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PrPanelProps {
  onLoadPR: (pr: PullRequestData, diff: string) => void;
  loadedPrNumber: number | null;
}

export function PrPanel({ onLoadPR, loadedPrNumber }: PrPanelProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<PullRequestData | null>(null);

  const isValidUrl = useMemo(() => {
    try {
      const u = new URL(url);
      return u.hostname === "github.com" && /^\/[\w.-]+\/[\w.-]+\/pull\/\d+/.test(u.pathname);
    } catch { return false; }
  }, [url]);

  async function handleFetch() {
    if (!isValidUrl || status === "loading") return;
    setStatus("loading");
    setError(null);
    setFetched(null);
    try {
      const pr = await api.fetchGitHubPR(url.trim());
      setFetched(pr);
      setStatus("idle");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  }

  function handleLoad() {
    if (!fetched) return;
    // Assemble a unified diff string from the per-file patches
    const diff = fetched.files
      .filter((f) => f.patch)
      .map((f) => `diff --git a/${f.filename} b/${f.filename}\n--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`)
      .join("\n");
    onLoadPR(fetched, diff);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-sidebar-border shrink-0">
        <span className="text-xs font-semibold text-sidebar-foreground uppercase tracking-wider">
          Remote PR
        </span>
      </div>

      <div className="p-3 flex flex-col gap-3 overflow-y-auto">
        {/* URL input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">GitHub PR URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); setFetched(null); setStatus("idle"); }}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="https://github.com/owner/repo/pull/123"
            className={cn(
              "h-8 w-full rounded-md border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-all",
              status === "error" ? "border-destructive focus:ring-destructive/30" : "border-input focus:ring-ring/30"
            )}
          />
        </div>

        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={handleFetch}
          disabled={!isValidUrl || status === "loading"}
        >
          {status === "loading" ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching…</>
          ) : (
            <><GitPullRequest className="h-3.5 w-3.5" /> Fetch PR</>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-2.5 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* PR metadata card */}
        {fetched && (
          <div className="rounded-lg border border-border bg-accent/40 p-3 flex flex-col gap-2.5">
            <div>
              <p className="text-xs font-semibold text-foreground leading-snug">
                #{fetched.number} {fetched.title}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span>{fetched.author}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="font-mono truncate">{fetched.head} → {fetched.base}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileCode className="h-3 w-3 shrink-0" />
                <span>{fetched.files.length} files · +{fetched.files.reduce((s, f) => s + f.additions, 0)} −{fetched.files.reduce((s, f) => s + f.deletions, 0)}</span>
              </div>
            </div>

            {fetched.body && (
              <p className="text-xs text-muted-foreground line-clamp-3 border-t border-border pt-2">
                {fetched.body}
              </p>
            )}

            <Button
              size="sm"
              className="w-full gap-1.5 mt-1"
              onClick={handleLoad}
              variant={loadedPrNumber === fetched.number ? "outline" : "default"}
            >
              {loadedPrNumber === fetched.number ? (
                "✓ Loaded for review"
              ) : (
                <><ArrowRight className="h-3.5 w-3.5" /> Load for Review</>
              )}
            </Button>
          </div>
        )}

        {!fetched && status === "idle" && !error && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Paste a GitHub PR URL to fetch its diff and review it with Claude.
          </p>
        )}
      </div>
    </div>
  );
}
