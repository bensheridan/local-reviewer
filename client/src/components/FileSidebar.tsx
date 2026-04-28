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
  Loader2,
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

// Skip these when adding a whole folder
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage"]);

function FileIcon({ ext, isDirectory, isOpen }: { ext: string | null; isDirectory: boolean; isOpen?: boolean }) {
  if (isDirectory) return isOpen ? <FolderOpen className="h-4 w-4 text-amber-400" /> : <Folder className="h-4 w-4 text-amber-400" />;
  if (ext && CODE_EXTS.has(ext)) return <FileCode className="h-4 w-4 text-blue-400" />;
  if (ext && TEXT_EXTS.has(ext)) return <FileText className="h-4 w-4 text-emerald-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

const MAX_FILES = 500;
const MAX_DEPTH = 8;

async function collectFilesRecursive(
  dirPath: string,
  depth = 0,
  collected: string[] = []
): Promise<string[]> {
  if (depth >= MAX_DEPTH || collected.length >= MAX_FILES) return collected;
  const { items } = await api.listFiles(dirPath);
  for (const item of items) {
    if (collected.length >= MAX_FILES) break;
    if (item.isDirectory) {
      if (!SKIP_DIRS.has(item.name)) {
        await collectFilesRecursive(item.path, depth + 1, collected);
      }
    } else {
      collected.push(item.path);
    }
  }
  return collected;
}

interface TreeNodeProps {
  item: FileItem;
  depth: number;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onAddFiles: (paths: string[]) => void;
  onNavigate: (path: string) => void;
}

function TreeNode({ item, depth, selectedFiles, onToggleFile, onAddFiles, onNavigate }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [expanding, setExpanding] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);

  const handleExpand = useCallback(async () => {
    if (!item.isDirectory) return;
    if (!open && children.length === 0) {
      setExpanding(true);
      try {
        const { items } = await api.listFiles(item.path);
        setChildren(items);
      } catch (err) {
        console.error("Failed to expand directory:", err);
      }
      setExpanding(false);
    }
    setOpen((v) => !v);
  }, [item, open, children.length]);

  const handleAddFolder = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingFolder(true);
    try {
      const paths = await collectFilesRecursive(item.path);
      onAddFiles(paths);
      onNavigate(item.path);
    } catch (err) {
      console.error("Failed to add folder:", err);
    }
    setAddingFolder(false);
  }, [item.path, onAddFiles, onNavigate]);

  const isSelected = selectedFiles.has(item.path);

  return (
    <div className="w-full">
      <div
        className={cn(
          "w-full flex items-center gap-1 pr-3 py-0.5 rounded-sm cursor-pointer hover:bg-sidebar-accent text-sidebar-foreground text-sm transition-colors",
          isSelected && "bg-sidebar-accent"
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={item.isDirectory ? handleExpand : undefined}
      >
        {item.isDirectory ? (
          expanding ? (
            <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", open && "rotate-90")} />
          )
        ) : (
          <button
            className={cn(
              "h-4 w-4 rounded flex items-center justify-center shrink-0 transition-colors",
              isSelected ? "text-emerald-400" : "text-muted-foreground/40 hover:text-foreground"
            )}
            onClick={(e) => { e.stopPropagation(); onToggleFile(item.path); }}
            title={isSelected ? "Remove from review" : "Add to review"}
          >
            {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        )}

        <FileIcon ext={item.ext} isDirectory={item.isDirectory} isOpen={open} />
        <span className="truncate flex-1 min-w-0 text-xs">{item.name}</span>

        {item.isDirectory && (
          <button
            className="shrink-0 h-4 w-4 rounded flex items-center justify-center text-muted-foreground/30 hover:text-foreground/80 transition-colors"
            onClick={handleAddFolder}
            title="Add all files in folder"
            disabled={addingFolder}
          >
            {addingFolder
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Plus className="h-3 w-3" />
            }
          </button>
        )}
      </div>

      {open && children.map((child) => (
        <TreeNode
          key={child.path}
          item={child}
          depth={depth + 1}
          selectedFiles={selectedFiles}
          onToggleFile={onToggleFile}
          onAddFiles={onAddFiles}
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
  onAddFiles: (paths: string[]) => void;
  onNavigate: (path: string) => void;
  collapsed: boolean;
}

export function FileSidebar({ repoPath, files, selectedFiles, onToggleFile, onAddFiles, onNavigate, collapsed }: FileSidebarProps) {
  const parts = repoPath.split("/").filter(Boolean);

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 bg-sidebar transition-all duration-200", collapsed && "w-12")}>
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

      {!collapsed && (
        <div className="flex-1 py-1 overflow-y-auto overflow-x-hidden">
          {files.map((item) => (
            <TreeNode
              key={item.path}
              item={item}
              depth={0}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
              onAddFiles={onAddFiles}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {!collapsed && selectedFiles.size > 0 && (
        <div className="border-t border-sidebar-border px-3 py-2">
          <span className="text-xs text-sidebar-foreground opacity-60">{selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} selected</span>
        </div>
      )}
    </div>
  );
}
