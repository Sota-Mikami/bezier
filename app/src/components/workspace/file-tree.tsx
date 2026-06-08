"use client";

// Agent C — recursive file tree. Folders expand lazily (listDir on expand),
// files are clickable and emit onSelect(path). Filters to md/mdx/yaml + dirs.

import * as React from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listTree, type FileEntry } from "@/lib/workspace";

interface FileTreeProps {
  /** Workspace root directory. */
  rootPath: string;
  /** Currently selected file path (highlighted). */
  selectedPath?: string | null;
  /** Fired when a file (not a folder) is clicked. */
  onSelect: (path: string) => void;
  className?: string;
}

/** Top-level tree: lists the root and renders its children. */
export function FileTree({
  rootPath,
  selectedPath,
  onSelect,
  className,
}: FileTreeProps) {
  return (
    <div className={cn("text-sm", className)}>
      <DirChildren
        // Remount on root change so loading/error/entries reset to their
        // initial state without a synchronous setState inside the effect.
        key={rootPath}
        path={rootPath}
        depth={0}
        selectedPath={selectedPath ?? null}
        onSelect={onSelect}
      />
    </div>
  );
}

interface DirChildrenProps {
  path: string;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/** Loads and renders the immediate children of a directory. */
function DirChildren({ path, depth, selectedPath, onSelect }: DirChildrenProps) {
  const [entries, setEntries] = React.useState<FileEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // `path` is fixed for the lifetime of a DirChildren instance (folder nodes are
  // keyed by path; the root is keyed by rootPath in <FileTree>), so this effect
  // runs once on mount. Initial state is already loading=true / error=null, so
  // no synchronous reset is needed here.
  React.useEffect(() => {
    let cancelled = false;
    listTree(path)
      .then((e) => {
        if (!cancelled) setEntries(e);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) {
    return (
      <Row depth={depth} className="text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading…</span>
      </Row>
    );
  }
  if (error) {
    return (
      <Row depth={depth} className="text-destructive">
        <span className="truncate">{error}</span>
      </Row>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <Row depth={depth} className="text-muted-foreground italic">
        <span>empty</span>
      </Row>
    );
  }

  return (
    <ul role="group" className="m-0 list-none p-0">
      {entries.map((entry) =>
        entry.isDir ? (
          <DirNode
            key={entry.path}
            entry={entry}
            depth={depth}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ) : (
          <FileNode
            key={entry.path}
            entry={entry}
            depth={depth}
            selected={entry.path === selectedPath}
            onSelect={onSelect}
          />
        ),
      )}
    </ul>
  );
}

interface DirNodeProps {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/** A folder row; lazily mounts DirChildren when expanded. */
function DirNode({ entry, depth, selectedPath, onSelect }: DirNodeProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <li>
      <Row
        as="button"
        depth={depth}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left hover:bg-accent/60"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        {open ? (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{entry.name}</span>
      </Row>
      {open && (
        <DirChildren
          path={entry.path}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}

interface FileNodeProps {
  entry: FileEntry;
  depth: number;
  selected: boolean;
  onSelect: (path: string) => void;
}

/** A clickable file row. */
function FileNode({ entry, depth, selected, onSelect }: FileNodeProps) {
  const Icon = entry.ext === "yaml" ? FileCode : FileText;
  return (
    <li>
      <Row
        as="button"
        depth={depth}
        onClick={() => onSelect(entry.path)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "w-full text-left hover:bg-accent/60",
          selected && "bg-accent text-accent-foreground",
        )}
      >
        {/* spacer aligning with folder chevrons */}
        <span className="size-3.5 shrink-0" />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{entry.name}</span>
      </Row>
    </li>
  );
}

type RowProps = {
  depth: number;
  children: React.ReactNode;
  className?: string;
} & (
  | ({ as: "button" } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as?: undefined } & React.HTMLAttributes<HTMLDivElement>)
);

/** Indented flex row shared by folder/file/status lines. */
function Row({ depth, children, className, as, ...rest }: RowProps) {
  const style = { paddingLeft: `${depth * 12 + 8}px` };
  const cls = cn(
    "flex items-center gap-1.5 rounded-sm py-1 pr-2 font-mono text-[13px] leading-tight",
    className,
  );
  if (as === "button") {
    return (
      <button
        type="button"
        style={style}
        className={cls}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }
  return (
    <div style={style} className={cls} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
