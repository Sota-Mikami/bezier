"use client";

// Structured editor for a document's frontmatter (title / type / status /
// created / links). Reports both the next Frontmatter value and a dirty flag so
// the integration layer can decide whether to re-emit the YAML block on save
// (PlateEditor preserves the raw block verbatim while frontmatterDirty is false).

import * as React from "react";

import type { Frontmatter } from "@/lib/frontmatter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["draft", "active", "review", "done", "archived"] as const;

export interface FrontmatterPanelProps {
  frontmatter: Frontmatter;
  /** Fired on every edit with the next value and whether it differs from the initial. */
  onChange: (next: Frontmatter, dirty: boolean) => void;
  /** Fired when the dirty state flips. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}

/** Stable serialization for dirty comparison (key order normalized). */
function fingerprint(fm: Frontmatter): string {
  return JSON.stringify({
    title: fm.title ?? "",
    type: fm.type ?? "",
    status: fm.status ?? "",
    created: fm.created ?? "",
    links: fm.links ?? [],
  });
}

function linksToText(links: string[] | undefined): string {
  return (links ?? []).join("\n");
}

function textToLinks(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function Field(props: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={props.htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

export default function FrontmatterPanel({
  frontmatter,
  onChange,
  onDirtyChange,
  className,
}: FrontmatterPanelProps) {
  const [draft, setDraft] = React.useState<Frontmatter>(frontmatter);

  // The "clean" baseline, captured once per mount. The integration layer
  // remounts this panel (key = `${doc.path}#${reloadToken}`) whenever a
  // different document loads or the file is re-read after save, so re-baselining
  // happens via fresh mount state rather than a setState-in-effect.
  const initialRef = React.useRef<string>(fingerprint(frontmatter));
  const dirtyRef = React.useRef(false);

  const commit = React.useCallback(
    (next: Frontmatter) => {
      setDraft(next);
      const dirty = fingerprint(next) !== initialRef.current;
      if (dirty !== dirtyRef.current) {
        dirtyRef.current = dirty;
        onDirtyChange?.(dirty);
      }
      onChange(next, dirty);
    },
    [onChange, onDirtyChange],
  );

  const setField = React.useCallback(
    <K extends keyof Frontmatter>(key: K, value: Frontmatter[K]) => {
      commit({ ...draft, [key]: value });
    },
    [commit, draft],
  );

  const statusOptions = React.useMemo(() => {
    const current = draft.status;
    if (current && !STATUS_OPTIONS.includes(current as (typeof STATUS_OPTIONS)[number])) {
      return [current, ...STATUS_OPTIONS];
    }
    return [...STATUS_OPTIONS];
  }, [draft.status]);

  return (
    <div className={cn("flex flex-col gap-3 p-3", className)}>
      <Field label="Title" htmlFor="fm-title">
        <Input
          id="fm-title"
          value={draft.title ?? ""}
          placeholder="Untitled"
          onChange={(e) =>
            setField("title", e.target.value === "" ? undefined : e.target.value)
          }
        />
      </Field>

      <Field label="Type" htmlFor="fm-type">
        <Input
          id="fm-type"
          value={draft.type ?? ""}
          placeholder="note"
          onChange={(e) =>
            setField("type", e.target.value === "" ? undefined : e.target.value)
          }
        />
      </Field>

      <Field label="Status" htmlFor="fm-status">
        <select
          id="fm-status"
          value={draft.status ?? ""}
          onChange={(e) =>
            setField("status", e.target.value === "" ? undefined : e.target.value)
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Created" htmlFor="fm-created">
        <Input
          id="fm-created"
          value={draft.created ?? ""}
          placeholder="YYYY-MM-DD"
          onChange={(e) =>
            setField("created", e.target.value === "" ? undefined : e.target.value)
          }
        />
      </Field>

      <Field label="Links (one per line)" htmlFor="fm-links">
        <Textarea
          id="fm-links"
          value={linksToText(draft.links)}
          placeholder={"path/to/doc.md\nrelated-note.md"}
          rows={3}
          className="resize-y font-mono text-xs"
          onChange={(e) => {
            const links = textToLinks(e.target.value);
            setField("links", links.length > 0 ? links : undefined);
          }}
        />
      </Field>
    </div>
  );
}
