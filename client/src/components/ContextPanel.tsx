import React from "react";
import { X, FileCode, GitBranch, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ReviewContext {
  files: string[];
  diff: string | null;
  diffLabel: string | null;
}

interface ContextPanelProps {
  context: ReviewContext;
  onRemoveFile: (path: string) => void;
  onClearDiff: () => void;
  onStartReview: () => void;
  isReviewing: boolean;
}

export function ContextPanel({ context, onRemoveFile, onClearDiff, onStartReview, isReviewing }: ContextPanelProps) {
  const hasContext = context.files.length > 0 || context.diff;

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
          {/* Diff */}
          {context.diff && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent group">
              <GitBranch className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs truncate flex-1 text-foreground">{context.diffLabel || "Git diff"}</span>
              <button onClick={onClearDiff} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          )}

          {/* Files */}
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
              <p className="text-xs text-muted-foreground">Add files from the explorer or load a git diff to start</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {hasContext && (
        <div className="p-2 border-t border-border shrink-0">
          <Button
            className="w-full"
            size="sm"
            onClick={onStartReview}
            disabled={isReviewing}
          >
            {isReviewing ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Reviewing…</>
            ) : (
              "Start Review"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
