"use client";

// The CENTER "Design" area (IA finalize) — the 1st diamond: define & explore.
// ONE flat strip merging the issue's DOCUMENTS (md: Spec / 決定 / QA…) AND its
// DESIGN explorations (html wireframes) as PEER tabs — the format-pluggable
// Document View thesis (a design exploration is just an html document). Selecting
// a doc opens the CodeMirror editor; selecting a design opens the wireframe with
// the annotation overlay + "この案で確定 → Prototype" (the adopt flow, relocated
// from the old Design tab's strip). Reorder by drag; delete with ×.

import * as React from "react";
import { Code2, Plus, X, Loader2, ArrowRightCircle } from "lucide-react";

import { listDocuments, createDocument, type IssueDoc } from "@/lib/issues";
import {
  listVariants,
  readVariant,
  readAdoptedDesign,
  nextVariantIds,
  type Variant,
} from "@/lib/variants";
import { removePath, confirmDialog } from "@/lib/ipc";
import { useOrdered, useDragReorder } from "@/lib/use-ordered";
import { useTabShortcuts } from "@/lib/use-tab-shortcuts";
import { Button } from "@/components/ui/button";
import { UnderlineTab } from "@/components/ui/underline-tab";
import { SlotEditor } from "./slot-editor";
import { AnnotationLayer } from "./design-annotations";
import { designSurface } from "./design-variants";
import { useAnnotationMode } from "./annotation-mode";
import { docAnnotationSurface } from "./annotation-surfaces";
import type { ImplementSession } from "./implement-session-types";

type Item =
  | { kind: "doc"; key: string; label: string; deletable: boolean; doc: IssueDoc }
  | { kind: "variant"; key: string; label: string; deletable: boolean; variant: Variant };

const itemKey = (i: Item) => i.key;

const ADD_DOCS: { type: string; label: string }[] = [
  { type: "decision", label: "決定" },
  { type: "qa", label: "QA" },
  { type: "handoff", label: "共有" },
  { type: "note", label: "空のメモ" },
];

export function IssueDesign({
  session,
  onChange,
}: {
  session: ImplementSession;
  /** Pulse/auto-switch the Design area when the agent rewrites a doc or adds a design. */
  onChange?: () => void;
}) {
  const issue = session.issue;
  const { on: annotating } = useAnnotationMode();
  const [docs, setDocs] = React.useState<IssueDoc[]>([]);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [htmlByPath, setHtmlByPath] = React.useState<{ path: string; html: string } | null>(null);
  const [adopted, setAdopted] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const prevVariantIds = React.useRef<Set<string> | null>(null);

  // Auto-discover docs + design explorations (poll; the agent writes both).
  const refresh = React.useCallback(() => {
    void listDocuments(issue).then(setDocs);
    void listVariants(issue)
      .then((list) => {
        setVariants(list);
        const ids = new Set(list.map((v) => v.id));
        const prev = prevVariantIds.current;
        if (prev) {
          const fresh = list.filter((v) => !prev.has(v.id));
          if (fresh.length) {
            // A new design appeared — open it + pulse the area.
            setSelected(fresh[fresh.length - 1].path);
            onChangeRef.current?.();
          }
        }
        prevVariantIds.current = ids;
      })
      .catch(() => {});
    void readAdoptedDesign(issue).then(setAdopted).catch(() => {});
  }, [issue]);
  React.useEffect(() => {
    refresh();
    const h = window.setInterval(refresh, 2500);
    return () => window.clearInterval(h);
  }, [refresh]);

  const items: Item[] = React.useMemo(
    () => [
      ...docs.map(
        (d): Item => ({ kind: "doc", key: d.path, label: d.label, deletable: d.type !== "spec", doc: d }),
      ),
      ...variants.map(
        (v): Item => ({
          kind: "variant",
          key: v.path,
          label: v.title || v.slug || `案 ${v.id}`,
          deletable: true,
          variant: v,
        }),
      ),
    ],
    [docs, variants],
  );

  const { ordered, setOrder } = useOrdered(`bezier:order:design:${issue.id}`, items, itemKey);
  const dragProps = useDragReorder(ordered.map(itemKey), setOrder);

  const selectedItem = ordered.find((i) => i.key === selected) ?? ordered[0] ?? null;

  // Chrome-style tab nav (⌘1–9 / ⌘⌥←→ / Ctrl+Tab) over the merged strip. Mounted
  // only while the Design area is visible, so it never fights Prototype's row.
  useTabShortcuts({
    active: true,
    ids: ordered.map(itemKey),
    currentId: selectedItem?.key ?? null,
    onSelect: setSelected,
  });

  // Read the selected variant's html (and refresh it on poll while shown). Only
  // setState in the async continuation; the rendered html is derived below.
  React.useEffect(() => {
    if (selectedItem?.kind !== "variant") return;
    const path = selectedItem.key;
    let cancelled = false;
    void readVariant(path).then((h) => {
      if (!cancelled) setHtmlByPath({ path, html: h });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedItem, variants]);
  const html =
    selectedItem?.kind === "variant" && htmlByPath && htmlByPath.path === selectedItem.key
      ? htmlByPath.html
      : "";

  const addDoc = async (type: string) => {
    setAdding(false);
    try {
      const path = await createDocument(issue, type);
      await listDocuments(issue).then(setDocs);
      setSelected(path);
    } catch {
      /* poll reconciles */
    }
  };

  const genDesign = () => {
    setAdding(false);
    if (!session.canGenerateVariant) return;
    void session.handleGenerateVariant(nextVariantIds(variants, 1), "");
  };

  const remove = async (it: Item) => {
    if (!it.deletable) return;
    const ok = await confirmDialog(`「${it.label}」を削除しますか？`, {
      title: "削除の確認",
      okLabel: "削除",
      cancelLabel: "やめる",
    });
    if (!ok) return;
    await removePath(it.key).catch(() => {});
    refresh();
  };

  if (ordered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        準備中…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* One flat strip: documents + design explorations. Drag to reorder. */}
      <div className="flex h-10 shrink-0 items-stretch border-b">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1.5">
          {ordered.map((it) => (
            <UnderlineTab
              key={it.key}
              active={it.key === selectedItem?.key}
              onClick={() => setSelected(it.key)}
              title={it.kind === "variant" ? `${it.label}（デザイン案）` : it.label}
              className="max-w-[170px]"
              dragProps={dragProps(it.key)}
            >
              {it.kind === "variant" && (
                <Code2 className="size-3.5 shrink-0 text-sky-500/80" />
              )}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.deletable && (
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(it);
                  }}
                  aria-label="削除"
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
              title="追加（通常は会話で agent が作成）"
              aria-label="追加"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {session.action === "variant" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </button>
            {adding && (
              <div className="absolute top-8 left-0 z-20 w-40 overflow-hidden rounded-md border bg-background py-1 shadow-lg">
                {ADD_DOCS.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => void addDoc(t.type)}
                    className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted"
                  >
                    {t.label}
                  </button>
                ))}
                <div className="my-1 border-t" />
                <button
                  type="button"
                  onClick={genDesign}
                  disabled={!session.canGenerateVariant}
                  className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                >
                  デザイン案を生成
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body: doc → editor; design → wireframe + annotation + adopt. */}
      <div className="relative min-h-0 flex-1">
        {selectedItem?.kind === "doc" && (
          <div className="relative h-full">
            <SlotEditor
              path={selectedItem.key}
              label={selectedItem.label}
              onExternalChange={onChange}
            />
            {annotating && (
              <AnnotationLayer
                key={`anno-doc-${selectedItem.key}`}
                session={session}
                surface={docAnnotationSurface(
                  session,
                  selectedItem.key,
                  selectedItem.doc.type,
                  selectedItem.label,
                )}
              />
            )}
          </div>
        )}
        {selectedItem?.kind === "variant" && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center justify-end border-b px-3">
              <Button
                size="sm"
                className="h-6 gap-1.5 px-2.5 text-[11px]"
                disabled={!!session.action}
                onClick={() => void session.handlePickVariant(selectedItem.variant.id)}
                title="この案を採用して Prototype（実物の DS で実装）へ"
              >
                {session.action === "variant" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ArrowRightCircle className="size-3" />
                )}
                {adopted === selectedItem.variant.id ? "再 Implement" : "この案で確定"}
              </Button>
            </div>
            <div className="relative min-h-0 flex-1 bg-background">
              <iframe
                key={`frame-${selectedItem.key}`}
                sandbox=""
                srcDoc={html}
                title={selectedItem.label}
                className="size-full bg-white"
              />
              {annotating && (
                <AnnotationLayer
                  key={`anno-${selectedItem.key}`}
                  session={session}
                  surface={designSurface(
                    session,
                    selectedItem.variant,
                    session.canGenerateVariant,
                    session.reviseDesignPattern,
                  )}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IssueDesign;
