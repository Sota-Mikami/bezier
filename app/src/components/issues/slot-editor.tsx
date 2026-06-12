"use client";

// Reusable markdown slot editor — the /workspace `Editor` pattern, factored for
// Issue artifact slots (spec.md / decision.md). Reads a file into an OpenDoc and
// mounts the shared CodeMirror <MarkdownEditor>.
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

export function SlotEditor({ path, label }: { path: string; label?: string }) {
  // Remount only on path change so each load re-baselines from disk. Saves do
  // NOT remount (that would jump the caret) — autosave just writes in place.
  return <SlotEditorInner key={path} path={path} label={label} />;
}

function SlotEditorInner({ path, label }: { path: string; label?: string }) {
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

  const mdRef = React.useRef<MarkdownEditorHandle>(null);
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

  // Reset the debounce on every edit (onEdit fires per keystroke).
  const handleEdit = React.useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void doSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
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
  const applyExternal = React.useCallback(async () => {
    clearTimer();
    try {
      const fresh = await readDoc(path);
      baselineRef.current = fullText(fresh);
      frontmatterRef.current = fresh.rawFrontmatter ?? "";
      setDoc(fresh);
      setConflict(false);
      setReloadNonce((n) => n + 1); // remount -> re-baseline from fresh.body
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [path, clearTimer]);

  // Auto-adopt (editor CLEAN): the unmount-flush is a no-op when not dirty, so a
  // direct remount is safe and immediate.
  const adoptExternal = applyExternal;

  // Explicit「リロード（外部を採用）」from the conflict banner (editor DIRTY):
  // drop the dirty flag first so the remount's flushOnUnmount won't write the
  // about-to-be-discarded local edits back, THEN adopt the external content.
  const discardAndReload = React.useCallback(() => {
    clearTimer();
    mdRef.current?.clearDirty();
    void applyExternal();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{label ?? "Artifact"}</span>
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={path}
        >
          {path.slice(path.lastIndexOf("/.continuum/") + 1) || path}
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

      <div
        className="min-h-0 flex-1 overflow-hidden"
        onBlur={flush}
      >
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className={cn("p-4 text-sm text-destructive")}>{error}</p>
        )}
        {doc && !loading && (
          <MarkdownEditor
            key={reloadNonce}
            ref={mdRef}
            doc={doc}
            frontmatter={doc.frontmatter}
            frontmatterDirty={false}
            onDirtyChange={setDirty}
            onEdit={handleEdit}
            flushOnUnmount
          />
        )}
      </div>
    </div>
  );
}

export default SlotEditor;
