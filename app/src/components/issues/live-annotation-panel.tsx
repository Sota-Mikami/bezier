"use client";

// Side panel for LIVE annotation mode (transport-based: marks render IN the page,
// not as a DOM overlay). Rendered beside the webview/iframe when annotating.
// Uses useAnnotationData hook to manage state + transport events.

import * as React from "react";
import { MessageSquarePlus, Pencil, Send, Loader2, Check, Trash2, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { loadImageDataUrl, type Annotation } from "@/lib/annotations";
import { useImageAttachments, type ImageBlob } from "@/lib/use-image-attachments";
import { AttachmentTray } from "@/components/ui/attachment-tray";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { VisualEditTransport } from "@/lib/visual-edit-transport";
import type { ImplementSession } from "./implement-session-types";
import type { AnnotationSurface } from "./design-annotations";
import { useAnnotationData } from "./use-annotation-data";

export function LiveAnnotationPanel({
  session,
  surface,
  transport,
  layerRef,
}: {
  session: ImplementSession;
  surface: AnnotationSurface;
  transport: VisualEditTransport;
  layerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { root, issue, agentState } = session;
  const t = useT();

  const data = useAnnotationData({ root, issue, surface, agentState, transport, layerRef });

  const {
    items, activeId, tool, busy,
    drafts, hasDraftMark, showChrome,
    setTool, setActiveId,
    undoLast, redoLast, clearDrafts,
    patch, removeItem, send,
  } = data;

  return (
    <div className="flex h-full flex-col">
      {/* Panel header + tool picker */}
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <span className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          {t("annotations.panelTitle")}
        </span>
        <ToolBtn t2="comment" current={tool} set={setTool} icon={<MessageSquarePlus className="size-3.5" />} label={t("annotations.toolComment")} />
        <ToolBtn t2="pen" current={tool} set={setTool} icon={<Pencil className="size-3.5" />} label={t("annotations.toolPen")} />
      </div>

      {/* Annotation list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1.5">
        {items.length === 0 && (
          <p className="py-6 text-center text-[11px] text-muted-foreground px-2">
            {tool === "pen" ? t("annotations.penHint") : t("annotations.panelEmpty")}
          </p>
        )}
        {items.map((a, i) => (
          <PanelItem
            key={a.id}
            n={i + 1}
            annotation={a}
            isActive={a.id === activeId}
            busy={busy}
            onChange={(txt) => patch(a.id, { text: txt })}
            onSend={(blobs) => void send([a], blobs)}
            onDelete={() => removeItem(a.id)}
            onClick={() => setActiveId(activeId === a.id ? null : a.id)}
          />
        ))}
      </div>

      {/* Batch action bar */}
      {showChrome && (drafts.length > 0 || hasDraftMark) && (
        <div className="shrink-0 border-t p-2 flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
            {t("annotations.unsentCount", { count: drafts.length })}
          </span>
          <button type="button" title={t("annotations.undo")} disabled={!hasDraftMark} onClick={undoLast}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <Undo2 className="size-3" />
          </button>
          <button type="button" title={t("annotations.redo")} disabled={!data.redoStack.length} onClick={redoLast}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <Redo2 className="size-3" />
          </button>
          <button type="button" title={t("annotations.clearAll")} disabled={!hasDraftMark} onClick={clearDrafts}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40">
            <Trash2 className="size-3" />
          </button>
          <button
            type="button"
            disabled={busy || drafts.length === 0}
            onClick={() => void send(drafts)}
            className="flex shrink-0 items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            {t("annotations.send")}
          </button>
        </div>
      )}
    </div>
  );
}

function ToolBtn({
  t2,
  current,
  set,
  icon,
  label,
}: {
  t2: "comment" | "pen";
  current: string;
  set: (t: "comment" | "pen" | "cursor" | "element") => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => set(t2)}
      className={cn(
        "flex size-6 items-center justify-center rounded transition-colors",
        current === t2
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

function PanelItem({
  n,
  annotation,
  isActive,
  busy,
  onChange,
  onSend,
  onDelete,
  onClick,
}: {
  n: number;
  annotation: Annotation;
  isActive: boolean;
  busy: boolean;
  onChange: (t: string) => void;
  onSend: (blobs: ImageBlob[]) => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const t = useT();
  const done = annotation.status === "done";
  const running = annotation.status === "running";
  const editable = !done && !running;
  const { blobs, remove, clear, fromDataTransfer } = useImageAttachments();
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const handleSend = React.useCallback(() => {
    onSend(blobs);
    clear();
  }, [blobs, onSend, clear]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground",
        isActive && "ring-1 ring-primary",
        done && "opacity-70",
      )}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-1.5 px-2.5 pt-2 pb-1 text-left"
      >
        <span className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
          done ? "bg-emerald-500 text-white" : running ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground",
        )}>
          {done ? <Check className="size-2.5" /> : n}
        </span>
        <span className="min-w-0 flex-1 text-[10px] font-medium text-muted-foreground">
          {kindLabelShort(annotation, t)}
        </span>
        {running && <Loader2 className="size-3 shrink-0 animate-spin text-amber-600" />}
        {done && <Check className="size-3 shrink-0 text-emerald-500" />}
      </button>

      {/* Expanded content */}
      {isActive && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {editable ? (
            <textarea
              autoFocus
              value={annotation.text}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (annotation.text.trim() || blobs.length > 0) handleSend();
                }
              }}
              onPaste={(e) => { if (e.clipboardData) fromDataTransfer(e.clipboardData); }}
              rows={3}
              placeholder={t("annotations.composerPlaceholder")}
              className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          ) : (
            <p className="whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 text-xs">
              {annotation.text || t("annotations.noInstruction")}
            </p>
          )}

          {editable && blobs.length > 0 && (
            <AttachmentTray items={blobs} onRemove={remove} onOpen={(id) => setLightboxIndex(blobs.findIndex((b) => b.id === id))} />
          )}

          {done && <PanelShotViewer before={annotation.beforeShot} after={annotation.afterShot} />}

          <div className="flex items-center gap-1.5">
            {editable && (
              <button
                type="button"
                disabled={busy || (!annotation.text.trim() && blobs.length === 0)}
                onClick={handleSend}
                className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-2.5 animate-spin" /> : <Send className="size-2.5" />}
                {t("annotations.send")}
              </button>
            )}
            <button
              type="button"
              title={t("common.delete")}
              onClick={onDelete}
              className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          </div>

          <ImageLightbox items={blobs} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
        </div>
      )}
    </div>
  );
}

function PanelShotViewer({ before, after }: { before?: string; after?: string }) {
  const t = useT();
  const [side, setSide] = React.useState<"before" | "after">(after ? "after" : "before");
  const [loaded, setLoaded] = React.useState<{ path: string; url: string | null } | null>(null);
  const path = side === "after" ? after : before;
  React.useEffect(() => {
    if (!path) return;
    let cancelled = false;
    loadImageDataUrl(path).then((u) => { if (!cancelled) setLoaded({ path, url: u }); });
    return () => { cancelled = true; };
  }, [path]);
  const src = loaded && loaded.path === path ? loaded.url : null;
  if (!before && !after) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[9px]">
        <button type="button" onClick={() => setSide("before")} disabled={!before}
          className={cn("rounded px-1.5 py-0.5", side === "before" ? "bg-accent text-accent-foreground" : "text-muted-foreground", !before && "opacity-40")}>
          {t("annotations.before")}
        </button>
        <button type="button" onClick={() => setSide("after")} disabled={!after}
          className={cn("rounded px-1.5 py-0.5", side === "after" ? "bg-accent text-accent-foreground" : "text-muted-foreground", !after && "opacity-40")}>
          {t("annotations.after")}
        </button>
      </div>
      <div className="overflow-hidden rounded border bg-muted/30">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={side} className="block max-h-32 w-full object-contain" />
        ) : (
          <div className="flex h-16 items-center justify-center"><Loader2 className="size-3 animate-spin text-muted-foreground" /></div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kindLabelShort(annotation: Annotation, t: (key: any) => string): string {
  switch (annotation.kind) {
    case "pin": return t("annotations.kind.pin");
    case "pen": return t("annotations.kind.pen");
    case "rect": return t("annotations.kind.rect");
    case "element": return t("annotations.kind.element");
  }
}

export default LiveAnnotationPanel;
