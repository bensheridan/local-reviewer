import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  PanelLeft,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Send,
  Trash2,
  Code2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSidebar } from "@/components/FileSidebar";
import { GitPanel } from "@/components/GitPanel";
import { PrPanel } from "@/components/PrPanel";
import { ContextPanel } from "@/components/ContextPanel";
import { ChatMessage } from "@/components/ChatMessage";
import { SetupScreen } from "@/components/SetupScreen";
import { api, type FileItem, type Message, type PullRequestData } from "@/lib/api";

type SideTab = "files" | "git" | "pr";
type SetupState = "checking" | "needed" | "done";

const INITIAL_PATH = typeof window !== "undefined"
  ? localStorage.getItem("cr_repo_path") || "/"
  : "/";

export default function App() {
  // ─── Setup / auth state ────────────────────────────────────────────────
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // ─── Navigation ────────────────────────────────────────────────────────
  const [repoPath, setRepoPath] = useState(INITIAL_PATH);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pathError, setPathError] = useState<string | null>(null);

  // ─── Sidebar state ─────────────────────────────────────────────────────
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>("files");
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [sideWidth, setSideWidth] = useState(256);

  // ─── Review context ────────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLabel, setDiffLabel] = useState<string | null>(null);

  // ─── Remote PR ─────────────────────────────────────────────────────────
  const [loadedPR, setLoadedPR] = useState<PullRequestData | null>(null);
  const [githubTokenSet, setGithubTokenSet] = useState(false);

  // ─── Chat ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastReview, setLastReview] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Check API key + GitHub token on mount ────────────────────────────
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setKeyPreview(data.preview);
          setSetupState("done");
        } else {
          setSetupState("needed");
        }
      })
      .catch(() => setSetupState("needed"));

    api.githubStatus()
      .then((data) => setGithubTokenSet(data?.configured ?? false))
      .catch((err) => { console.warn("GitHub status check failed:", err); setGithubTokenSet(false); });
  }, []);

  // ─── Load directory ────────────────────────────────────────────────────
  const navigate = useCallback(async (path: string) => {
    setPathError(null);
    try {
      const { items, path: resolved } = await api.listFiles(path);
      setFiles(items);
      setRepoPath(resolved);
      localStorage.setItem("cr_repo_path", resolved);
    } catch (err: any) {
      setPathError(err.message);
    }
  }, []);

  useEffect(() => {
    if (setupState === "done") navigate(repoPath);
  }, [setupState]); // eslint-disable-line

  // ─── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ─── Textarea auto-resize ─────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // ─── File toggle ───────────────────────────────────────────────────────
  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const addFiles = useCallback((paths: string[]) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      // If every file is already selected, remove them all; otherwise add all
      const allSelected = paths.every((p) => next.has(p));
      paths.forEach((p) => allSelected ? next.delete(p) : next.add(p));
      return next;
    });
  }, []);

  // ─── Collect file contents ─────────────────────────────────────────────
  const buildFileContext = useCallback(async () => {
    const contents: string[] = [];
    for (const path of selectedFiles) {
      try {
        const { content } = await api.readFile(path);
        const lines = content.split("\n").length;
        contents.push(`### ${path} (${lines} lines)\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``);
      } catch {}
    }
    return contents.join("\n\n");
  }, [selectedFiles]);

  // ─── Start review ──────────────────────────────────────────────────────
  const startReview = useCallback(async () => {
    if (isStreaming) return;
    const fileContents = await buildFileContext();
    const reviewMessage: Message = {
      role: "user",
      content: `Please do a thorough code review of the following${diff ? " changes and" : ""} files.\n\n${fileContents}${diff ? `\n\n## Git Diff (${diffLabel})\n\`\`\`diff\n${diff.slice(0, 60_000)}${diff.length > 60_000 ? "\n\n… [diff truncated — focus your review on the portion shown]" : ""}\n\`\`\`` : ""}`,
    };
    await sendMessages([...messages, reviewMessage], reviewMessage);
  }, [isStreaming, diff, diffLabel, messages, buildFileContext]);

  // ─── Send chat ─────────────────────────────────────────────────────────
  const sendChat = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setInput("");
    await sendMessages([...messages, userMsg], userMsg);
  }, [input, isStreaming, messages]);

  const sendMessages = async (allMessages: Message[], newUserMsg: Message) => {
    setMessages((prev) => [...prev.filter((m) => m !== newUserMsg), newUserMsg]);
    setIsStreaming(true);
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    const reviewContext = { files: [...selectedFiles], diff: diff ?? undefined };
    try {
      let full = "";
      for await (const chunk of api.streamReview(allMessages, reviewContext)) {
        full += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: full };
          return updated;
        });
      }
      setLastReview((prev) => full || prev);
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `**Error:** ${err.message}` };
        return updated;
      });
    }
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };

  const onSetupComplete = (preview: string, ghTokenSet?: boolean) => {
    setKeyPreview(preview);
    setSetupState("done");
    setShowSetup(false);
    if (ghTokenSet !== undefined) setGithubTokenSet(ghTokenSet);
    navigate(repoPath);
  };

  const onLoadPR = useCallback((pr: PullRequestData, prDiff: string) => {
    setLoadedPR(pr);
    setDiff(prDiff);
    setDiffLabel(`PR #${pr.number}: ${pr.title}`);
    setLastReview(null);
    setSideTab("files");
    setSideCollapsed(false);
  }, []);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sideWidth;
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      setSideWidth(Math.max(160, Math.min(480, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []); // startX/startWidth captured in closure — no stale ref needed

  // Ensure userSelect is restored if component unmounts during a drag
  useEffect(() => () => { document.body.style.userSelect = ""; }, []);

  const pathShort = repoPath.split("/").slice(-2).join("/") || "/";

  // ─── Loading / setup screens ───────────────────────────────────────────
  if (setupState === "checking") {
    return (
      <div className="dark flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm animate-pulse">Connecting…</div>
      </div>
    );
  }

  if (setupState === "needed" || showSetup) {
    return <SetupScreen onComplete={onSetupComplete} />;
  }

  // ─── Main app ──────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-background overflow-hidden dark">

        {/* ── Icon rail ──────────────────────────────────────────────── */}
        <div className="w-12 flex flex-col items-center py-3 gap-1 bg-sidebar border-r border-sidebar-border shrink-0">
          <div className="mb-2">
            <Code2 className="h-6 w-6 text-sidebar-primary" />
          </div>
          <Separator className="bg-sidebar-border w-8 mb-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSideTab("files"); setSideCollapsed(false); }}
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                  sideTab === "files" && !sideCollapsed
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <PanelLeft className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">File Explorer</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSideTab("git"); setSideCollapsed(false); }}
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                  sideTab === "git" && !sideCollapsed
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <GitBranch className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Git</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSideTab("pr"); setSideCollapsed(false); }}
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center transition-colors relative",
                  sideTab === "pr" && !sideCollapsed
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <GitPullRequest className="h-4.5 w-4.5" />
                {loadedPR && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Remote PR{loadedPR ? ` — #${loadedPR.number}` : ""}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setRightCollapsed((v) => !v)}
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                  !rightCollapsed
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <MessageSquare className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Review Context</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {/* API key indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowSetup(true)}
                className="h-9 w-9 rounded-lg flex items-center justify-center text-emerald-400/70 hover:bg-sidebar-accent hover:text-emerald-400 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs">
                <div className="font-medium">API Key Connected</div>
                <div className="text-muted-foreground font-mono">{keyPreview}</div>
                <div className="text-muted-foreground mt-1">Click to change</div>
              </div>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setMessages([]); setLastReview(null); }}
                className="h-9 w-9 rounded-lg flex items-center justify-center text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Clear chat</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Left panel ─────────────────────────────────────────────── */}
        {!sideCollapsed && (
          <div className="flex flex-col shrink-0 bg-sidebar" style={{ width: sideWidth }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
              <span className="text-xs font-semibold text-sidebar-foreground uppercase tracking-wider">
                {sideTab === "files" ? "Explorer" : sideTab === "git" ? "Git" : "Remote PR"}
              </span>
              <button onClick={() => setSideCollapsed(true)} className="text-sidebar-foreground/40 hover:text-sidebar-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            {sideTab === "files" && (
              <FileSidebar
                repoPath={repoPath}
                files={files}
                selectedFiles={selectedFiles}
                onToggleFile={toggleFile}
                onAddFiles={addFiles}
                onNavigate={navigate}
                collapsed={false}
              />
            )}
            {sideTab === "git" && (
              <GitPanel
                repoPath={repoPath}
                onLoadDiff={(d, label) => { setDiff(d); setDiffLabel(label); setLoadedPR(null); }}
              />
            )}
            {sideTab === "pr" && (
              <PrPanel
                onLoadPR={onLoadPR}
                loadedPrNumber={loadedPR?.number ?? null}
              />
            )}
          </div>
        )}

        {/* Drag handle / collapsed toggle */}
        {sideCollapsed ? (
          <button
            onClick={() => setSideCollapsed(false)}
            className="w-4 flex items-center justify-center bg-sidebar border-r border-sidebar-border hover:bg-sidebar-accent transition-colors shrink-0"
          >
            <ChevronRight className="h-3 w-3 text-sidebar-foreground/40" />
          </button>
        ) : (
          <div
            className="w-1 shrink-0 border-r border-sidebar-border hover:border-primary cursor-col-resize transition-colors group relative"
            onMouseDown={onDividerMouseDown}
          >
            <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-primary/20 transition-colors" />
          </div>
        )}

        {/* ── Main chat area ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Code2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate">Code Reviewer</span>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-xs text-muted-foreground truncate font-mono">{pathShort}</span>
              {pathError && <span className="text-xs text-destructive">{pathError}</span>}
            </div>
            <input
              className="h-7 px-2 text-xs bg-muted border border-input rounded-md font-mono w-56 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              defaultValue={repoPath}
              onKeyDown={(e) => { if (e.key === "Enter") navigate((e.target as HTMLInputElement).value); }}
              placeholder="Path to repo…"
            />
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-6">
                <Code2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-2">Ready to review</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Select files from the explorer or load a git diff, then click <strong>Start Review</strong> — or just ask a question about your code.
                </p>
                <div className="flex gap-2 mt-4 flex-wrap justify-center">
                  {["Review for security issues", "Check for performance bottlenecks", "Suggest refactoring opportunities"].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pb-4">
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    message={msg}
                    isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-3 bg-background shrink-0">
            <div className="flex items-end gap-2 bg-muted rounded-lg px-3 py-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the code, request specific checks, or chat…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-32 leading-relaxed overflow-y-auto"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendChat} disabled={!input.trim() || isStreaming}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

        {/* ── Right context panel ────────────────────────────────────── */}
        {!rightCollapsed && (
          <div className="w-56 shrink-0">
            <ContextPanel
              context={{ files: [...selectedFiles], diff, diffLabel }}
              onRemoveFile={toggleFile}
              onClearDiff={() => { setDiff(null); setDiffLabel(null); setLoadedPR(null); }}
              onStartReview={startReview}
              isReviewing={isStreaming}
              pr={loadedPR ? { url: loadedPR.url, number: loadedPR.number, title: loadedPR.title } : null}
              lastReview={lastReview}
              githubTokenSet={githubTokenSet}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
