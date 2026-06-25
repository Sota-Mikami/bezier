"use client";

// The CENTER "Design" area (IA finalize) — the 1st diamond: define & explore.
// ONE flat strip merging the issue's DOCUMENTS (md: Spec / 決定 / QA…) AND its
// DESIGN explorations (html wireframes) as PEER tabs — the format-pluggable
// Document View thesis (a design exploration is just an html document). Selecting
// a doc opens the CodeMirror editor; selecting a design opens the wireframe with
// the annotation overlay + "この案で確定 → Prototype" (the adopt flow, relocated
// from the old Design tab's strip). Reorder by drag; delete with ×.

import * as React from "react";
import { Code2, Plus, X, Loader2, Pencil, MousePointer2, Sparkles } from "lucide-react";

import { listDocuments, createDocument, type IssueDoc } from "@/lib/issues";
import {
  listVariants,
  readVariant,
  nextVariantIds,
  type Variant,
} from "@/lib/variants";
import { removePath, confirmDialog, writeFile } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import {
  docCommentsPrompt,
  mockCommentsPrompt,
  elementVariantsPrompt,
  visualEditPrompt,
} from "@/lib/prompts";
import { useT, tt } from "@/lib/i18n";
import { useOrdered, useDragReorder } from "@/lib/use-ordered";
import { useTabShortcuts } from "@/lib/use-tab-shortcuts";
import { getViewState, setViewState } from "@/lib/view-state";
import { iframeTransport, type VisualEditTransport } from "@/lib/visual-edit-transport";
import { buildEditableSrcdoc, cleanSerializedMock } from "@/lib/mock-edit";
import { withDesignFind } from "@/lib/design-find";
import { UnderlineTab } from "@/components/ui/underline-tab";
import { SlotEditor } from "./slot-editor";
import { AnnotationLayer } from "./design-annotations";
import { designSurface } from "./design-variants";
import { useAnnotationMode, AnnotationToggle } from "./annotation-mode";
import { useVisualEdit } from "./use-visual-edit";
import { EditLayerPanel, EditStylePanel, PendingEditsBar } from "./visual-edit-panels";
import type { ImplementSession } from "./implement-session-types";

type Item =
  | { kind: "doc"; key: string; label: string; deletable: boolean; doc: IssueDoc }
  | { kind: "variant"; key: string; label: string; deletable: boolean; variant: Variant };

const itemKey = (i: Item) => i.key;

const ADD_DOCS = [
  { type: "decision", labelKey: "design.addDecision" },
  { type: "qa", labelKey: "design.addQa" },
  { type: "handoff", labelKey: "design.addHandoff" },
  { type: "note", labelKey: "design.addNote" },
] as const;

export function IssueDesign({
  session,
  onChange,
}: {
  session: ImplementSession;
  /** Pulse/auto-switch the Design area when the agent rewrites a doc or adds a design. */
  onChange?: () => void;
}) {
  const t = useT();
  const issue = session.issue;
  const { on: annotating, setLocked } = useAnnotationMode();
  const [docs, setDocs] = React.useState<IssueDoc[]>([]);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  // Restore the last-viewed Design tab across area switches (DEC-141).
  const [selected, setSelected] = React.useState<string | null>(
    () => getViewState(issue.id).designTab ?? null,
  );
  const [htmlByPath, setHtmlByPath] = React.useState<{ path: string; html: string } | null>(null);
  const [adding, setAdding] = React.useState(false);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const prevVariantIds = React.useRef<Set<string> | null>(null);
  const prevDocKeys = React.useRef<Set<string> | null>(null);

  // Auto-discover docs + design explorations (poll; the agent writes both). A
  // freshly-WRITTEN doc or design auto-opens + pulses the area, so when the agent
  // generates one (e.g. a research report), you land on it (mirrors variants).
  const refresh = React.useCallback(() => {
    void listDocuments(issue).then((list) => {
      setDocs(list);
      const keys = new Set(list.map((d) => d.path));
      const prev = prevDocKeys.current;
      if (prev) {
        // Spec is created automatically on open — never steal focus for it.
        const fresh = list.filter((d) => !prev.has(d.path) && d.type !== "spec");
        if (fresh.length) {
          setSelected(fresh[fresh.length - 1].path);
          onChangeRef.current?.();
        }
      }
      prevDocKeys.current = keys;
    });
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
          label: v.title || v.slug || tt("design.variantFallback", { id: v.id }),
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
  // Remember it so switching to Prototype and back returns to this tab (DEC-141).
  React.useEffect(() => {
    setViewState(issue.id, { designTab: selectedItem?.key ?? null });
  }, [selectedItem?.key, issue.id]);

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

  // Mock Edit Mode (E-1b): Figma-style Layer/Style/Text editing ON the html mock, with
  // a DETERMINISTIC write-back to the mock file (no agent). The mock is a self-contained
  // html we own, so we inject the overlay into its iframe (via mock-edit) and serialize
  // the edited DOM back. `editHtml` is captured ONCE on enter so the 2.5s variant poll
  // can't clobber the iframe mid-edit; Edit ⊻ Annotate (annotation is suppressed here).
  const [editing, setEditing] = React.useState(false);
  const [editHtml, setEditHtml] = React.useState<string | null>(null);
  const [savingMock, setSavingMock] = React.useState(false);
  // Within Edit, switch between picking elements (style/text/comment) and annotating
  // (Pin/Pen) — both overlay the SAME live mock iframe (no mode-exit, no freeze).
  const [mockTool, setMockTool] = React.useState<"select" | "annotate">("select");
  // md text-selection comments accumulate (Notion-style) and send in one batch.
  const [docComments, setDocComments] = React.useState<{ text: string; comment: string }[]>([]);
  const [sendingComments, setSendingComments] = React.useState(false);
  // Mock element comments (unified edit: pick element → comment, alongside text/style).
  const [mockComments, setMockComments] = React.useState<
    { selector: string; text: string; comment: string }[]
  >([]);
  const [mockCommentDraft, setMockCommentDraft] = React.useState("");
  const mockFrameRef = React.useRef<HTMLIFrameElement>(null);
  // View-mode design iframe (the read-only html tab). Held so ⌘F can be forwarded
  // into it (its content runs an injected find overlay — see withDesignFind).
  const viewFrameRef = React.useRef<HTMLIFrameElement>(null);
  // Stable transport (created once via useState lazy-init). Its getWin reads the
  // iframe's contentWindow LAZILY — only when the transport issues a command/poll,
  // never during render — so it always sees the live window after (re)load.
  // eslint-disable-next-line react-hooks/refs -- getWin is stored + invoked lazily by the transport (command/poll), never during render
  const [veTransport] = React.useState<VisualEditTransport>(() =>
    iframeTransport(() => mockFrameRef.current?.contentWindow ?? null),
  );

  // ⌘F in a design html tab → forward to the iframe's injected find overlay. The
  // iframe is sandboxed (no same-origin), so the parent can't search it directly;
  // when focus is INSIDE the iframe its own keydown opens find — this covers the
  // case where focus is on the app chrome. md (doc) tabs use CodeMirror's own ⌘F,
  // and edit mode is a different surface, so only forward for the read-only view.
  React.useEffect(() => {
    if (selectedItem?.kind !== "variant" || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        const win = viewFrameRef.current?.contentWindow;
        if (!win) return;
        e.preventDefault();
        win.postMessage({ __bzfind: "open" }, "*");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selectedItem?.kind, editing]);
  const vedit = useVisualEdit({
    active: editing && mockTool === "select",
    navKey: selected ?? "",
    transport: veTransport,
  });
  const clearVedit = vedit.clearEdits;

  // Switching tabs exits Edit Mode cleanly (done in cleanup — fires on tab change /
  // unmount — to avoid cascading-render setState in the effect body). Entering edit
  // doesn't change `selected`, so it never resets mid-edit.
  React.useEffect(() => {
    return () => {
      setEditing(false);
      setEditHtml(null);
      clearVedit();
      setDocComments([]);
      setMockComments([]);
      setMockCommentDraft("");
      setMockTool("select");
    };
  }, [selected, clearVedit]);

  // Send all accumulated md comments in ONE batch — pasted into the RUNNING agent's
  // chat (no restart); falls back to a fresh feedback turn if no agent is live.
  const sendDocComments = async () => {
    const item = selectedItem;
    if (item?.kind !== "doc" || docComments.length === 0 || sendingComments) return;
    setSendingComments(true);
    try {
      await session.injectOrFeedback(
        docCommentsPrompt(item.key, docComments),
        tt("editorComment.note", { label: item.label }),
      );
      setDocComments([]);
    } catch {
      /* surfaced via session.error */
    } finally {
      setSendingComments(false);
    }
  };

  // Edit ⊻ Comment: while editing a mock, lock annotation off (and release the lock on
  // exit / unmount so switching to another area doesn't leave Comment stuck disabled).
  React.useEffect(() => {
    setLocked(editing);
    return () => setLocked(false);
  }, [editing, setLocked]);

  const enterEdit = () => {
    if (selectedItem?.kind !== "variant" || !html) return;
    setEditHtml(buildEditableSrcdoc(html));
    setMockTool("select");
    setEditing(true);
  };
  const exitEdit = () => {
    setEditing(false);
    setEditHtml(null);
    vedit.clearEdits();
    setMockComments([]);
    setMockCommentDraft("");
  };

  const addMockComment = () => {
    const sel = vedit.selected;
    const c = mockCommentDraft.trim();
    if (!sel || !c) return;
    setMockComments((arr) => [...arr, { selector: sel.selector, text: sel.text, comment: c }]);
    setMockCommentDraft("");
  };

  // Foundation for per-element 3-variants (Impeccable-style): ask the agent for 3
  // alternatives of the picked element (the comment draft, if any, is the direction).
  const requestElementVariants = async () => {
    const item = selectedItem;
    const sel = vedit.selected;
    if (item?.kind !== "variant" || !sel || sendingComments) return;
    setSendingComments(true);
    try {
      await session.injectOrFeedback(
        elementVariantsPrompt(item.variant.path, sel.selector, sel.text, mockCommentDraft),
        tt("design.applyMockNote", { label: item.label }),
      );
      setMockCommentDraft("");
    } catch {
      /* surfaced via session.error */
    } finally {
      setSendingComments(false);
    }
  };

  // Send the accumulated element comments in ONE batch — injected into the running
  // agent's chat (no restart), falling back to a fresh turn if none is live.
  const sendMockComments = async () => {
    const item = selectedItem;
    if (item?.kind !== "variant" || mockComments.length === 0 || sendingComments) return;
    setSendingComments(true);
    try {
      await session.injectOrFeedback(
        mockCommentsPrompt(item.variant.path, mockComments),
        tt("design.applyMockNote", { label: item.label }),
      );
      setMockComments([]);
    } catch {
      /* surfaced via session.error */
    } finally {
      setSendingComments(false);
    }
  };
  const saveMock = async () => {
    const item = selectedItem;
    const doc = mockFrameRef.current?.contentDocument;
    if (item?.kind !== "variant" || !doc) {
      exitEdit();
      return;
    }
    setSavingMock(true);
    try {
      veTransport.deactivate(); // drop the overlay's selection-box host before serializing
      const raw = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
      const clean = cleanSerializedMock(raw);
      await writeFile(item.variant.path, clean);
      setHtmlByPath({ path: item.key, html: clean });
    } catch {
      /* write failed — keep the edits in the live DOM so nothing is lost */
    } finally {
      setSavingMock(false);
      exitEdit();
    }
  };

  // Apply the mock's visual edits to the REAL repo code via the agent (the seam:
  // skip re-describing the changes in chat — hand the structured diffs over directly).
  const applyMockToCode = async () => {
    const item = selectedItem;
    if (item?.kind !== "variant" || vedit.editCount === 0) return;
    setSavingMock(true);
    try {
      const prompt = visualEditPrompt(item.label, vedit.diffs, vedit.reorders, vedit.textEdits);
      await session.sendDesignFeedback(prompt, tt("design.applyMockNote", { label: item.label }));
    } catch {
      /* surfaced via session.error */
    } finally {
      setSavingMock(false);
      exitEdit();
    }
  };

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
    const ok = await confirmDialog(t("design.deleteConfirm", { label: it.label }), {
      title: t("design.deleteConfirmTitle"),
      okLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await removePath(it.key).catch(() => {});
    refresh();
  };

  if (ordered.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        {t("design.preparing")}
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
              title={it.kind === "variant" ? t("design.variantTabTitle", { label: it.label }) : it.label}
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
                  aria-label={t("common.delete")}
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
              title={t("design.addTooltip")}
              aria-label={t("common.add")}
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
                {ADD_DOCS.map((d) => (
                  <button
                    key={d.type}
                    type="button"
                    onClick={() => void addDoc(d.type)}
                    className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted"
                  >
                    {t(d.labelKey)}
                  </button>
                ))}
                <div className="my-1 border-t" />
                <button
                  type="button"
                  onClick={genDesign}
                  disabled={!session.canGenerateVariant}
                  className="block w-full px-2.5 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                >
                  {t("design.generateDesign")}
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Surface-aware mode bar (IA): only the MOCK has modes (Edit + Comment/Pin/Pen).
            On a doc (md) there's no mode bar — you comment by highlighting text in the
            editor. (Lives in the strip, not floating over the canvas — the Preview's
            native webview would occlude it.) */}
        {selectedItem?.kind === "variant" && (
          <div className="flex shrink-0 items-center gap-1 border-l pl-2 pr-1.5">
            <button
              type="button"
              onClick={editing ? exitEdit : enterEdit}
              disabled={(annotating && !editing) || (!editing && !html)}
              title={t("design.editTip")}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[11px] disabled:opacity-40",
                editing
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Pencil className="size-3" />
              {editing ? t("design.editDone") : t("design.edit")}
            </button>
            <AnnotationToggle />
          </div>
        )}
      </div>

      {/* Body: doc → editor; design → wireframe + annotation + adopt. */}
      <div className="relative min-h-0 flex-1">
        {selectedItem?.kind === "doc" && (
          <div className="flex h-full min-h-0">
            <div className="relative min-w-0 flex-1">
              <SlotEditor
                path={selectedItem.key}
                label={selectedItem.label}
                onExternalChange={onChange}
                onComment={(text, comment) =>
                  setDocComments((c) => [...c, { text, comment }])
                }
              />
            </div>
            {docComments.length > 0 && (
              <aside className="flex w-64 shrink-0 flex-col border-l bg-card/40">
                <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-medium">
                  {t("editorComment.sidebarTitle")} ({docComments.length})
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {docComments.map((c, i) => (
                    <div key={i} className="rounded border bg-background p-2 text-[11px]">
                      <div className="mb-1 line-clamp-2 italic text-muted-foreground">
                        “{c.text.slice(0, 80)}
                        {c.text.length > 80 ? "…" : ""}”
                      </div>
                      <div className="text-foreground">{c.comment}</div>
                      <button
                        type="button"
                        onClick={() => setDocComments((arr) => arr.filter((_, j) => j !== i))}
                        className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 border-t p-2">
                  <button
                    type="button"
                    onClick={() => void sendDocComments()}
                    disabled={sendingComments}
                    className="w-full rounded bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {sendingComments ? t("common.loading") : t("editorComment.sendAll")}
                  </button>
                </div>
              </aside>
            )}
          </div>
        )}
        {selectedItem?.kind === "variant" && (
          <div className="flex h-full min-h-0 flex-col">
            {/* Filename header (DF-2) + the Edit toggle (E-1b). HTML is a free visual
                artifact; you implement a direction by asking in chat, but you can also
                directly edit the mock (Layer/Style/Text) — written back to the file. */}
            <header className="flex h-9 shrink-0 items-center gap-2 border-b px-4">
              <Code2 className="size-3.5 shrink-0 text-sky-500/80" />
              <span className="truncate text-sm font-medium">{selectedItem.label}</span>
              <span
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={selectedItem.variant.path}
              >
                {selectedItem.variant.file}
              </span>
              {editing && (
                <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground">
                  {t("design.editing")}
                </span>
              )}
            </header>
            {editing ? (
              <>
                {/* Tool switcher (Pen/Pin merge): Select = pick element → style/text/
                    comment; Annotate = Pin/Pen over the SAME live mock iframe (no freeze,
                    since the mock is an iframe — overlay sits over it). */}
                <div className="flex h-8 shrink-0 items-center gap-1 border-b px-3">
                  {(
                    [
                      ["select", MousePointer2, t("mockTool.select")],
                      ["annotate", Pencil, t("mockTool.annotate")],
                    ] as const
                  ).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMockTool(id)}
                      className={cn(
                        "flex h-6 items-center gap-1 rounded px-2 text-[11px]",
                        mockTool === id
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3" />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1">
                  {mockTool === "select" && (
                    <aside className="w-[230px] shrink-0 overflow-hidden border-r bg-card/40">
                      <EditLayerPanel vedit={vedit} />
                    </aside>
                  )}
                  <div className="relative min-h-0 flex-1 bg-white">
                    <iframe
                      ref={mockFrameRef}
                      key={`edit-${selectedItem.key}`}
                      sandbox="allow-scripts allow-same-origin"
                      srcDoc={editHtml ?? ""}
                      title={selectedItem.label}
                      onLoad={() => {
                        if (mockTool === "select") veTransport.activate();
                      }}
                      className="size-full bg-white"
                    />
                    {mockTool === "annotate" && (
                      <AnnotationLayer
                        key={`edit-anno-${selectedItem.key}`}
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
                  {mockTool === "select" && (
                  <aside className="flex w-[240px] shrink-0 flex-col overflow-hidden border-l bg-card/40">
                    {/* Unified edit: comment on the PICKED element (alongside text/style).
                        Accumulate → one batch send, injected into the running agent. */}
                    <div className="shrink-0 border-b p-2">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("mockComment.title")}
                      </div>
                      {vedit.selected ? (
                        <div className="space-y-1">
                          <div className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {vedit.selected.tag}
                            {vedit.selected.text ? `: ${vedit.selected.text.slice(0, 24)}` : ""}
                          </div>
                          <textarea
                            value={mockCommentDraft}
                            onChange={(e) => setMockCommentDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
                                e.preventDefault();
                                addMockComment();
                              }
                            }}
                            rows={2}
                            placeholder={t("mockComment.placeholder")}
                            className="w-full resize-none rounded border bg-background p-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={addMockComment}
                              disabled={!mockCommentDraft.trim()}
                              className="flex-1 rounded bg-muted px-2 py-1 text-[11px] font-medium hover:bg-muted-foreground/20 disabled:opacity-50"
                            >
                              {t("editorComment.add")}
                            </button>
                            {/* Per-element 3-variants foundation (comment draft = direction). */}
                            <button
                              type="button"
                              onClick={() => void requestElementVariants()}
                              disabled={sendingComments}
                              title={t("mockVariants.tip")}
                              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                              <Sparkles className="size-3" />
                              {t("mockVariants.button")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">{t("mockComment.pickHint")}</div>
                      )}
                      {mockComments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {mockComments.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-1 rounded border bg-background p-1 text-[10px]"
                            >
                              <span className="min-w-0 flex-1 text-foreground">{c.comment}</span>
                              <button
                                type="button"
                                onClick={() => setMockComments((arr) => arr.filter((_, j) => j !== i))}
                                aria-label={t("common.delete")}
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => void sendMockComments()}
                            disabled={sendingComments}
                            className="w-full rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {sendingComments
                              ? t("common.loading")
                              : `${t("editorComment.send")} (${mockComments.length})`}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <EditStylePanel vedit={vedit} />
                    </div>
                  </aside>
                  )}
                </div>
                <PendingEditsBar
                  vedit={vedit}
                  busy={savingMock}
                  onApply={() => void saveMock()}
                  onDiscard={exitEdit}
                  applyLabel={t("edit.saveToMock")}
                  onSecondary={() => void applyMockToCode()}
                  secondaryLabel={t("edit.applyToCode")}
                />
              </>
            ) : (
              <div className="relative min-h-0 flex-1 bg-background">
                {/* Design html runs its own inline JS so prototypes are actually
                    touchable (toggles, selection, modals…). `allow-scripts` WITHOUT
                    `allow-same-origin` keeps it isolated: scripts run on an opaque
                    origin (no parent access, no storage/cookies). The html stays a
                    single self-contained file (no external deps) → still dev-server-free. */}
                <iframe
                  ref={viewFrameRef}
                  key={`frame-${selectedItem.key}`}
                  sandbox="allow-scripts"
                  srcDoc={withDesignFind(html, t("design.findPlaceholder"))}
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default IssueDesign;
