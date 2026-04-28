import { useState, useEffect } from "react";
import { X, FileCode, GitBranch, RefreshCw, GitPullRequest, Send, CheckCircle2, AlertCircle, Loader2, ExternalLink, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type ReviewEvent } from "@/lib/api";

interface ReviewContext {
  files: string[];
  diff: string | null;
  diffLabel: string | null;
}

interface PrInfo {
  url: string;
  number: number;
  title: string;
}

interface ContextPanelProps {
  context: ReviewContext;
  onRemoveFile: (path: string) => void;
  onClearDiff: () => void;
  onStartReview: () => void;
  isReviewing: boolean;
  pr: PrInfo | null;
  lastReview: string | null;
  githubTokenSet: boolean;
}

const EVENT_OPTIONS: { value: ReviewEvent; label: string; description: string }[] = [
  { value: "COMMENT",          label: "Comment",          description: "Post feedback without approving" },
  { value: "APPROVE",          label: "Approve",          description: "Approve the PR" },
  { value: "REQUEST_CHANGES",  label: "Request changes",  description: "Block merge until addressed" },
];

export function ContextPanel({
  context, onRemoveFile, onClearDiff, onStartReview, isReviewing,
  pr, lastReview, githubTokenSet,
}: ContextPanelProps) {
  const hasContext = context.files.length > 0 || context.diff;
  const canPost = !!pr && !!lastReview && githubTokenSet;
  const DIFF_LIMIT = 60_000;
  const diffSize = context.diff?.length ?? 0;
  const diffTruncated = diffSize > DIFF_LIMIT;

  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [postStatus, setPostStatus] = useState<"idle" | "posting" | "done" | "error">("idle");
  const [postError, setPostError] = useState<string | null>(null);
  const [postedUrl, setPostedUrl] = useState<string | null>(null);

  // Reset post state when the loaded PR changes
  useEffect(() => {
    setPostStatus("idle");
    setPostedUrl(null);
    setPostError(null);
    setEvent("COMMENT");
  }, [pr?.number]);

  async function handlePost() {
    if (!pr || !lastReview || postStatus === "posting") return;
    const prUrl = pr.url;
    const reviewContent = lastReview;
    setPostStatus("posting");
    setPostError(null);
    try {
      const result = await api.postGitHubReview(prUrl, reviewContent, event);
      setPostedUrl(result.htmlUrl);
      setPostStatus("done");
    } catch (err: any) {
      setPostError(err.message);
      setPostStatus("error");
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground">Review Context</span>
        {hasContext && (
          <Badge variant="secondary" className="text-xs">{context.files.length + (context.diff ? 1 : 0)}</Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {context.diff && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent group">
                <GitBranch className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs truncate flex-1 text-foreground">{context.diffLabel || "Git diff"}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{diffSize > 1000 ? `${(diffSize / 1000).toFixed(0)}k` : diffSize} chars</span>
                <button onClick={onClearDiff} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
              {diffTruncated && (
                <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
                  <TriangleAlert className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-400 leading-relaxed">
                    Diff is large ({(diffSize / 1000).toFixed(0)}k chars). Only the first 60k will be sent — consider reviewing in smaller sections for best results.
                  </p>
                </div>
              )}
            </div>
          )}

          {context.files.map((f) => {
            const name = f.split("/").pop() ?? f;
            return (
              <div key={f} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent group" title={f}>
                <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-xs truncate flex-1 text-foreground">{name}</span>
                <button onClick={() => onRemoveFile(f)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            );
          })}

          {!hasContext && (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">Add files or load a git diff to start</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {hasContext && (
        <div className="p-2 border-t border-border shrink-0">
          <Button className="w-full" size="sm" onClick={onStartReview} disabled={isReviewing}>
            {isReviewing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Reviewing…</>
              : "Start Review"
            }
          </Button>
        </div>
      )}

      {/* ── Post to GitHub ─────────────────────────────────────────────── */}
      {pr && (
        <div className="border-t border-border p-2 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">PR #{pr.number}</span>
          </div>

          {!githubTokenSet && (
            <p className="text-xs text-muted-foreground px-1">
              Add a GitHub token in settings to post reviews.
            </p>
          )}

          {githubTokenSet && !lastReview && (
            <p className="text-xs text-muted-foreground px-1">
              Run a review first to post it to GitHub.
            </p>
          )}

          {canPost && postStatus !== "done" && (
            <>
              <div className="flex flex-col gap-1">
                {EVENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setEvent(opt.value)}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${
                      event === opt.value
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {postError && (
                <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/20 px-2 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{postError}</p>
                </div>
              )}

              <Button size="sm" className="w-full gap-1.5" onClick={handlePost} disabled={postStatus === "posting"}>
                {postStatus === "posting"
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting…</>
                  : <><Send className="h-3.5 w-3.5" /> Post to GitHub</>
                }
              </Button>
            </>
          )}

          {postStatus === "done" && postedUrl && (
            <a
              href={postedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/15 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Review posted</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
