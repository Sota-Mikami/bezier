"use client";

// Reusable markdown slot editor — the /workspace `Editor` pattern, factored for
// the Issue's spec.md artifact slot. Reads a file into an OpenDoc and mounts the
// shared CodeMirror <MarkdownEditor>.
//
// AUTOSAVE (v0.5 slice 2.6): there is NO manual Save button. Edits are persisted
// on a short debounce after typing stops, and flushed on blur + on unmount
// (leaving the Spec tab / issue). Crucially we do NOT remount / re-key / re-read
// the editor on save — that would reset the caret/scroll mid-typing. The
// editor's in-memory text is the source of truth; save() writes bytes + clears
// the dirty flag without remounting. Frontmatter is preserved verbatim
// (frontmatterDirty is always false here — slot frontmatter is a back-link we
// never edit through this surface), so a clean save is a zero-diff write.

import * as React from "react";
import dynamic from "next/dynamic";
import { FileText, Loader2, Check, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { readFile } from "@/lib/ipc";
import { readDoc, type OpenDoc } from "@/lib/workspace";
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from "@/components/workspace/markdown-editor";

// CodeMirror touches the DOM at module load — client-only (output: "export").
const MarkdownEditor = dynamic(
  () => import("@/components/workspace/markdown-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading editor…
      </div>
    ),
  },
) as React.ForwardRefExoticComponent<
  MarkdownEditorProps & React.RefAttributes<MarkdownEditorHandle>
>;

const AUTOSAVE_DEBOUNCE_MS = 700;
// How often we re-read spec.md from disk to detect EXTERNAL edits (the agent
// writes spec.md via --add-dir, outside this editor). Cheap readFile; chosen so
// agent edits surface within a couple seconds without busy-polling.
const WATCH_POLL_MS = 1500;

/** Full file bytes = preserved frontmatter block + body (what autosave writes). */
function fullText(doc: Pick<OpenDoc, "rawFrontmatter" | "body">): string {
  return `${doc.rawFrontmatter ?? ""}${doc.body}`;
}

/**
 * Line-level diff for the live change flash (DEC-012 §7): return the 1-based line
 * numbers in `next` that are ADDED or CHANGED vs `prev`. An LCS over lines marks
 * the unchanged (matched) lines; everything else in `next` is what visually
 * changed. Hand-rolled (no dep) and lightweight — spec.md is small. For
 * pathologically large inputs we fall back to a cheap multiset diff to avoid an
 * O(n·m) table blow-up.
 */
function changedLineNumbers(prev: string, next: string): number[] {
  const a = prev.split("\n");
  const b = next.split("\n");
  const n = a.length;
  const m = b.length;
  if (m === 0) return [];

  // Cheap fallback for huge inputs: a `next` line is "changed" if `prev` has no
  // remaining (unconsumed) copy of it. Order-insensitive but bounded + correct
  // enough for a flash.
  if ((n + 1) * (m + 1) > 4_000_000) {
    const counts = new Map<string, number>();
    for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
    const out: number[] = [];
    for (let k = 0; k < m; k++) {
      const c = counts.get(b[k]) ?? 0;
      if (c > 0) counts.set(b[k], c - 1);
      else out.push(k + 1);
    }
    return out;
  }

  // LCS length table, then backtrack to mark which `b` lines are part of the LCS.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matchedB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matchedB.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const out: number[] = [];
  for (let k = 0; k < m; k++) if (!matchedB.has(k)) out.push(k + 1);
  return out;
}

// --- Table of contents (DEC-057) ------------------------------------------
// A read-only ToC for the Spec, derived from the md headings. It is NOT editable
// — it just follows the content. Clicking a heading scrolls the editor to it.

interface TocHeading {
  level: number;
  text: string;
  /** 1-based body line (matches MarkdownEditor.scrollToLine). */
  line: number;
}

/** Parse `# … ###### …` headings from the body, skipping fenced code blocks. */
function parseHeadings(body: string): TocHeading[] {
  const lines = body.split("\n");
  const out: TocHeading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    // Skip H1 — that's the spec title; the ToC lists ## and deeper (DEC-057).
    if (m && m[1].length >= 2) {
      out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    }
  }
  return out;
}

function headingsEqual(a: TocHeading[], b: TocHeading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].line !== b[i].line || a[i].level !== b[i].level || a[i].text !== b[i].text)
      return false;
  }
  return true;
}

function SpecToc({
  headings,
  activeLine,
  onJump,
}: {
  headings: TocHeading[];
  /** The heading line of the section currently in view (highlighted). */
  activeLine: number | null;
  onJump: (line: number) => void;
}) {
  const minLevel = Math.min(...headings.map((h) => h.level));
  return (
    <nav className="hidden w-56 shrink-0 overflow-y-auto border-r bg-muted/30 px-2 py-3 lg:block">
      <div className="px-2 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
        目次
      </div>
      <ul className="space-y-px">
        {headings.map((h, i) => {
          const top = h.level <= minLevel;
          const active = h.line === activeLine;
          return (
            <li key={`${h.line}-${i}`}>
              <button
                type="button"
                onClick={() => onJump(h.line)}
                title={h.text}
                className={cn(
                  "relative block w-full truncate rounded-md py-1 pr-2 text-left text-xs leading-snug transition-colors",
                  active
                    ? "bg-foreground/[0.06] font-medium text-foreground"
                    : cn(
                        "hover:bg-muted hover:text-foreground",
                        top ? "font-medium text-foreground/80" : "text-muted-foreground",
                      ),
                )}
                style={{ paddingLeft: `${10 + (h.level - minLevel) * 14}px` }}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
                )}
                {h.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SlotEditor({
  path,
  label,
  onExternalChange,
}: {
  path: string;
  label?: string;
  /**
   * Fired when the watch poll adopts an EXTERNAL (agent) rewrite of spec.md on
   * the CLEAN path — lets the parent auto-switch the center tab to Spec + pulse
   * it (DEC-012 §7). NOT fired on the dirty-conflict path (the user is mid-edit).
   */
  onExternalChange?: () => void;
}) {
  // Remount only on path change so each load re-baselines from disk. Saves do
  // NOT remount (that would jump the caret) — autosave just writes in place.
  return (
    <SlotEditorInner
      key={path}
      path={path}
      label={label}
      onExternalChange={onExternalChange}
    />
  );
}

function SlotEditorInner({
  path,
  label,
  onExternalChange,
}: {
  path: string;
  label?: string;
  onExternalChange?: () => void;
}) {
  const [doc, setDoc] = React.useState<OpenDoc | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  // Bumped to remount the CodeMirror editor when we adopt EXTERNAL content
  // (agent edited spec.md). The editor mounts once and only re-baselines on a
  // key change, so this is how a non-dirty external edit is pulled in.
  const [reloadNonce, setReloadNonce] = React.useState(0);
  // Set when disk diverged from our baseline WHILE the editor is dirty — a real
  // conflict the user must resolve (adopt external vs keep mine).
  const [conflict, setConflict] = React.useState(false);
  // 1-based line numbers to FLASH on the next remount (the live change viz). Set
  // when adopting an external rewrite on the CLEAN path; the re-keyed
  // MarkdownEditor paints + fades them. [] = no flash (e.g. dirty-path reload).
  const [flashLines, setFlashLines] = React.useState<number[]>([]);
  // Read-only ToC headings (DEC-057), derived from the live body.
  const [headings, setHeadings] = React.useState<TocHeading[]>([]);
  // 1-based body line at the top of the editor viewport → which section is active.
  const [scrollTopLine, setScrollTopLine] = React.useState(1);

  const mdRef = React.useRef<MarkdownEditorHandle>(null);
  // Latest onExternalChange in a ref so applyExternal stays stable (it's a watch
  // effect dep).
  const onExternalChangeRef = React.useRef(onExternalChange);
  React.useEffect(() => {
    onExternalChangeRef.current = onExternalChange;
  }, [onExternalChange]);
  const timerRef = React.useRef<number | null>(null);
  const savingRef = React.useRef(false);
  const doSaveRef = React.useRef<() => Promise<void>>(async () => {});
  // The full file bytes we consider "in sync" — updated on load, on each of OUR
  // autosaves, and on reload. The watch poll compares disk against this to tell
  // OUR writes apart from EXTERNAL (agent) writes.
  const baselineRef = React.useRef<string>("");
  // Frontmatter block to re-attach when computing the post-save baseline (slot
  // frontmatter is never edited through this surface, so it's preserved verbatim
  // and matches what MarkdownEditor.save() writes).
  const frontmatterRef = React.useRef<string>("");

  React.useEffect(() => {
    let cancelled = false;
    readDoc(path)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setHeadings(parseHeadings(d.body));
        baselineRef.current = fullText(d);
        frontmatterRef.current = d.rawFrontmatter ?? "";
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Persist the editor's in-memory text. Guarded against overlap; reschedules
  // itself if new edits landed during the write. Never remounts.
  const doSave = React.useCallback(async () => {
    const md = mdRef.current;
    if (!md || savingRef.current || !md.isDirty()) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    // Capture the exact text save() will persist (read synchronously, same tick
    // as save()'s own snapshot) so the post-save baseline matches disk and the
    // watch poll doesn't mistake OUR write for an external one.
    const pending = md.getText();
    try {
      await md.save(); // writes `${frontmatter}${pending}` + clears dirty
      baselineRef.current = `${frontmatterRef.current}${pending}`;
      // Our own save resolves any pending external-conflict banner: disk now
      // holds our content and the baseline tracks it.
      setConflict(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
      // Edits during the await? Re-arm the debounce.
      if (mdRef.current?.isDirty()) {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void doSaveRef.current();
        }, AUTOSAVE_DEBOUNCE_MS);
      }
    }
  }, [clearTimer]);

  React.useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  // Reset the debounce on every edit (onEdit fires per keystroke) + refresh the
  // ToC from the live text (cheap; only re-renders when the heading set changes).
  const handleEdit = React.useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void doSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
    const t = mdRef.current?.getText();
    if (t != null) {
      setHeadings((prev) => {
        const next = parseHeadings(t);
        return headingsEqual(prev, next) ? prev : next;
      });
    }
  }, [clearTimer]);

  // Flush immediately on blur (e.g. clicking into the terminal / Design).
  const flush = React.useCallback(() => {
    clearTimer();
    void doSaveRef.current();
  }, [clearTimer]);

  // Re-read disk + remount the editor so it re-baselines from the external
  // content. Caller must ensure no local edits will be lost — either the editor
  // is CLEAN, or its dirty flag was cleared first (so the remount's flushOnUnmount
  // is a no-op and won't write the discarded edits back over the external one).
  //
  // `flash` (CLEAN path only): compute a line diff old→new BEFORE swapping the
  // baseline, stage the changed line numbers so the re-keyed MarkdownEditor
  // flashes them, and notify the parent (auto-switch + pulse). The dirty-path
  // reload skips both — the user is mid-edit and shouldn't be yanked away.
  const applyExternal = React.useCallback(
    async (flash: boolean) => {
      clearTimer();
      try {
        // Old body = baseline minus its (verbatim) frontmatter block. CM edits
        // only the body, so line numbers are body-relative.
        const oldBody = baselineRef.current.slice(frontmatterRef.current.length);
        const fresh = await readDoc(path);
        setFlashLines(flash ? changedLineNumbers(oldBody, fresh.body) : []);
        baselineRef.current = fullText(fresh);
        frontmatterRef.current = fresh.rawFrontmatter ?? "";
        setDoc(fresh);
        setHeadings(parseHeadings(fresh.body));
        setConflict(false);
        setReloadNonce((n) => n + 1); // remount -> re-baseline from fresh.body
        if (flash) onExternalChangeRef.current?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [path, clearTimer],
  );

  // Auto-adopt (editor CLEAN): the unmount-flush is a no-op when not dirty, so a
  // direct remount is safe and immediate. This is the live-change path: flash +
  // notify the parent.
  const adoptExternal = React.useCallback(
    () => applyExternal(true),
    [applyExternal],
  );

  // Explicit「リロード（外部を採用）」from the conflict banner (editor DIRTY):
  // drop the dirty flag first so the remount's flushOnUnmount won't write the
  // about-to-be-discarded local edits back, THEN adopt the external content.
  const discardAndReload = React.useCallback(() => {
    clearTimer();
    mdRef.current?.clearDirty();
    void applyExternal(false); // dirty path: no flash, no auto-switch
  }, [clearTimer, applyExternal]);

  // Keep the user's in-editor edits and stop nagging: adopt disk as the new
  // baseline WITHOUT touching the editor. The editor stays dirty (vs its loaded
  // baseline), so the next autosave overwrites disk with the user's version.
  const keepMine = React.useCallback(async () => {
    try {
      baselineRef.current = await readFile(path);
    } catch {
      /* if disk is unreadable, leave the baseline as-is */
    }
    setConflict(false);
  }, [path]);

  // Watch poll: detect EXTERNAL edits to spec.md (the agent writes it via
  // --add-dir). Compare disk against our baseline (set on load / our saves /
  // reload).
  //   - disk === baseline                  -> nothing changed (incl. just after
  //                                           our own autosave, which updated the
  //                                           baseline) — no spurious reload.
  //   - disk != baseline && editor CLEAN   -> external edit, no local work to
  //                                           lose -> auto-adopt (remount).
  //   - disk != baseline && editor DIRTY   -> conflict -> show the banner.
  React.useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const tick = async () => {
      let disk: string;
      try {
        disk = await readFile(path);
      } catch {
        return; // file briefly unreadable (e.g. agent rewriting) — try later
      }
      if (cancelled) return;
      if (disk === baselineRef.current) {
        if (conflict) setConflict(false); // external content reverted to baseline
        return;
      }
      // Re-check dirtiness live (React `dirty` state can lag the editor).
      if (mdRef.current?.isDirty()) {
        setConflict(true);
      } else {
        void adoptExternal();
      }
    };
    const handle = window.setInterval(() => void tick(), WATCH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [path, loading, conflict, adoptExternal]);

  // Flush a final save if the parent unmounts before the debounce fires. The
  // MarkdownEditor child unmounts first, so we ALSO pass flushOnUnmount to it as
  // the real safety net; this clears our pending timer.
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // The section in view = the last heading at or above the viewport-top line.
  const activeHeadingLine = React.useMemo<number | null>(() => {
    let active: number | null = headings.length ? headings[0].line : null;
    for (const h of headings) {
      if (h.line <= scrollTopLine) active = h.line;
      else break;
    }
    return active;
  }, [headings, scrollTopLine]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{label ?? "Artifact"}</span>
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={path}
        >
          {path.slice(path.lastIndexOf("/.bezier/") + 1) || path}
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[11px]">
          {saving ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              保存中…
            </span>
          ) : dirty ? (
            <span className="text-amber-600 dark:text-amber-500">未保存…</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Check className="size-3" />
              保存済み
            </span>
          )}
        </div>
      </header>

      {/* External-edit conflict banner (agent rewrote spec.md while the user has
          unsaved edits). Subtle, with the two explicit resolutions. */}
      {conflict && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          <RefreshCw className="size-3.5 shrink-0" />
          <span className="flex-1">外部で更新されました（エージェントが spec.md を編集）。</span>
          <button
            type="button"
            onClick={() => discardAndReload()}
            className="rounded border border-amber-500/50 px-1.5 py-0.5 font-medium hover:bg-amber-500/20"
          >
            リロード（外部を採用）
          </button>
          <button
            type="button"
            onClick={() => void keepMine()}
            className="rounded border border-amber-500/50 px-1.5 py-0.5 font-medium hover:bg-amber-500/20"
          >
            自分の変更を保持
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden" onBlur={flush}>
        {/* Read-only ToC (DEC-057): follows the md, jumps the editor. Shown once
            there are a couple of headings, lg+ only (narrow stacks the editor). */}
        {headings.length >= 2 && (
          <SpecToc
            headings={headings}
            activeLine={activeHeadingLine}
            onJump={(line) => mdRef.current?.scrollToLine(line)}
          />
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          {loading && (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          )}
          {error && <p className={cn("p-4 text-sm text-destructive")}>{error}</p>}
          {doc && !loading && (
            <MarkdownEditor
              key={reloadNonce}
              ref={mdRef}
              doc={doc}
              frontmatter={doc.frontmatter}
              frontmatterDirty={false}
              onDirtyChange={setDirty}
              onEdit={handleEdit}
              onScrollLine={setScrollTopLine}
              flashLines={flashLines}
              flushOnUnmount
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SlotEditor;
