import { useState, useRef, useCallback, useEffect } from "react";
import { X, Plus, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Terminal } from "./Terminal";

interface Tab {
  id: string;
  cwd: string;
  label: string;
}

interface TerminalDrawerProps {
  cwd: string;
}

function makeTab(cwd: string, n: number): Tab {
  return { id: crypto.randomUUID(), cwd, label: `Terminal ${n}` };
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const MAX_TABS = 8;

export function TerminalDrawer({ cwd }: TerminalDrawerProps) {
  // effectiveCwd is used only for *new* tabs; existing tabs keep their original cwd.
  const effectiveCwd = cwd || "/";
  // Counter tracks display labels only — start at 1, increment before each new tab.
  // Intentionally not mutated in the useState initializer to be Strict Mode safe.
  const tabCounter = useRef(1);
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(effectiveCwd, tabCounter.current)]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [height, setHeight] = useState(() =>
    parseInt(localStorage.getItem("cr_term_height") ?? "260", 10)
  );
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);
  // Ref keeps onMouseDown stable — no need to recreate on every height change
  const heightRef = useRef(height);

  useEffect(() => {
    localStorage.setItem("cr_term_height", String(height));
    heightRef.current = height;
  }, [height]);

  const addTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const tab = makeTab(effectiveCwd, ++tabCounter.current);
      setActiveId(tab.id);
      return [...prev, tab];
    });
  }, [effectiveCwd]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      const finalTabs = next.length === 0 ? [makeTab(effectiveCwd, ++tabCounter.current)] : next;
      setActiveId((activeId) => {
        if (activeId !== id) return activeId;
        const idx = prev.findIndex((t) => t.id === id);
        return (prev[idx + 1] ?? prev[idx - 1])?.id ?? finalTabs[0].id;
      });
      return finalTabs;
    });
  }, [effectiveCwd]);

  // Drag-to-resize from the top edge — stable callback via heightRef
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = heightRef.current;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = dragStartY.current - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="border-t border-border bg-zinc-950 flex flex-col" style={{ height }}>
      {/* Drag handle */}
      <div
        className="h-1 cursor-row-resize hover:bg-primary/40 transition-colors shrink-0"
        onMouseDown={onMouseDown}
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-border shrink-0 bg-zinc-900 px-1">
        <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground mx-2 shrink-0" />
        <div role="tablist" className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {tabs.map((tab) => {
            const dirName = tab.cwd.split(/[/\\]/).filter(Boolean).pop() ?? tab.cwd;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={activeId === tab.id}
                tabIndex={activeId === tab.id ? 0 : -1}
                onClick={() => setActiveId(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveId(tab.id);
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    const idx = tabs.findIndex((t) => t.id === tab.id);
                    const next = e.key === "ArrowLeft" ? tabs[idx - 1] : tabs[idx + 1];
                    if (next) setActiveId(next.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0 border-b-2 transition-colors",
                  activeId === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{tab.label}</span>
                <span className="text-muted-foreground/50 font-mono">{dirName}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                  aria-label={`Close ${tab.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          className={cn(
            "p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0",
            tabs.length >= MAX_TABS && "opacity-30 cursor-not-allowed"
          )}
          aria-label="New terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal panels — all mounted, only active visible (visibility driven by CSS display) */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0 p-1"
            style={{ display: activeId === tab.id ? "block" : "none" }}
          >
            <Terminal cwd={tab.cwd} active={activeId === tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
