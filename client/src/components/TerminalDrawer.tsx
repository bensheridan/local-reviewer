import { useState, useRef, useCallback, useEffect } from "react";
import { X, Plus, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Terminal } from "./Terminal";

interface Tab {
  id: number;
  cwd: string;
  label: string;
}

interface TerminalDrawerProps {
  cwd: string;
}

let nextId = 1;

function makeTab(cwd: string): Tab {
  const id = nextId++;
  return { id, cwd, label: `Terminal ${id}` };
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = parseInt(localStorage.getItem("cr_term_height") ?? "260", 10);

export function TerminalDrawer({ cwd }: TerminalDrawerProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(cwd)]);
  const [activeId, setActiveId] = useState<number>(() => tabs[0].id);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  useEffect(() => {
    localStorage.setItem("cr_term_height", String(height));
  }, [height]);

  const addTab = useCallback(() => {
    const tab = makeTab(cwd);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, [cwd]);

  const closeTab = useCallback((id: number) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) return [makeTab(cwd)];
      return next;
    });
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const idx = tabs.findIndex((t) => t.id === id);
      const fallback = tabs[idx + 1] ?? tabs[idx - 1];
      return fallback?.id ?? tabs[0].id;
    });
  }, [tabs, cwd]);

  // Drag-to-resize from the top edge
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = height;

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
  }, [height]);

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
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0 border-b-2 transition-colors",
                activeId === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="opacity-50 hover:opacity-100 transition-opacity"
                aria-label={`Close ${tab.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addTab}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="New terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal panels — all mounted, only active visible */}
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
