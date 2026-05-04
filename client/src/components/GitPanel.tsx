import React, { useState } from "react";
import { GitBranch, GitCommit, Diff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api, type Commit } from "@/lib/api";

type Tab = "unstaged" | "staged" | "commits";

interface GitPanelProps {
  repoPath: string;
  onLoadDiff: (diff: string, label: string) => void;
}

export function GitPanel({ repoPath, onLoadDiff }: GitPanelProps) {
  const [tab, setTab] = useState<Tab>("unstaged");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (t: Tab) => {
    setTab(t);
    setError(null);
    setLoading(true);
    try {
      if (t === "unstaged") {
        const { diff } = await api.gitDiff(repoPath);
        onLoadDiff(diff, "Unstaged changes");
      } else if (t === "staged") {
        const { diff } = await api.gitStaged(repoPath);
        onLoadDiff(diff, "Staged changes");
      } else {
        const { commits } = await api.gitLog(repoPath);
        setCommits(commits);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadCommit = async (commit: Commit) => {
    setLoading(true);
    setError(null);
    try {
      const { diff } = await api.gitCommit(repoPath, commit.hash);
      onLoadDiff(diff, `${commit.hash.slice(0, 7)}: ${commit.subject}`);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["unstaged", "staged", "commits"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => load(t)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium transition-colors capitalize",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "unstaged" && <Diff className="h-3 w-3 inline mr-1" />}
            {t === "staged" && <GitBranch className="h-3 w-3 inline mr-1" />}
            {t === "commits" && <GitCommit className="h-3 w-3 inline mr-1" />}
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 m-2 rounded-md bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && tab === "commits" && (
        <ScrollArea className="flex-1">
          <div className="py-1">
            {commits.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Click "commits" to load history</p>
            )}
            {commits.map((c) => (
              <button
                key={c.hash}
                onClick={() => loadCommit(c)}
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{c.hash.slice(0, 7)}</Badge>
                  <span className="text-xs truncate text-foreground group-hover:text-foreground">{c.subject}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 pl-[52px]">{c.author} · {c.date}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {!loading && !error && (tab === "unstaged" || tab === "staged") && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">Diff loaded into chat context</p>
            <Button size="sm" variant="secondary" onClick={() => load(tab)}>
              Reload diff
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
