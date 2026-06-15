"use client";

// Docs view (Document View, Phase 1). The issue center tab "Docs" — internally
// still the "spec" tab value, so the tab state machine / auto-switch / pulse are
// untouched. LEFT-as-tabs: the issue's documents — the Spec spine plus everything
// the agent dropped under docs/ (auto-discovered, presence-driven). The selected
// document renders below in the shared CodeMirror SlotEditor.
//
// Creation is chat-driven (the agent writes docs, like Design 別案); the "+追加"
// is a secondary quick-start. Documents are referenced by NAME (Spec/QA/決定…),
// not a number — the ⌘1–9 jump is just a keyboard hint (shown in the tooltip),
// not an identity, so it stays consistent with manual reordering (drag a tab).

import * as React from "react";
import { Plus, X } from "lucide-react";

import {
  listDocuments,
  createDocument,
  type Issue,
  type IssueDoc,
} from "@/lib/issues";
import { removePath, confirmDialog } from "@/lib/ipc";
import { useOrdered, useDragReorder } from "@/lib/use-ordered";
import { SlotEditor } from "./slot-editor";
import { UnderlineTab } from "@/components/ui/underline-tab";
import { useT } from "@/lib/i18n";

const docFile = (d: IssueDoc) => d.file;

export function IssueDocs({
  issue,
  onExternalChange,
}: {
  issue: Issue;
  /** Forwarded to the SlotEditor: pulse/auto-switch the tab on agent rewrites. */
  onExternalChange?: () => void;
}) {
  const t = useT();
  const addTemplates: { type: string; label: string }[] = [
    { type: "decision", label: t("docs.tplDecision") },
    { type: "qa", label: t("docs.tplQa") },
    { type: "handoff", label: t("docs.tplHandoff") },
    { type: "note", label: t("docs.tplNote") },
  ];
  const [docs, setDocs] = React.useState<IssueDoc[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  // Auto-discover: re-list on mount + poll, so agent/convention-created files
  // under docs/ appear without any user action (mirrors DesignVariants).
  const refresh = React.useCallback(() => {
    void listDocuments(issue).then(setDocs);
  }, [issue]);
  React.useEffect(() => {
    refresh();
    const h = window.setInterval(refresh, 2500);
    return () => window.clearInterval(h);
  }, [refresh]);

  // User-curated order (persisted), layered on the discovered list.
  const { ordered, setOrder } = useOrdered(
    `bezier:order:docs:${issue.id}`,
    docs,
    docFile,
  );
  const dragProps = useDragReorder(ordered.map(docFile), setOrder);

  // Valid selection (default = first doc). Derived, never stored-via-effect.
  const selectedPath =
    ordered.find((d) => d.path === selected)?.path ?? ordered[0]?.path ?? null;
  const selectedDoc = ordered.find((d) => d.path === selectedPath) ?? null;

  // ⌘1–9 selects the Nth document in the CURRENT order; ⌘⌥←/→ cycles.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (!e.altKey && e.key >= "1" && e.key <= "9") {
        const i = Number(e.key) - 1;
        if (i < ordered.length) {
          e.preventDefault();
          setSelected(ordered[i].path);
        }
      } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const cur = ordered.findIndex((d) => d.path === selectedPath);
        if (cur < 0) return;
        e.preventDefault();
        const next = e.key === "ArrowLeft" ? cur - 1 : cur + 1;
        const clamped = Math.max(0, Math.min(ordered.length - 1, next));
        setSelected(ordered[clamped].path);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ordered, selectedPath]);

  const add = async (type: string) => {
    setAdding(false);
    try {
      const path = await createDocument(issue, type);
      await listDocuments(issue).then(setDocs);
      setSelected(path);
    } catch {
      // best-effort; the poll reconciles.
    }
  };

  const remove = async (d: IssueDoc) => {
    if (d.type === "spec") return; // the Spec spine is not deletable here.
    const ok = await confirmDialog(t("docs.deleteDocConfirm", { label: d.label }), {
      title: t("docs.deleteDocTitle"),
      okLabel: t("common.delete"),
      cancelLabel: t("docs.deleteCancel"),
    });
    if (!ok) return;
    try {
      await removePath(d.path);
    } catch {
      // ignore; the poll reconciles.
    }
    refresh();
  };

  if (ordered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        {t("docs.preparing")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Horizontal document tabs — same strip as Design / Implement. Drag to
          reorder; reference by name (not number). */}
      <div className="flex h-10 shrink-0 items-stretch border-b">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1.5">
          {ordered.map((d, i) => (
            <UnderlineTab
              key={d.path}
              active={d.path === selectedPath}
              onClick={() => setSelected(d.path)}
              title={i < 9 ? `${d.file} ・ ⌘${i + 1}` : d.file}
              className="max-w-[180px]"
              dragProps={dragProps(d.file)}
            >
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              {d.type !== "spec" && (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(d);
                  }}
                  title={t("common.delete")}
                  aria-label={t("docs.removeDocAria", { label: d.label })}
                  className="-mr-1 hidden size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground group-hover/tab:flex"
                >
                  <X className="size-3" />
                </button>
              )}
            </UnderlineTab>
          ))}
          <div className="relative my-auto ml-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              title={t("docs.addDocTooltip")}
              aria-label={t("docs.addDocAria")}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
            {adding && (
              <div className="absolute top-8 left-0 z-20 w-32 overflow-hidden rounded-md border bg-background py-1 shadow-lg">
                {addTemplates.map((tpl) => (
                  <button
                    key={tpl.type}
                    type="button"
                    onClick={() => void add(tpl.type)}
                    className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {selectedDoc && selectedPath && (
          <SlotEditor
            path={selectedPath}
            label={selectedDoc.label}
            onExternalChange={onExternalChange}
          />
        )}
      </div>
    </div>
  );
}
