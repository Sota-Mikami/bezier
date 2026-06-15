"use client";

// Docs view (Document View, Phase 1). The issue center tab "Docs" — internally
// still the "spec" tab value, so the tab state machine / auto-switch / pulse are
// untouched. LEFT: the issue's documents — the Spec spine plus everything the
// agent dropped under docs/ (auto-discovered, presence-driven). RIGHT: the
// selected document in the shared CodeMirror SlotEditor.
//
// Creation is chat-driven (the agent writes docs, like Design 別案); the "+追加"
// is a secondary quick-start. Navigation mirrors the Design tab: ⌘1–9 selects a
// document, ⌘⌥←/→ cycles. This component is only mounted while the Docs tab is
// active, so those bindings never collide with the Design tab's identical ones.

import * as React from "react";
import { Plus } from "lucide-react";

import {
  listDocuments,
  createDocument,
  type Issue,
  type IssueDoc,
} from "@/lib/issues";
import { SlotEditor } from "./slot-editor";
import { UnderlineTab } from "@/components/ui/underline-tab";

const ADD_TEMPLATES: { type: string; label: string }[] = [
  { type: "decision", label: "決定" },
  { type: "qa", label: "QA" },
  { type: "handoff", label: "共有" },
  { type: "note", label: "空のメモ" },
];

export function IssueDocs({
  issue,
  onExternalChange,
}: {
  issue: Issue;
  /** Forwarded to the SlotEditor: pulse/auto-switch the tab on agent rewrites. */
  onExternalChange?: () => void;
}) {
  const [docs, setDocs] = React.useState<IssueDoc[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  // Auto-discover: re-list on mount + poll, so agent/convention-created files
  // under docs/ appear without any user action (mirrors DesignVariants).
  React.useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void listDocuments(issue).then((list) => {
        if (!cancelled) setDocs(list);
      });
    };
    tick();
    const h = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [issue]);

  // Valid selection (default = first doc = Spec). Derived, never stored-via-effect.
  const selectedPath =
    docs.find((d) => d.path === selected)?.path ?? docs[0]?.path ?? null;
  const selectedDoc = docs.find((d) => d.path === selectedPath) ?? null;

  // Design-style shortcuts: ⌘1–9 selects, ⌘⌥←/→ cycles.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (!e.altKey && e.key >= "1" && e.key <= "9") {
        const i = Number(e.key) - 1;
        if (i < docs.length) {
          e.preventDefault();
          setSelected(docs[i].path);
        }
      } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const cur = docs.findIndex((d) => d.path === selectedPath);
        if (cur < 0) return;
        e.preventDefault();
        const next = e.key === "ArrowLeft" ? cur - 1 : cur + 1;
        const clamped = Math.max(0, Math.min(docs.length - 1, next));
        setSelected(docs[clamped].path);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [docs, selectedPath]);

  const add = async (type: string) => {
    setAdding(false);
    try {
      const path = await createDocument(issue, type);
      const list = await listDocuments(issue);
      setDocs(list);
      setSelected(path);
    } catch {
      // best-effort; the poll reconciles.
    }
  };

  if (docs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        ドキュメントを準備中…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Horizontal document tabs — same strip as the Design / Implement tabs.
          Move with the same shortcuts (⌘1–9 / ⌘⌥←→). */}
      <div className="flex shrink-0 items-stretch border-b">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1.5">
          {docs.map((d, i) => (
            <UnderlineTab
              key={d.path}
              active={d.path === selectedPath}
              onClick={() => setSelected(d.path)}
              title={d.file}
              className="max-w-[180px]"
            >
              {i < 9 && (
                <span className="font-mono text-xs text-muted-foreground/80">
                  {i + 1}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
            </UnderlineTab>
          ))}
          <div className="relative my-auto ml-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              title="ドキュメントを追加（通常は会話で agent が作成）"
              aria-label="ドキュメントを追加"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
            {adding && (
              <div className="absolute top-8 left-0 z-20 w-32 overflow-hidden rounded-md border bg-background py-1 shadow-lg">
                {ADD_TEMPLATES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => void add(t.type)}
                    className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted"
                  >
                    {t.label}
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
