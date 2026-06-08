"use client";

// Plate editor (client-only — touches the DOM). Integration loads this via
// next/dynamic(() => import("..."), { ssr: false }).
//
// Plugin set mirrors makeMdEditor() in src/lib/markdown.ts: the MarkdownPlugin
// (configured with remark-gfm) drives headings / lists / todo-checkbox / table /
// code / blockquote / links / marks via its rule set. The actual body
// round-trip is owned by markdown.ts (mdToPlate / plateToMd) so this editor and
// the headless round-trip test stay byte-for-byte consistent.

import * as React from "react";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import type { Value } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import { stringify as yamlStringify } from "yaml";

import type { OpenDoc } from "@/lib/ipc";
import { writeFile } from "@/lib/ipc";
import type { Frontmatter } from "@/lib/frontmatter";
import { mdToPlate, plateToMd } from "@/lib/markdown";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface PlateEditorHandle {
  /** Persist the document to disk. Zero-diff when nothing was edited. */
  save: () => Promise<void>;
  /** Whether the editor body has unsaved edits. */
  isDirty: () => boolean;
}

export interface PlateEditorProps {
  doc: OpenDoc;
  /** Fired whenever the editor's body dirty state changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Current frontmatter values. When `frontmatterDirty` is true these are
   * re-emitted on save; otherwise the original raw block is preserved verbatim.
   */
  frontmatter?: Frontmatter;
  /** Whether frontmatter fields were edited (controls re-emit vs verbatim). */
  frontmatterDirty?: boolean;
  /** Fired after a successful save. */
  onSaved?: () => void;
  className?: string;
}

/**
 * Re-emit a frontmatter block from structured fields. Only used when the user
 * edited frontmatter; otherwise the original raw block is preserved byte-for-byte.
 */
function emitFrontmatter(fm: Frontmatter | undefined): string {
  const data: Record<string, unknown> = {};
  if (fm) {
    if (fm.title) data.title = fm.title;
    if (fm.type) data.type = fm.type;
    if (fm.status) data.status = fm.status;
    if (fm.created) data.created = fm.created;
    if (fm.links && fm.links.length > 0) data.links = fm.links;
  }
  if (Object.keys(data).length === 0) return "";
  // yamlStringify ends with a trailing newline -> `---\n<yaml>---\n`.
  return `---\n${yamlStringify(data)}---\n`;
}

function PlateEditorInner(
  props: PlateEditorProps,
  ref: React.ForwardedRef<PlateEditorHandle>,
) {
  const { doc, onDirtyChange, frontmatter, frontmatterDirty, onSaved, className } =
    props;

  const isPlate = doc.editable === "plate";

  // Initial Plate value (markdown.ts owns the conversion). For "raw" docs we
  // never mount Plate, so an empty value is fine.
  const initialValue = React.useMemo<Value>(
    () => (isPlate ? (mdToPlate(doc.body) as Value) : ([] as Value)),
    // Re-derive when the open document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.path, doc.body, isPlate],
  );

  const editor = usePlateEditor(
    {
      plugins: [
        MarkdownPlugin.configure({
          options: { remarkPlugins: [remarkGfm] },
        }),
      ],
      value: initialValue,
    },
    // Re-create the editor instance when the open document changes.
    [doc.path],
  );

  // Latest editor value (Plate) / raw text (textarea), kept in refs so save()
  // reads the current content without re-binding.
  const valueRef = React.useRef<Value>(initialValue);
  const rawRef = React.useRef<string>(doc.body);

  const [bodyDirty, setBodyDirty] = React.useState(false);
  const bodyDirtyRef = React.useRef(false);
  // Guard against the initial normalization pass firing onValueChange.
  const mountedRef = React.useRef(false);

  const markDirty = React.useCallback(
    (next: boolean) => {
      if (bodyDirtyRef.current === next) return;
      bodyDirtyRef.current = next;
      setBodyDirty(next);
      onDirtyChange?.(next);
    },
    [onDirtyChange],
  );

  // Reset all per-document state when the open document changes.
  React.useEffect(() => {
    mountedRef.current = false;
    valueRef.current = initialValue;
    rawRef.current = doc.body;
    markDirty(false);
    // Allow change events only after the initial render settles.
    const id = window.setTimeout(() => {
      mountedRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [doc.path, doc.body, initialValue, markDirty]);

  const handleValueChange = React.useCallback(
    (options: { value: Value }) => {
      valueRef.current = options.value;
      if (!mountedRef.current) return;
      markDirty(true);
    },
    [markDirty],
  );

  const handleRawChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      rawRef.current = e.target.value;
      markDirty(e.target.value !== doc.body);
    },
    [doc.body, markDirty],
  );

  const save = React.useCallback(async () => {
    const fmDirty = Boolean(frontmatterDirty);
    const dirty = bodyDirtyRef.current;

    // Zero-diff: nothing edited -> write the ORIGINAL bytes back unchanged.
    // (Never re-serialize a clean file; remark-stringify would normalize it.)
    if (!dirty && !fmDirty) {
      const original = `${doc.rawFrontmatter ?? ""}${doc.body}`;
      await writeFile(doc.path, original);
      return;
    }

    const bodyText = dirty
      ? isPlate
        ? plateToMd(valueRef.current)
        : rawRef.current
      : doc.body;

    const fmBlock = fmDirty
      ? emitFrontmatter(frontmatter)
      : (doc.rawFrontmatter ?? "");

    await writeFile(doc.path, `${fmBlock}${bodyText}`);
    markDirty(false);
    onSaved?.();
  }, [
    doc.path,
    doc.body,
    doc.rawFrontmatter,
    frontmatter,
    frontmatterDirty,
    isPlate,
    markDirty,
    onSaved,
  ]);

  React.useImperativeHandle(
    ref,
    () => ({
      save,
      isDirty: () => bodyDirtyRef.current,
    }),
    [save],
  );

  if (!isPlate) {
    return (
      <Textarea
        value={undefined}
        defaultValue={doc.body}
        onChange={handleRawChange}
        spellCheck={false}
        aria-label="Raw document editor"
        className={cn(
          "h-full min-h-[60vh] w-full resize-none rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0",
          className,
        )}
        data-dirty={bodyDirty || undefined}
      />
    );
  }

  return (
    <Plate editor={editor} onValueChange={handleValueChange}>
      <PlateContent
        spellCheck={false}
        placeholder="Start writing…"
        className={cn(
          "min-h-[60vh] w-full px-4 py-3 text-sm leading-relaxed outline-none [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:my-0.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
          className,
        )}
        data-dirty={bodyDirty || undefined}
      />
    </Plate>
  );
}

const PlateEditor = React.forwardRef<PlateEditorHandle, PlateEditorProps>(
  PlateEditorInner,
);
PlateEditor.displayName = "PlateEditor";

export default PlateEditor;
