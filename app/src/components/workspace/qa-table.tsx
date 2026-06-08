"use client";

// Editable table editor for .yaml QA documents:
//   { title, type, cases: [{ id, given, when, then, status }] }
// Parse with the "yaml" pkg, edit rows inline, save by yaml.stringify back via
// writeFile. Dirty-tracked; a clean save writes the original bytes unchanged.

import * as React from "react";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

import type { OpenDoc } from "@/lib/ipc";
import { writeFile } from "@/lib/ipc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CASE_STATUSES = ["todo", "pass", "fail"] as const;
type CaseStatus = (typeof CASE_STATUSES)[number];

interface QACase {
  id: string;
  given: string;
  when: string;
  then: string;
  status: CaseStatus;
}

interface QADoc {
  title: string;
  type: string;
  cases: QACase[];
}

export interface QATableHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

export interface QATableProps {
  doc: OpenDoc;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  className?: string;
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function asStatus(v: unknown): CaseStatus {
  return CASE_STATUSES.includes(v as CaseStatus) ? (v as CaseStatus) : "todo";
}

function newId(seed: number): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `case-${Date.now()}-${seed}`;
}

/** Parse raw YAML into a normalized QADoc, tolerating partial/empty docs. */
function parseQa(raw: string): QADoc {
  let data: unknown;
  try {
    data = yamlParse(raw);
  } catch {
    data = null;
  }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rawCases = Array.isArray(obj.cases) ? obj.cases : [];
  const cases: QACase[] = rawCases.map((c, i) => {
    const co = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    return {
      id: asString(co.id) || newId(i),
      given: asString(co.given),
      when: asString(co.when),
      then: asString(co.then),
      status: asStatus(co.status),
    };
  });
  return {
    title: asString(obj.title),
    type: asString(obj.type),
    cases,
  };
}

function QATableInner(
  props: QATableProps,
  ref: React.ForwardedRef<QATableHandle>,
) {
  const { doc, onDirtyChange, onSaved, className } = props;

  // Parsed once per mount. The integration layer remounts QaTable
  // (key = `${doc.path}#${reloadToken}`) when a different document loads or the
  // file is re-read after save, so re-parsing happens via fresh mount state
  // rather than a setState-in-effect.
  const [qa, setQa] = React.useState<QADoc>(() => parseQa(doc.body));

  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const seedRef = React.useRef(0);

  const markDirty = React.useCallback(
    (next: boolean) => {
      if (dirtyRef.current === next) return;
      dirtyRef.current = next;
      setDirty(next);
      onDirtyChange?.(next);
    },
    [onDirtyChange],
  );

  // Functional updater — reads the latest state inside setQa so we never need a
  // render-time ref mirror to grab "current" values from event handlers.
  const update = React.useCallback(
    (updater: (prev: QADoc) => QADoc) => {
      setQa((prev) => updater(prev));
      markDirty(true);
    },
    [markDirty],
  );

  const setMeta = React.useCallback(
    (key: "title" | "type", value: string) => {
      update((prev) => ({ ...prev, [key]: value }));
    },
    [update],
  );

  const setCase = React.useCallback(
    (index: number, patch: Partial<QACase>) => {
      update((prev) => ({
        ...prev,
        cases: prev.cases.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      }));
    },
    [update],
  );

  const addRow = React.useCallback(() => {
    seedRef.current += 1;
    const next: QACase = {
      id: newId(seedRef.current),
      given: "",
      when: "",
      then: "",
      status: "todo",
    };
    update((prev) => ({ ...prev, cases: [...prev.cases, next] }));
  }, [update]);

  const removeRow = React.useCallback(
    (index: number) => {
      update((prev) => ({
        ...prev,
        cases: prev.cases.filter((_, i) => i !== index),
      }));
    },
    [update],
  );

  const save = React.useCallback(async () => {
    if (!dirtyRef.current) {
      // Zero-diff: write the original bytes back unchanged.
      const original = `${doc.rawFrontmatter ?? ""}${doc.body}`;
      await writeFile(doc.path, original);
      return;
    }
    const out: QADoc = {
      title: qa.title,
      type: qa.type,
      cases: qa.cases,
    };
    await writeFile(doc.path, yamlStringify(out));
    markDirty(false);
    onSaved?.();
  }, [qa, doc.path, doc.rawFrontmatter, doc.body, markDirty, onSaved]);

  React.useImperativeHandle(
    ref,
    () => ({
      save,
      isDirty: () => dirtyRef.current,
    }),
    [save],
  );

  return (
    <div className={cn("flex flex-col gap-4 p-3", className)} data-dirty={dirty || undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="qa-title" className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <Input
            id="qa-title"
            value={qa.title}
            placeholder="QA suite title"
            onChange={(e) => setMeta("title", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="qa-type" className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <Input
            id="qa-type"
            value={qa.type}
            placeholder="qa"
            onChange={(e) => setMeta("type", e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[14%]">ID</TableHead>
              <TableHead className="w-[24%]">Given</TableHead>
              <TableHead className="w-[24%]">When</TableHead>
              <TableHead className="w-[24%]">Then</TableHead>
              <TableHead className="w-[10%]">Status</TableHead>
              <TableHead className="w-[4%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {qa.cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No cases yet.
                </TableCell>
              </TableRow>
            ) : (
              qa.cases.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="align-top">
                    <Input
                      value={c.id}
                      aria-label={`Case ${i + 1} id`}
                      className="font-mono text-xs"
                      onChange={(e) => setCase(i, { id: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={c.given}
                      aria-label={`Case ${i + 1} given`}
                      rows={2}
                      className="resize-y text-xs"
                      onChange={(e) => setCase(i, { given: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={c.when}
                      aria-label={`Case ${i + 1} when`}
                      rows={2}
                      className="resize-y text-xs"
                      onChange={(e) => setCase(i, { when: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={c.then}
                      aria-label={`Case ${i + 1} then`}
                      rows={2}
                      className="resize-y text-xs"
                      onChange={(e) => setCase(i, { then: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <select
                      value={c.status}
                      aria-label={`Case ${i + 1} status`}
                      onChange={(e) => setCase(i, { status: asStatus(e.target.value) })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {CASE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove case ${i + 1}`}
                      onClick={() => removeRow(i)}
                    >
                      ✕
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Add case
        </Button>
      </div>
    </div>
  );
}

const QATable = React.forwardRef<QATableHandle, QATableProps>(QATableInner);
QATable.displayName = "QATable";

export default QATable;
