"use client";

// CodeBrowser — the Implement "Code" sub-tab (DEC-059). The REAL worktree
// source tree, EDITABLE. Left = lazy file tree (list_dir_all). Right = a
// CodeMirror editor (language by filename, ⌘S to save) or an image preview.
//
// Edits write straight into the worktree as uncommitted changes, so they flow
// into the existing machinery for free: the page's git-status watcher pulses
// Implement and the change lands in Commit / Ship. Concurrency is handled by a
// LOCK: while an agent action runs the editor is read-only; once the agent
// settles, a clean (un-edited) buffer reloads from disk so it reflects whatever
// the agent just wrote. A dirty buffer is never clobbered — switching files or
// reloading asks first.

import * as React from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentUnit,
  LanguageDescription,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  Lock,
  Save,
  ImageIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  listDirAll,
  readFile,
  writeFile,
  readFileBytes,
  confirmDialog,
  type TreeEntry,
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

// ---------------------------------------------------------------------------
// CodeBrowser (the sub-tab)
// ---------------------------------------------------------------------------

export function CodeBrowser({ session }: { session: ImplementSession }) {
  const { ref, subPath, action, agentState } = session;
  // Root the tree at the folder you actually OPENED — <worktree>/<subPath> — not
  // the whole repo. In a monorepo (opened a sub-package) this shows just that
  // package, matching the agent's cwd (DEC-059). git ops still span the worktree.
  const root = ref ? (subPath ? `${ref.path}/${subPath}` : ref.path) : null;

  // The editor is locked (read-only) whenever the agent might be writing the
  // worktree, so two writers never race on the same file.
  const locked = action !== null || agentState === "running";

  // Tree state: the root listing + a per-directory children cache + the set of
  // expanded directory paths. Lazy — children load on first expand.
  const [rootChildren, setRootChildren] = React.useState<TreeEntry[] | null>(null);
  const [cache, setCache] = React.useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<TreeEntry | null>(null);
  const [treeError, setTreeError] = React.useState<string | null>(null);

  // Whether the open file has unsaved edits — lifted so switching files / the
  // agent settling can guard against clobbering them.
  const [dirty, setDirty] = React.useState(false);

  const loadDir = React.useCallback(async (path: string) => {
    return listDirAll(path);
  }, []);

  // Load the root listing. CodeBrowser is keyed by the worktree path at the call
  // site, so `root` is stable for this instance — no synchronous reset needed
  // (setState only ever runs after the await).
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

  // When the agent settles (running → idle), refresh the tree (it may have
  // created/removed files) without losing the user's expansion state.
  const prevState = React.useRef(agentState);
  React.useEffect(() => {
    const was = prevState.current;
    prevState.current = agentState;
    if (!root) return;
    if (was === "running" && agentState !== "running") {
      let cancelled = false;
      (async () => {
        // Re-fetch the root + every currently-expanded directory.
        const dirs = [root, ...Array.from(expanded)];
        const next: Record<string, TreeEntry[]> = {};
        let newRoot: TreeEntry[] | null = null;
        for (const d of dirs) {
          try {
            const kids = await loadDir(d);
            if (d === root) newRoot = kids;
            else next[d] = kids;
          } catch {
            /* dir vanished — drop it */
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

  const selectFile = React.useCallback(
    async (entry: TreeEntry) => {
      if (entry.path === selected?.path) return;
      if (dirty) {
        const ok = await confirmDialog(
          "未保存の変更があります。破棄して別のファイルを開きますか？",
          { title: "未保存の変更", okLabel: "破棄して開く", cancelLabel: "やめる" },
        );
        if (!ok) return;
      }
      setDirty(false);
      setSelected(entry);
    },
    [selected?.path, dirty],
  );

  if (!ref) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        worktree がありません。右の「チャット」で実装を始めると、ここに実コードが表示されます。
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: file tree */}
      <div className="flex w-60 shrink-0 flex-col border-r">
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
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {rootChildren === null ? (
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
              selectedPath={selected?.path ?? null}
              onToggleDir={toggleDir}
              onSelectFile={selectFile}
            />
          )}
        </div>
      </div>

      {/* Right: the open file (editor or image) */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <FileViewer
            key={selected.path}
            entry={selected}
            locked={locked}
            agentState={agentState}
            onDirtyChange={setDirty}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <FileIcon className="size-5 text-muted-foreground" />
            <p className="max-w-xs text-xs text-muted-foreground">
              左のツリーからファイルを選ぶと、ここで中身を見て編集できます。保存すると worktree の変更として Commit / Ship に乗ります。
            </p>
          </div>
        )}
      </div>
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
// FileViewer (one open file — mounted fresh per path via key)
// ---------------------------------------------------------------------------

type FileKind = "text" | "image" | "binary" | "toobig";

function FileViewer({
  entry,
  locked,
  agentState,
  onDirtyChange,
}: {
  entry: TreeEntry;
  locked: boolean;
  agentState: ImplementSession["agentState"];
  onDirtyChange: (d: boolean) => void;
}) {
  const isImage = IMAGE_EXTS.has(entry.ext);
  const [kind, setKind] = React.useState<FileKind | null>(null);
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [dirty, setDirtyState] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const hostRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const savedTextRef = React.useRef<string>(""); // last on-disk text
  const editableComp = React.useRef(new Compartment());

  const setDirty = React.useCallback(
    (d: boolean) => {
      setDirtyState(d);
      onDirtyChange(d);
    },
    [onDirtyChange],
  );

  // Save the current buffer back to disk (zero work if unchanged).
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

  // Keep a stable ref to the latest save() so the ⌘S keymap closure (bound once
  // at editor mount) always calls the current implementation.
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Build the editor once we know the file is text. Mounts into hostRef.
  const mountEditor = React.useCallback(
    (text: string, langExt: unknown) => {
      const host = hostRef.current;
      if (!host) return;
      host.replaceChildren();
      const exts = [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        indentUnit.of("  "),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              void saveRef.current();
              return true;
            },
          },
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
        }),
        ...(langExt ? [langExt as never] : []),
      ];
      const view = new EditorView({
        state: EditorState.create({ doc: text, extensions: exts }),
        parent: host,
      });
      viewRef.current = view;
    },
    [locked, setDirty],
  );

  // Initial load of this file. FileViewer is keyed by path at the call site, so
  // it mounts fresh per file — initial state is already null (no sync reset).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Image → blob preview.
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
      // Text → editor (or "binary" if it isn't valid UTF-8).
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
        // Mount after paint so hostRef is in the DOM.
        requestAnimationFrame(() => {
          if (!cancelled) mountEditor(text, langExt);
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

  // When the agent settles and our buffer is clean, reload from disk so we show
  // what the agent wrote. A dirty buffer is left untouched.
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

  const rel = entry.name;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* File header: path + dirty/lock + Save */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
          {rel}
          {dirty && <span className="ml-1 text-amber-600 dark:text-amber-400">●</span>}
        </span>
        {locked ? (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <Lock className="size-3" />
            実行中は読み取り専用
          </span>
        ) : (
          kind === "text" && (
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
          )
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
