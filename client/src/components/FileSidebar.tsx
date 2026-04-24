import React, { useState, useCallback } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  Plus,
  Check,
  Home,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type FileItem } from "@/lib/api";

const CODE_EXTS = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "cpp", "c", "cs", "rb", "php", "swift", "kt", "vue", "svelte"]);
const TEXT_EXTS = new Set(["md", "txt", "json", "yaml", "yml", "toml", "env", "sh", "bash", "zsh", "css", "scss", "html", "xml", "sql"]);

function FileIcon({ ext, isDirectory, isOpen }: { ext: string | null; isDirectory: boolean; isOpen?: boolean }) {
  if (isDirectory) return isOpen ? <FolderOpen className="h-4 w-4 text-amber-400" /> : <Folder className="h-4 w-4 text-amber-400" />;
  if (ext && CODE_EXTS.has(ext)) return <FileCode className="h-4 w-4 text-blue-400" />;
  if (ext && TEXT_EXTS.has(ext)) return <FileText className="h-4 w-4 text-emerald-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

interface TreeNodeProps {
  item: FileItem;
  depth: number;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onNavigate: (path: string) => void;
}

function TreeNode({ item, depth, selectedFiles, onToggleFile, onNavigate }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleExpand = useCallback(async () => {
    if (!item.isDirectory) return;
    if (!open && children.length === 0) {
      setLoading(true);
      try {
        const { items } = await api.listFiles(item.path);
        setChildren(items);
      } catch {}
      setLoading(false);
    }
    setOpen((v) => !v);
  }, [item, open, children.length]);

  const isSelected = selectedFiles.has(item.path);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 pr-1 py-0.5 rounded-sm cursor-pointer hover:bg-sidebar-accent text-sidebar-foreground text-sm transition-colors",
          isSelected && "bg-sidebar-accent"
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={item.isDirectory ? handleExpand : undefined}
      >
        {item.isDirectory && (
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
        )}
        {!item.isDirectory && <span className="w-3 shrink-0" />}

        <FileIcon ext={item.ext} isDirectory={item.isDirectory} isOpen={open} />

        <span className="truncate flex-1 text-xs">{item.name}</span>

        {loading && <span className="text-xs text-muted-foreground">…</span>}

        {!item.isDirectory && (
          <button
            className={cn(
              "ml-auto h-5 w-5 rounded flex items-center justify-center transition-all shrink-0",
              isSelected
                ? "opacity-100 text-emerald-400 bg-emerald-400/10"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            )}
            onClick={(e) => { e.stopPropagation(); onToggleFile(item.path); }}
            title={isSelected ? "Remove from review" : "Add to review"}
          >
            {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        )}
        {item.isDirectory && <span className="w-5 shrink-0" />}
      </div>

      {open && children.map((child) => (
        <TreeNode
          key={child.path}
          item={child}
          depth={depth + 1}
          selectedFiles={selectedFiles}
          onToggleFile={onToggleFile}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

interface FileSidebarProps {
  repoPath: string;
  files: FileItem[];
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onNavigate: (path: string) => void;
  collapsed: boolean;
}

export function FileSidebar({ repoPath, files, selectedFiles, onToggleFile, onNavigate, collapsed }: FileSidebarProps) {
  const parts = repoPath.split("/").filter(Boolean);

  return (
    <div className={cn("flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200", collapsed ? "w-12" : "w-64")}>
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-3 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <>
            {parts.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => onNavigate(parts.slice(0, -1).join("/") || "/")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Go up</TooltipContent>
              </Tooltip>
            )}
            <span className="text-xs font-semibold text-sidebar-foreground truncate flex-1">
              {parts[parts.length - 1] || "/"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-sidebar-foreground hover:bg-sidebar-accent shrink-0" onClick={() => onNavigate("/")}>
                  <Home className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Root</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* File tree */}
      {!collapsed && (
        <ScrollArea className="flex-1 py-1">
          {files.map((item) => (
            <TreeNode
              key={item.path}
              item={item}
              depth={0}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
              onNavigate={onNavigate}
            />
          ))}
        </ScrollArea>
      )}

      {/* Selected count */}
      {!collapsed && selectedFiles.size > 0 && (
        <div className="border-t border-sidebar-border px-3 py-2">
          <span className="text-xs text-sidebar-foreground opacity-60">{selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} selected</span>
        </div>
      )}
    </div>
  );
}
