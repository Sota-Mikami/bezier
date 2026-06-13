"use client";

// CodeBrowser — the Implement "Code" sub-tab (DEC-059 / DEC-060). The REAL
// worktree source tree, EDITABLE. Left = lazy file tree + in-files search.
// Right = browser-style file TABS over CodeMirror editors (or image previews).
//
// Edits write straight into the worktree as uncommitted changes, so they flow
// into the existing machinery for free: the page's git-status watcher pulses
// Implement and the change lands in Commit / Ship. Concurrency is handled by a
// LOCK: while an agent action runs the editor is read-only; once the agent
// settles, a clean (un-edited) buffer reloads from disk so it reflects whatever
// the agent just wrote. A dirty buffer is never clobbered.
//
// DEC-060 — editor usability (deliberately NOT an IDE; depth → "open in IDE"):
//   ⌘F find/replace, ⌘G/Alt-g go-to-line, ⌘/ comment, bracket close + auto
//   indent, code folding, word-wrap toggle, AI-changed-line marking, multi-file
//   tabs, revert, and an escape hatch to the user's real editor / Finder.

import * as React from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import {
  EditorState,
  Compartment,
  StateField,
  StateEffect,
} from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentUnit,
  indentOnInput,
  foldGutter,
  codeFolding,
  foldKeymap,
  LanguageDescription,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
} from "@codemirror/search";
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  Lock,
  Save,
  ImageIcon,
  Search,
  X,
  ExternalLink,
  RotateCcw,
  WrapText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  listDirAll,
  readFile,
  writeFile,
  readFileBytes,
  grepFiles,
  openInEditor,
  revealInFinder,
  confirmDialog,
  type TreeEntry,
  type GrepFile,
} from "@/lib/ipc";
import type { ImplementSession } from "./use-implement-session";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
]);
const MAX_TEXT_BYTES = 2_000_000; // refuse to render huge files in the editor
const WRAP_KEY = "bezier:code:wrap";

function imageMime(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return `image/${ext}`;
  }
}

function relativeTo(path: string, root: string | null): string {
  if (root && path.startsWith(root + "/")) return path.slice(root.length + 1);
  return path;
}

// Parse a unified `git diff` for the NEW-side line numbers that the agent
// added/changed in `rel` (a worktree-relative path). Used to mark "AI changed"
// lines in the editor. Conservative: any '+' line counts.
function addedLinesForFile(diff: string, rel: string): Set<number> {
  const out = new Set<number>();
  if (!diff) return out;
  const lines = diff.split("\n");
  let inFile = false;
  let newLine = 0;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      inFile = false;
      continue;
    }
    if (line.startsWith("+++ ")) {
      // "+++ b/<path>" — strip the b/ prefix; tolerate quotes.
      const p = line.slice(4).replace(/^b\//, "").replace(/^"|"$/g, "");
      inFile = p === rel;
      continue;
    }
    if (!inFile) continue;
    if (line.startsWith("@@")) {
      const m = /\+(\d+)/.exec(line);
      newLine = m ? parseInt(m[1], 10) : newLine;
      continue;
    }
    if (line.startsWith("+++")) continue;
    if (line.startsWith("+")) {
      out.add(newLine);
      newLine += 1;
    } else if (line.startsWith("-")) {
      // deletion — no new-side line consumed
    } else {
      newLine += 1; // context
    }
  }
  return out;
}

// CodeMirror line-decoration field for AI-changed lines.
const setAiLines = StateEffect.define<Set<number>>();
const aiLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setAiLines)) {
        const ranges = [...e.value]
          .filter((n) => n >= 1 && n <= tr.state.doc.lines)
          .sort((a, b) => a - b)
          .map((n) =>
            Decoration.line({ class: "cm-ai-line" }).range(
              tr.state.doc.line(n).from,
            ),
          );
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Center the editor on a 1-based line + put the caret there.
function scrollToEditorLine(view: EditorView, line: number) {
  const max = view.state.doc.lines;
  const ln = Math.min(Math.max(1, Math.floor(line)), max);
  const pos = view.state.doc.line(ln).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
}

// ---------------------------------------------------------------------------
// CodeBrowser (the sub-tab)
// ---------------------------------------------------------------------------

export function CodeBrowser({ session }: { session: ImplementSession }) {
  const { ref, subPath, action, agentState, diff } = session;
  // Root the tree at the folder you actually OPENED — <worktree>/<subPath> — not
  // the whole repo. In a monorepo (opened a sub-package) this shows just that
  // package, matching the agent's cwd (DEC-059). git ops still span the worktree.
  const root = ref ? (subPath ? `${ref.path}/${subPath}` : ref.path) : null;
  const worktreeRoot = ref?.path ?? null;

  // The editor is locked (read-only) whenever the agent might be writing the
  // worktree, so two writers never race on the same file.
  const locked = action !== null || agentState === "running";

  // Tree state.
  const [rootChildren, setRootChildren] = React.useState<TreeEntry[] | null>(null);
  const [cache, setCache] = React.useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = React.useState<Set<string>>(new Set());
  const [treeError, setTreeError] = React.useState<string | null>(null);

  // Open file TABS (DEC-060) + which is active + per-tab dirty.
  const [tabs, setTabs] = React.useState<TreeEntry[]>([]);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [dirtyByPath, setDirtyByPath] = React.useState<Record<string, boolean>>({});
  // The pending jump target (set when a search hit is clicked). nonce re-fires
  // the scroll even for the same line.
  const [goto, setGoto] = React.useState<{
    path: string;
    line: number;
    nonce: number;
  } | null>(null);
  const gotoSeq = React.useRef(0);

  // In-files search (DEC-059).
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GrepFile[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const searchActive = query.trim() !== "";

  const loadDir = React.useCallback(async (path: string) => listDirAll(path), []);

  // Debounced grep. setState only ever runs inside the (async) timer callback.
  React.useEffect(() => {
    if (!root) return;
    const q = query.trim();
    let cancelled = false;
    const h = window.setTimeout(async () => {
      if (q === "") {
        if (!cancelled) {
          setResults(null);
          setSearching(false);
        }
        return;
      }
      if (!cancelled) setSearching(true);
      try {
        const r = await grepFiles(root, q, 0);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
    };
  }, [query, root]);

  // Load the root listing. CodeBrowser is keyed by the worktree path at the call
  // site, so `root` is stable for this instance (no synchronous reset needed).
  React.useEffect(() => {
    if (!root) return;
    let cancelled = false;
    (async () => {
      try {
        const kids = await loadDir(root);
        if (!cancelled) setRootChildren(kids);
      } catch (e) {
        if (!cancelled) {
          setRootChildren([]);
          setTreeError(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, loadDir]);

  // When the agent settles, refresh the tree (it may have created/removed files).
  const prevState = React.useRef(agentState);
  React.useEffect(() => {
    const was = prevState.current;
    prevState.current = agentState;
    if (!root) return;
    if (was === "running" && agentState !== "running") {
      let cancelled = false;
      (async () => {
        const dirs = [root, ...Array.from(expanded)];
        const next: Record<string, TreeEntry[]> = {};
        let newRoot: TreeEntry[] | null = null;
        for (const d of dirs) {
          try {
            const kids = await loadDir(d);
            if (d === root) newRoot = kids;
            else next[d] = kids;
          } catch {
            /* dir vanished */
          }
        }
        if (cancelled) return;
        if (newRoot) setRootChildren(newRoot);
        setCache((c) => ({ ...c, ...next }));
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [agentState, root, expanded, loadDir]);

  const toggleDir = React.useCallback(
    async (entry: TreeEntry) => {
      const path = entry.path;
      const isOpen = expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(path);
        else next.add(path);
        return next;
      });
      if (!isOpen && !cache[path]) {
        setLoadingDirs((prev) => new Set(prev).add(path));
        try {
          const kids = await loadDir(path);
          setCache((c) => ({ ...c, [path]: kids }));
        } catch {
          setCache((c) => ({ ...c, [path]: [] }));
        } finally {
          setLoadingDirs((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
    },
    [expanded, cache, loadDir],
  );

  // Open a file in a tab (adding it if new) + activate it + optional line jump.
  const selectFile = React.useCallback((entry: TreeEntry, line?: number) => {
    setTabs((prev) =>
      prev.some((t) => t.path === entry.path) ? prev : [...prev, entry],
    );
    setActivePath(entry.path);
    if (line) {
      gotoSeq.current += 1;
      setGoto({ path: entry.path, line, nonce: gotoSeq.current });
    }
  }, []);

  const openMatch = React.useCallback(
    (file: GrepFile, line: number) => {
      selectFile(
        { path: file.path, name: file.name, isDir: false, ext: file.ext },
        line,
      );
    },
    [selectFile],
  );

  const handleDirty = React.useCallback((path: string, d: boolean) => {
    setDirtyByPath((prev) => (prev[path] === d ? prev : { ...prev, [path]: d }));
  }, []);

  const closeTab = React.useCallback(
    async (path: string) => {
      if (dirtyByPath[path]) {
        const ok = await confirmDialog(
          "未保存の変更があります。破棄してタブを閉じますか？",
          { title: "未保存の変更", okLabel: "破棄して閉じる", cancelLabel: "やめる" },
        );
        if (!ok) return;
      }
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const next = prev.filter((t) => t.path !== path);
        if (path === activePath) {
          const neighbor = next[idx] ?? next[idx - 1] ?? null;
          setActivePath(neighbor?.path ?? null);
        }
        return next;
      });
      setDirtyByPath((prev) => {
        if (!(path in prev)) return prev;
        const n = { ...prev };
        delete n[path];
        return n;
      });
    },
    [dirtyByPath, activePath],
  );

  // ⌘W / Ctrl+W closes the ACTIVE tab — scoped to the Code browser (this fires
  // only when focus is inside it, since the keydown bubbles from the focused
  // tree/editor/search up to this root). The native "Close Window" ⌘W was
  // removed in Rust so it no longer quits the app (DEC-061).
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "w" &&
        activePath
      ) {
        e.preventDefault();
        e.stopPropagation();
        void closeTab(activePath);
      }
    },
    [activePath, closeTab],
  );

  if (!ref) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        worktree がありません。右の「チャット」で実装を始めると、ここに実コードが表示されます。
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0" onKeyDown={onKeyDown}>
      {/* Left: file tree + in-files search */}
      <div className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2.5 text-[11px] font-medium text-muted-foreground">
          <Folder className="size-3.5" />
          <span className="truncate" title={root ?? undefined}>
            {subPath || "worktree"}
          </span>
          {locked && (
            <span
              className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-400"
              title="エージェント実行中は読み取り専用"
            >
              <Lock className="size-3" />
            </span>
          )}
        </div>
        {/* Search box */}
        <div className="shrink-0 border-b p-1.5">
          <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 focus-within:ring-1 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ファイル内を検索…"
              className="h-7 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchActive &&
              (searching ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  title="クリア"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {searchActive ? (
            <SearchResults
              results={results}
              query={query.trim()}
              root={root}
              selectedPath={activePath}
              onPick={openMatch}
            />
          ) : rootChildren === null ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              読み込み中…
            </div>
          ) : treeError ? (
            <p className="px-3 py-2 text-xs text-destructive">{treeError}</p>
          ) : (
            <Tree
              entries={rootChildren}
              depth={0}
              expanded={expanded}
              cache={cache}
              loadingDirs={loadingDirs}
              selectedPath={activePath}
              onToggleDir={toggleDir}
              onSelectFile={(e) => selectFile(e)}
            />
          )}
        </div>
      </div>

      {/* Right: file tabs + the open editors */}
      <div className="flex min-w-0 flex-1 flex-col">
        {tabs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <FileIcon className="size-5 text-muted-foreground" />
            <p className="max-w-xs text-xs text-muted-foreground">
              左のツリーや検索からファイルを開くと、ここで中身を見て編集できます。保存すると worktree の変更として Commit / Ship に乗ります。
            </p>
          </div>
        ) : (
          <>
            <TabStrip
              tabs={tabs}
              activePath={activePath}
              dirtyByPath={dirtyByPath}
              root={root}
              onActivate={setActivePath}
              onClose={(p) => void closeTab(p)}
            />
            <div className="relative min-h-0 flex-1">
              {tabs.map((t) => (
                <div
                  key={t.path}
                  className={cn(
                    "absolute inset-0",
                    t.path !== activePath && "hidden",
                  )}
                >
                  <FileViewer
                    entry={t}
                    locked={locked}
                    agentState={agentState}
                    diff={diff}
                    worktreeRoot={worktreeRoot}
                    gotoLine={goto?.path === t.path ? goto.line : undefined}
                    gotoNonce={goto?.path === t.path ? goto.nonce : undefined}
                    onDirtyChange={(d) => handleDirty(t.path, d)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabStrip
// ---------------------------------------------------------------------------

function TabStrip({
  tabs,
  activePath,
  dirtyByPath,
  root,
  onActivate,
  onClose,
}: {
  tabs: TreeEntry[];
  activePath: string | null;
  dirtyByPath: Record<string, boolean>;
  root: string | null;
  onActivate: (p: string) => void;
  onClose: (p: string) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b bg-muted/30">
      {tabs.map((t) => {
        const active = t.path === activePath;
        const dirty = dirtyByPath[t.path];
        return (
          <div
            key={t.path}
            role="tab"
            aria-selected={active}
            onClick={() => onActivate(t.path)}
            title={relativeTo(t.path, root)}
            className={cn(
              "group flex max-w-[12rem] min-w-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/50",
            )}
          >
            {IMAGE_EXTS.has(t.ext) ? (
              <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 truncate">{t.name}</span>
            {dirty ? (
              <span
                className="ml-0.5 size-1.5 shrink-0 rounded-full bg-amber-500 group-hover:hidden"
                aria-label="未保存"
              />
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.path);
              }}
              title="閉じる"
              className={cn(
                "ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                dirty ? "hidden group-hover:inline-flex" : "opacity-60 hover:opacity-100",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree (recursive)
// ---------------------------------------------------------------------------

function Tree({
  entries,
  depth,
  expanded,
  cache,
  loadingDirs,
  selectedPath,
  onToggleDir,
  onSelectFile,
}: {
  entries: TreeEntry[];
  depth: number;
  expanded: Set<string>;
  cache: Record<string, TreeEntry[]>;
  loadingDirs: Set<string>;
  selectedPath: string | null;
  onToggleDir: (e: TreeEntry) => void;
  onSelectFile: (e: TreeEntry) => void;
}) {
  return (
    <ul>
      {entries.map((entry) => {
        const isOpen = entry.isDir && expanded.has(entry.path);
        const isSel = entry.path === selectedPath;
        return (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => (entry.isDir ? onToggleDir(entry) : onSelectFile(entry))}
              title={entry.name}
              style={{ paddingLeft: depth * 12 + 8 }}
              className={cn(
                "flex w-full items-center gap-1 py-[3px] pr-2 text-left text-xs transition-colors",
                isSel
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              {entry.isDir ? (
                <>
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  {isOpen ? (
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </>
              ) : (
                <>
                  <span className="size-3 shrink-0" />
                  {IMAGE_EXTS.has(entry.ext) ? (
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </>
              )}
              <span className="truncate">{entry.name}</span>
              {entry.isDir && loadingDirs.has(entry.path) && (
                <Loader2 className="ml-auto size-3 shrink-0 animate-spin text-muted-foreground" />
              )}
            </button>
            {isOpen && cache[entry.path] && (
              <Tree
                entries={cache[entry.path]}
                depth={depth + 1}
                expanded={expanded}
                cache={cache}
                loadingDirs={loadingDirs}
                selectedPath={selectedPath}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// SearchResults ("in files" grep — grouped by file, expandable, click→jump)
// ---------------------------------------------------------------------------

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      out.push(<span key={k++}>{text.slice(i)}</span>);
      break;
    }
    if (idx > i) out.push(<span key={k++}>{text.slice(i, idx)}</span>);
    out.push(
      <mark
        key={k++}
        className="rounded-[2px] bg-amber-300/60 text-foreground dark:bg-amber-500/40"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <>{out}</>;
}

function SearchResults({
  results,
  query,
  root,
  selectedPath,
  onPick,
}: {
  results: GrepFile[] | null;
  query: string;
  root: string | null;
  selectedPath: string | null;
  onPick: (file: GrepFile, line: number) => void;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (results === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        検索中…
      </div>
    );
  }
  if (results.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">一致なし</p>;
  }

  const total = results.reduce((n, f) => n + f.matches.length, 0);

  return (
    <div>
      <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
        一致 <span className="font-medium text-foreground">{total}</span> 件 ・{" "}
        {results.length} ファイル
      </div>
      <ul>
        {results.map((file) => {
          const isOpen = !collapsed.has(file.path);
          const rel = relativeTo(file.path, root);
          const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => toggle(file.path)}
                title={rel}
                className="flex w-full items-center gap-1 px-2 py-[3px] text-left text-xs text-foreground/80 hover:bg-muted"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                {IMAGE_EXTS.has(file.ext) ? (
                  <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate">
                  {dir && <span className="text-muted-foreground">{dir}</span>}
                  <span className="font-medium">{file.name}</span>
                </span>
                <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
                  {file.matches.length}
                </span>
              </button>
              {isOpen && (
                <ul>
                  {file.matches.map((m) => (
                    <li key={m.line}>
                      <button
                        type="button"
                        onClick={() => onPick(file, m.line)}
                        className={cn(
                          "flex w-full items-start gap-2 py-[2px] pr-2 pl-6 text-left font-mono text-[11px] leading-[1.5] hover:bg-muted",
                          file.path === selectedPath && "bg-muted/50",
                        )}
                      >
                        <span className="w-8 shrink-0 select-none text-right text-muted-foreground tabular-nums">
                          {m.line}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground/80">
                          <Highlight text={m.text.trimStart()} q={query} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileViewer (one open file)
// ---------------------------------------------------------------------------

type FileKind = "text" | "image" | "binary" | "toobig";

function FileViewer({
  entry,
  locked,
  agentState,
  diff,
  worktreeRoot,
  gotoLine,
  gotoNonce,
  onDirtyChange,
}: {
  entry: TreeEntry;
  locked: boolean;
  agentState: ImplementSession["agentState"];
  diff: string;
  worktreeRoot: string | null;
  gotoLine?: number;
  gotoNonce?: number;
  onDirtyChange: (d: boolean) => void;
}) {
  const isImage = IMAGE_EXTS.has(entry.ext);
  const [kind, setKind] = React.useState<FileKind | null>(null);
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [dirty, setDirtyState] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [wrap, setWrap] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(WRAP_KEY) === "1";
  });

  const hostRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const savedTextRef = React.useRef<string>("");
  const editableComp = React.useRef(new Compartment());
  const wrapComp = React.useRef(new Compartment());

  const rel = worktreeRoot ? relativeTo(entry.path, worktreeRoot) : entry.path;

  const setDirty = React.useCallback(
    (d: boolean) => {
      setDirtyState(d);
      onDirtyChange(d);
    },
    [onDirtyChange],
  );

  const save = React.useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    if (text === savedTextRef.current) {
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      await writeFile(entry.path, text);
      savedTextRef.current = text;
      setDirty(false);
    } catch (e) {
      setLoadErr(String(e));
    } finally {
      setSaving(false);
    }
  }, [entry.path, setDirty]);

  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Revert local edits → reload the on-disk content into the editor.
  const revert = React.useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    const ok = await confirmDialog("このファイルの未保存の変更を破棄しますか？", {
      title: "変更を破棄",
      okLabel: "破棄",
      cancelLabel: "やめる",
    });
    if (!ok) return;
    try {
      const text = await readFile(entry.path);
      savedTextRef.current = text;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      setDirty(false);
    } catch (e) {
      setLoadErr(String(e));
    }
  }, [entry.path, setDirty]);

  const toggleWrap = React.useCallback(() => {
    setWrap((w) => {
      const next = !w;
      try {
        window.localStorage.setItem(WRAP_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      viewRef.current?.dispatch({
        effects: wrapComp.current.reconfigure(
          next ? EditorView.lineWrapping : [],
        ),
      });
      return next;
    });
  }, []);

  // Build the editor once we know the file is text.
  const mountEditor = React.useCallback(
    (text: string, langExt: unknown) => {
      const host = hostRef.current;
      if (!host) return;
      host.replaceChildren();
      const exts = [
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        codeFolding(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        indentUnit.of("  "),
        highlightSelectionMatches(),
        search({ top: true }),
        aiLineField,
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              void saveRef.current();
              return true;
            },
          },
          { key: "Mod-/", run: toggleComment },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const t = u.state.doc.toString();
            setDirty(t !== savedTextRef.current);
          }
        }),
        editableComp.current.of([
          EditorView.editable.of(!locked),
          EditorState.readOnly.of(locked),
        ]),
        wrapComp.current.of(wrap ? EditorView.lineWrapping : []),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12.5px" },
          ".cm-scroller": {
            fontFamily:
              "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            lineHeight: "1.6",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            color: "var(--color-muted-foreground)",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-ai-line": {
            backgroundColor: "rgba(16,185,129,0.08)",
            boxShadow: "inset 2px 0 0 rgba(16,185,129,0.55)",
          },
        }),
        ...(langExt ? [langExt as never] : []),
      ];
      const view = new EditorView({
        state: EditorState.create({ doc: text, extensions: exts }),
        parent: host,
      });
      viewRef.current = view;
    },
    [locked, wrap, setDirty],
  );

  // Initial load of this file.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isImage) {
        try {
          const bytes = await readFileBytes(entry.path);
          if (cancelled) return;
          const url = URL.createObjectURL(
            new Blob([bytes as BlobPart], { type: imageMime(entry.ext) }),
          );
          setImgUrl(url);
          setKind("image");
        } catch (e) {
          if (!cancelled) {
            setKind("binary");
            setLoadErr(String(e));
          }
        }
        return;
      }
      try {
        const text = await readFile(entry.path);
        if (cancelled) return;
        if (text.length > MAX_TEXT_BYTES) {
          setKind("toobig");
          return;
        }
        savedTextRef.current = text;
        const desc = LanguageDescription.matchFilename(languages, entry.name);
        let langExt: unknown = null;
        if (desc) {
          try {
            langExt = await desc.load();
          } catch {
            langExt = null;
          }
          if (cancelled) return;
        }
        setKind("text");
        requestAnimationFrame(() => {
          if (cancelled) return;
          mountEditor(text, langExt);
          const view = viewRef.current;
          if (view) {
            const changed = addedLinesForFile(diff, rel);
            if (changed.size) view.dispatch({ effects: setAiLines.of(changed) });
            if (gotoLine) scrollToEditorLine(view, gotoLine);
          }
        });
      } catch {
        if (!cancelled) setKind("binary");
      }
    })();
    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path]);

  // Revoke the image object URL on unmount / change.
  React.useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  // Reconfigure read-only when the lock flips (agent starts/stops).
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableComp.current.reconfigure([
        EditorView.editable.of(!locked),
        EditorState.readOnly.of(locked),
      ]),
    });
  }, [locked, kind]);

  // Re-jump when gotoNonce changes (a different search hit in this file).
  React.useEffect(() => {
    if (!gotoLine || kind !== "text") return;
    const view = viewRef.current;
    if (view) scrollToEditorLine(view, gotoLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoNonce, kind]);

  // Recompute AI-changed-line marks when the worktree diff changes.
  React.useEffect(() => {
    if (kind !== "text") return;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setAiLines.of(addedLinesForFile(diff, rel)) });
  }, [diff, rel, kind]);

  // When the agent settles and our buffer is clean, reload from disk.
  const prevState = React.useRef(agentState);
  React.useEffect(() => {
    const was = prevState.current;
    prevState.current = agentState;
    if (!(was === "running" && agentState !== "running")) return;
    if (kind !== "text" || dirty) return;
    let cancelled = false;
    (async () => {
      try {
        const text = await readFile(entry.path);
        if (cancelled) return;
        const view = viewRef.current;
        if (!view || text === view.state.doc.toString()) {
          savedTextRef.current = text;
          return;
        }
        savedTextRef.current = text;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
        setDirty(false);
      } catch {
        /* file removed — leave the stale buffer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentState, kind, dirty, entry.path, setDirty]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* File header: path + actions */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80"
          title={rel}
        >
          {rel}
          {dirty && <span className="ml-1 text-amber-600 dark:text-amber-400">●</span>}
        </span>

        {locked && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <Lock className="size-3" />
            実行中は読み取り専用
          </span>
        )}

        {kind === "text" && (
          <button
            type="button"
            onClick={toggleWrap}
            title="行の折り返し"
            className={cn(
              "rounded p-1 transition-colors hover:bg-muted",
              wrap ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <WrapText className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void openInEditor(entry.path).catch(() => {})}
          title="実 IDE で開く（Cursor / VS Code …）"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void revealInFinder(entry.path).catch(() => {})}
          title="Finder で表示"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Folder className="size-3.5" />
        </button>

        {kind === "text" && !locked && dirty && (
          <button
            type="button"
            onClick={() => void revert()}
            title="変更を破棄してディスクに戻す"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}

        {kind === "text" && !locked && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            title="保存（⌘S）"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
              dirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground",
            )}
          >
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            保存
          </button>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {kind === null ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            読み込み中…
          </div>
        ) : kind === "image" ? (
          <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-6">
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={entry.name}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        ) : kind === "toobig" ? (
          <p className="p-4 text-xs text-muted-foreground">
            ファイルが大きすぎてプレビューできません（2MB 超）。
          </p>
        ) : kind === "binary" ? (
          <p className="p-4 text-xs text-muted-foreground">
            バイナリファイルのためプレビューできません。
            {loadErr && <span className="block opacity-60">{loadErr}</span>}
          </p>
        ) : (
          <div ref={hostRef} className="h-full overflow-hidden" />
        )}
      </div>
    </div>
  );
}

export default CodeBrowser;
