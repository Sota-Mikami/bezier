"use client";

// QA — proposal-level. An opinionated, "feels most usable" table, backed by
// STRUCTURED, per-issue data so it's portable to whatever each team actually uses:
//   - mikan: spreadsheet (custom columns) → "TSVコピー" pastes straight into Sheets.
//   - others: P0/P1/P2 priorities (built in here).
// Persisted at <issue.dir>/qa.json (under .bezier → never in the PR); seeded from
// the Spec's acceptance criteria. Bezier proposes a good default; the data stays
// copy/import-friendly so teams adapt the format in their own tool.

import * as React from "react";
import { Copy, Check, Plus, X } from "lucide-react";

import { useT, tt } from "@/lib/i18n";
import {
  readQa,
  writeQa,
  seedQaFromSpec,
  type QaItem,
  type QaStatus,
  type QaPriority,
} from "@/lib/qa";
import { AnnotationLayer } from "./design-annotations";
import { useAnnotationMode } from "./annotation-mode";
import { qaAnnotationSurface } from "./annotation-surfaces";
import type { ImplementSession } from "./implement-session-types";

const STATUS_NEXT: Record<QaStatus, QaStatus> = { todo: "pass", pass: "fail", fail: "todo" };
const STATUS_TSV: Record<QaStatus, string> = { todo: "TODO", pass: "PASS", fail: "FAIL" };
const STATUS_GLYPH: Record<QaStatus, string> = { todo: "○", pass: "✓", fail: "✗" };
const PRIO_NEXT: Record<QaPriority, QaPriority> = { P0: "P1", P1: "P2", P2: "P0" };

const cols = (): string[] => [
  tt("qa.col.status"),
  tt("qa.col.priority"),
  tt("qa.col.area"),
  tt("qa.col.case"),
  tt("qa.col.expected"),
  tt("qa.col.basis"),
];

function toRows(items: QaItem[]): string[][] {
  return items.map((i) => [STATUS_TSV[i.status], i.priority, i.area, i.scenario, i.expected, i.note]);
}
function toTsv(items: QaItem[]): string {
  return [cols(), ...toRows(items)].map((r) => r.join("\t")).join("\n");
}
function toMarkdown(items: QaItem[]): string {
  const head = `| ${cols().join(" | ")} |`;
  const sep = `| ${cols().map(() => "---").join(" | ")} |`;
  const body = toRows(items).map((r) => `| ${r.join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}
function uid(items: QaItem[]): string {
  return String(items.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1);
}

export function QaProposal({ session }: { session: ImplementSession }) {
  const issue = session.issue;
  const t = useT();
  const { on: annotating } = useAnnotationMode();
  const [items, setItems] = React.useState<QaItem[] | null>(null);
  const [copied, setCopied] = React.useState<"tsv" | "md" | null>(null);
  const lastSaved = React.useRef("");

  // Load per-issue QA; seed from the Spec's acceptance criteria when absent.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      let loaded = await readQa(issue);
      if (!loaded) loaded = await seedQaFromSpec(issue);
      if (cancelled) return;
      setItems(loaded);
      lastSaved.current = JSON.stringify(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [issue]);

  // Debounced persist on change (skips the just-loaded value).
  React.useEffect(() => {
    if (items === null) return;
    const json = JSON.stringify(items);
    if (json === lastSaved.current) return;
    const h = window.setTimeout(() => {
      void writeQa(issue, items);
      lastSaved.current = json;
    }, 500);
    return () => window.clearTimeout(h);
  }, [items, issue]);

  if (items === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("qa.loadingQa")}
      </div>
    );
  }

  const patch = (id: string, p: Partial<QaItem>) =>
    setItems((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)));

  const copy = async (which: "tsv" | "md") => {
    const text = which === "tsv" ? toTsv(items) : toMarkdown(items);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const passCount = items.filter((i) => i.status === "pass").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-[11px] text-muted-foreground">
          {t("qa.fromAcceptanceCriteria")}
          <span className="tabular-nums text-foreground">
            {passCount}/{items.length}
          </span>{" "}
          PASS
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <CopyBtn label={t("qa.copyTsv")} hint={t("qa.copyTsvHint")} done={copied === "tsv"} onClick={() => void copy("tsv")} />
          <CopyBtn label={t("qa.copyMd")} hint={t("qa.copyMdHint")} done={copied === "md"} onClick={() => void copy("md")} />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-2 py-2 text-center">{t("qa.col.status")}</th>
              <th className="w-12 px-2 py-2">{t("qa.col.priority")}</th>
              <th className="w-28 px-2 py-2">{t("qa.col.area")}</th>
              <th className="px-2 py-2">{t("qa.col.case")}</th>
              <th className="px-2 py-2">{t("qa.col.expected")}</th>
              <th className="w-40 px-2 py-2">{t("qa.col.basis")}</th>
              <th className="w-7 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="group/row border-b last:border-0 hover:bg-muted/30">
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => patch(it.id, { status: STATUS_NEXT[it.status] })}
                    title={t("qa.toggleStatus")}
                    className={statusCls(it.status)}
                  >
                    {STATUS_GLYPH[it.status]}
                  </button>
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => patch(it.id, { priority: PRIO_NEXT[it.priority] })}
                    title={t("qa.togglePriority")}
                    className={prioCls(it.priority)}
                  >
                    {it.priority}
                  </button>
                </td>
                <Cell value={it.area} mono onChange={(v) => patch(it.id, { area: v })} placeholder="/route" />
                <Cell value={it.scenario} onChange={(v) => patch(it.id, { scenario: v })} placeholder={t("qa.placeholderScenario")} />
                <Cell value={it.expected} onChange={(v) => patch(it.id, { expected: v })} placeholder={t("qa.placeholderExpected")} />
                <Cell value={it.note} muted onChange={(v) => patch(it.id, { note: v })} placeholder={t("qa.placeholderNote")} />
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => setItems((xs) => (xs ?? []).filter((x) => x.id !== it.id))}
                    aria-label={t("common.delete")}
                    className="hidden size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground group-hover/row:flex"
                  >
                    <X className="size-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() =>
            setItems((xs) => [
              ...(xs ?? []),
              { id: uid(xs ?? []), status: "todo", priority: "P1", area: "", scenario: "", expected: "", note: "" },
            ])
          }
          className="m-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" /> {t("qa.addRow")}
        </button>
        </div>
        {annotating && (
          <AnnotationLayer session={session} surface={qaAnnotationSurface(session)} />
        )}
      </div>
    </div>
  );
}

function CopyBtn({ label, hint, done, onClick }: { label: string; hint: string; done: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {done ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {done ? t("qa.copied") : label}
    </button>
  );
}

function Cell({
  value,
  onChange,
  placeholder,
  mono,
  muted,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td className="px-2 py-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/50",
          mono && "font-mono text-[11px]",
          muted ? "text-muted-foreground" : "text-foreground",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </td>
  );
}

function statusCls(s: QaStatus): string {
  const base = "flex size-5 items-center justify-center rounded-full text-[11px] font-bold mx-auto transition-colors";
  if (s === "pass") return `${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
  if (s === "fail") return `${base} bg-red-500/15 text-red-600 dark:text-red-400`;
  return `${base} border text-muted-foreground`;
}

function prioCls(p: QaPriority): string {
  const base = "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors";
  if (p === "P0") return `${base} bg-red-500/15 text-red-600 dark:text-red-400`;
  if (p === "P1") return `${base} bg-amber-500/15 text-amber-600 dark:text-amber-500`;
  return `${base} bg-muted text-muted-foreground`;
}

export default QaProposal;
