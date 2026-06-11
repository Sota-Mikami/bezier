"use client";

// Reusable markdown slot editor — the /workspace `Editor` pattern, factored for
// Issue artifact slots (spec.md / decision.md). Reads a file
// into an OpenDoc, mounts the shared CodeMirror <MarkdownEditor>, and wires a
// Save button to its imperative handle. Frontmatter is preserved verbatim
// (frontmatterDirty is always false here — slot frontmatter is a back-link we
// never edit through this surface), so a clean save is a zero-diff write.

import * as React from "react";
import dynamic from "next/dynamic";
import { FileText, Save, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function SlotEditor({
  path,
  label,
}: {
  path: string;
  label?: string;
}) {
  // Remount on path change / after save so each load re-baselines from disk.
  const [reloadToken, setReloadToken] = React.useState(0);
  return (
    <SlotEditorInner
      key={`${path}#${reloadToken}`}
      path={path}
      label={label}
      onReload={() => setReloadToken((t) => t + 1)}
    />
  );
}

function SlotEditorInner({
  path,
  label,
  onReload,
}: {
  path: string;
  label?: string;
  onReload: () => void;
}) {
  const [doc, setDoc] = React.useState<OpenDoc | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const mdRef = React.useRef<MarkdownEditorHandle>(null);

  React.useEffect(() => {
    let cancelled = false;
    readDoc(path)
      .then((d) => {
        if (!cancelled) setDoc(d);
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

  const handleSave = React.useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      await mdRef.current?.save();
      onReload(); // re-read so on-disk content becomes the new clean baseline
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [doc, onReload]);

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
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-[11px]",
              dirty
                ? "text-amber-600 dark:text-amber-500"
                : "text-muted-foreground",
            )}
          >
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!doc || loading || saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {doc && !loading && (
          <MarkdownEditor
            ref={mdRef}
            doc={doc}
            frontmatter={doc.frontmatter}
            frontmatterDirty={false}
            onDirtyChange={setDirty}
          />
        )}
      </div>
    </div>
  );
}

export default SlotEditor;
