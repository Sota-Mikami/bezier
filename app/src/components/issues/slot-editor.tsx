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
import { FileText, Loader2, Check } from "lucide-react";

import { cn } from "@/lib/utils";
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

  const mdRef = React.useRef<MarkdownEditorHandle>(null);
  const timerRef = React.useRef<number | null>(null);
  const savingRef = React.useRef(false);
  const doSaveRef = React.useRef<() => Promise<void>>(async () => {});

  React.useEffect(() => {
    let cancelled = false;
    readDoc(path)
      .then((d) => {
        if (!cancelled) setDoc(d);
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
    try {
      await md.save(); // writes bytes + clears dirty (no remount)
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
