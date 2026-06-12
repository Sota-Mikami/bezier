"use client";

// Design-feedback overlay (DEC-045). A transparent layer over the live preview
// iframe where you drop Figma-style comment pins or draw freehand pen marks,
// each carrying an instruction. Marks accumulate as DRAFTS; an explicit Send
// (single or "まとめて送信") captures an annotated screenshot of the preview and
// hands the batch to the agent as ONE fix turn (continues the conversation).
//
// The overlay lives in OUR app layer (not the iframe), so the agent's edits
// hot-reload the iframe WITHOUT wiping pins or an in-progress composer. The
// screenshot is an OS-level region capture (capture_region), which sees the
// iframe pixels + the drawn marks despite cross-origin.

import * as React from "react";
import {
  MousePointer2,
  MessageSquarePlus,
  Pencil,
  Send,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { captureRegion, messageDialog } from "@/lib/ipc";
import {
  readAnnotations,
  writeAnnotations,
  newAnnotation,
  type Annotation,
} from "@/lib/annotations";
import { cn } from "@/lib/utils";
import type { ImplementSession } from "./use-implement-session";

type Tool = "cursor" | "comment" | "pen";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
const raf2 = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

export function DesignAnnotations({ session }: { session: ImplementSession }) {
  const { root, issue, ref, sendDesignFeedback, agentState } = session;

  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = React.useState<Tool>("cursor");
  const [items, setItems] = React.useState<Annotation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [draftPath, setDraftPath] = React.useState<{ x: number; y: number }[] | null>(
    null,
  );
  const [capturing, setCapturing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Load the live pins for this issue (survive navigation / restart).
  React.useEffect(() => {
    let cancelled = false;
    readAnnotations(root, issue.id)
      .then((a) => {
        if (!cancelled) setItems(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [root, issue.id]);

  const persist = React.useCallback(
    (next: Annotation[]) => {
      setItems(next);
      void writeAnnotations(root, issue.id, next).catch(() => {});
    },
    [root, issue.id],
  );

  // Detect a sent batch's turn ENDING, to flip its annotations "running" → "done".
  // With a persistent Claude session the agent doesn't exit — it goes to "waiting"
  // when the turn ends. So: after a send, wait until we've seen it "running", then
  // mark done when it next reaches waiting/done/error/idle. The post-send guard
  // (sentTurnRef + sawRunningRef) avoids the brief kill→relaunch gap being read as
  // a finished turn.
  const sentTurnRef = React.useRef(false);
  const sawRunningRef = React.useRef(false);
  React.useEffect(() => {
    if (!sentTurnRef.current) return;
    if (agentState === "running") {
      sawRunningRef.current = true;
      return;
    }
    if (
      sawRunningRef.current &&
      (agentState === "waiting" ||
        agentState === "done" ||
        agentState === "error" ||
        agentState === null)
    ) {
      sentTurnRef.current = false;
      sawRunningRef.current = false;
      setItems((cur) => {
        if (!cur.some((a) => a.status === "running")) return cur;
        const next = cur.map((a) =>
          a.status === "running" ? { ...a, status: "done" as const } : a,
        );
        void writeAnnotations(root, issue.id, next).catch(() => {});
        return next;
      });
    }
  }, [agentState, root, issue.id]);

  const toFrac = React.useCallback((e: React.PointerEvent) => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "comment") {
      e.preventDefault();
      const { x, y } = toFrac(e);
      const a = newAnnotation("pin", x, y);
      persist([...items, a]);
      setActiveId(a.id);
      setTool("cursor");
    } else if (tool === "pen") {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraftPath([toFrac(e)]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === "pen" && draftPath) {
      setDraftPath((p) => (p ? [...p, toFrac(e)] : p));
    }
  };

  const onPointerUp = () => {
    if (tool === "pen" && draftPath) {
      if (draftPath.length >= 2) {
        const cx = avg(draftPath.map((p) => p.x));
        const cy = avg(draftPath.map((p) => p.y));
        const a = newAnnotation("pen", cx, cy, draftPath);
        persist([...items, a]);
        setActiveId(a.id);
      }
      setDraftPath(null);
      setTool("cursor");
    }
  };

  const updateText = (id: string, text: string) => {
    persist(items.map((a) => (a.id === id ? { ...a, text } : a)));
  };
  const removeItem = (id: string) => {
    persist(items.filter((a) => a.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // Hide the chrome, capture the preview region (incl. pins) to a PNG under the
  // issue dir (readable by the agent via --add-dir), then restore the chrome.
  const captureShot = React.useCallback(async (): Promise<string | null> => {
    const layer = layerRef.current;
    if (!layer) return null;
    setCapturing(true);
    await raf2();
    try {
      const r = layer.getBoundingClientRect();
      const win = getCurrentWindow();
      const pos = await win.innerPosition();
      const scale = await win.scaleFactor();
      // innerPosition is physical px; the element rect is CSS px (points).
      // screencapture -R wants points in the global top-left coordinate space.
      const x = pos.x / scale + r.left;
      const y = pos.y / scale + r.top;
      const out = `${issue.dir}/feedback/${Date.now()}.png`;
      return await captureRegion(x, y, r.width, r.height, out);
    } catch {
      return null;
    } finally {
      setCapturing(false);
    }
  }, [issue.dir]);

  const numberOf = React.useCallback(
    (id: string) => items.findIndex((a) => a.id === id) + 1,
    [items],
  );

  const send = React.useCallback(
    async (batch: Annotation[]) => {
      if (batch.length === 0) return;
      if (!ref) {
        await messageDialog(
          "先に右パネルの「Implement with AI」で worktree を作成してください。",
          { title: "worktree がありません" },
        );
        return;
      }
      setBusy(true);
      try {
        const shot = await captureShot();
        const lines = batch.map(
          (a) =>
            `${numberOf(a.id)}. [${a.kind === "pen" ? "ペン注釈" : "ピン"} ` +
            `位置 ${Math.round(a.x * 100)}%, ${Math.round(a.y * 100)}%] ` +
            `${a.text.trim() || "(指示なし)"}`,
        );
        const promptText = [
          "## デザインフィードバック",
          "プレビュー上の注釈への修正依頼です。下記の番号付き指示に従い、この worktree 内の UI を修正してください。",
          shot
            ? `注釈つきスクリーンショット: \`${shot}\`（この画像を開き、同じ番号の付いた箇所を確認してください）`
            : "(スクリーンショットは取得できませんでした。位置％を参考にしてください)",
          "",
          ...lines,
          "",
          "対応したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
        ].join("\n");
        await sendDesignFeedback(promptText, `${batch.length} 件の注釈`);
        // Arm the turn-ended detector (see the agentState effect).
        sentTurnRef.current = true;
        sawRunningRef.current = false;
        const ids = new Set(batch.map((a) => a.id));
        persist(
          items.map((a) =>
            ids.has(a.id) ? { ...a, status: "running" as const } : a,
          ),
        );
        setActiveId(null);
      } catch (e) {
        await messageDialog(e instanceof Error ? e.message : String(e), {
          title: "送信エラー",
        });
      } finally {
        setBusy(false);
      }
    },
    [ref, captureShot, numberOf, sendDesignFeedback, items, persist],
  );

  const drafts = items.filter((a) => a.status === "draft" && a.text.trim());
  const active = activeId ? items.find((a) => a.id === activeId) : null;
  const drawing = tool !== "cursor";

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
      {/* Capture surface — only intercepts pointer events while a draw tool is
          active, so the iframe stays interactive in cursor mode. */}
      {drawing && (
        <div
          className={cn(
            "absolute inset-0 touch-none",
            tool === "comment" ? "cursor-copy" : "cursor-crosshair",
          )}
          style={{ pointerEvents: "auto" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )}

      {/* Pen strokes (existing + in-progress). viewBox 0..100 with a
          non-scaling stroke so width stays uniform on resize. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        {items
          .filter((a) => a.kind === "pen" && a.path && a.path.length > 1)
          .map((a) => (
            <path
              key={a.id}
              d={penPath(a.path!)}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={a.status === "done" ? 0.4 : 0.9}
            />
          ))}
        {draftPath && draftPath.length > 1 && (
          <path
            d={penPath(draftPath)}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Pins / pen badges — kept visible during capture so they appear in the
          screenshot handed to the agent. */}
      {items.map((a, i) => (
        <PinBadge
          key={a.id}
          n={i + 1}
          x={a.x}
          y={a.y}
          status={a.status}
          active={a.id === activeId}
          onClick={() => setActiveId((cur) => (cur === a.id ? null : a.id))}
        />
      ))}

      {/* Composer for the active annotation (hidden during capture). */}
      {active && !capturing && (
        <Composer
          key={active.id}
          n={numberOf(active.id)}
          annotation={active}
          busy={busy}
          onChange={(t) => updateText(active.id, t)}
          onSend={() => void send([active])}
          onClose={() => setActiveId(null)}
          onDelete={() => removeItem(active.id)}
        />
      )}

      {/* Toolbar + batch send bar (hidden during capture). */}
      {!capturing && (
        <>
          <Toolbar tool={tool} setTool={setTool} />
          {drafts.length > 0 && (
            <div
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur"
              style={{ pointerEvents: "auto" }}
            >
              <span className="text-xs text-muted-foreground">
                未送信 {drafts.length} 件
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send(drafts)}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Agent にまとめて送信
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function penPath(path: { x: number; y: number }[]): string {
  return path
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`)
    .join(" ");
}

function ToolButton({
  t,
  current,
  setTool,
  icon,
  label,
}: {
  t: Tool;
  current: Tool;
  setTool: (t: Tool) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => setTool(t)}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        current === t
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

function Toolbar({
  tool,
  setTool,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
}) {
  return (
    <div
      className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{ pointerEvents: "auto" }}
    >
      <ToolButton t="cursor" current={tool} setTool={setTool} icon={<MousePointer2 className="size-4" />} label="操作（カーソル）" />
      <ToolButton t="comment" current={tool} setTool={setTool} icon={<MessageSquarePlus className="size-4" />} label="コメント" />
      <ToolButton t="pen" current={tool} setTool={setTool} icon={<Pencil className="size-4" />} label="ペン" />
    </div>
  );
}

function PinBadge({
  n,
  x,
  y,
  status,
  active,
  onClick,
}: {
  n: number;
  x: number;
  y: number;
  status: Annotation["status"];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold shadow-md transition-transform hover:scale-110",
        status === "done"
          ? "bg-emerald-500 text-white"
          : status === "running"
            ? "bg-amber-500 text-white"
            : "bg-primary text-primary-foreground",
        active && "ring-2 ring-ring ring-offset-1",
      )}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, pointerEvents: "auto" }}
      title={`注釈 ${n}`}
    >
      {status === "done" ? <Check className="size-3.5" /> : n}
    </button>
  );
}

function Composer({
  n,
  annotation,
  busy,
  onChange,
  onSend,
  onClose,
  onDelete,
}: {
  n: number;
  annotation: Annotation;
  busy: boolean;
  onChange: (t: string) => void;
  onSend: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const done = annotation.status === "done";
  const runningState = annotation.status === "running";
  // Keep the card inside the preview: flip to the left/top when near an edge.
  const nearRight = annotation.x > 0.6;
  const nearBottom = annotation.y > 0.7;
  return (
    <div
      className="absolute w-64 rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-xl"
      style={{
        left: `${annotation.x * 100}%`,
        top: `${annotation.y * 100}%`,
        transform: `translate(${nearRight ? "-100%" : "0"}, ${nearBottom ? "-100%" : "0"}) translate(${nearRight ? "-10px" : "14px"}, ${nearBottom ? "-10px" : "14px"})`,
        pointerEvents: "auto",
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
          {n}
        </span>
        {annotation.kind === "pen" ? "ペン注釈" : "コメント"}
        {runningState && (
          <span className="ml-auto flex items-center gap-1 text-amber-600">
            <Loader2 className="size-3 animate-spin" /> 実行中
          </span>
        )}
        {done && (
          <span className="ml-auto flex items-center gap-1 text-emerald-600">
            <Check className="size-3" /> 対応済み
          </span>
        )}
      </div>

      {done || runningState ? (
        <p className="whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 text-xs">
          {annotation.text || "(指示なし)"}
        </p>
      ) : (
        <textarea
          autoFocus
          value={annotation.text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (annotation.text.trim()) onSend();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          rows={3}
          placeholder="この箇所への修正指示を書く…  (⌘Enter で送信)"
          className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        {!done && !runningState && (
          <button
            type="button"
            disabled={busy || !annotation.text.trim()}
            onClick={onSend}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            送信
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {done || runningState ? "閉じる" : "下書き"}
        </button>
        <button
          type="button"
          title="削除"
          aria-label="削除"
          onClick={onDelete}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export default DesignAnnotations;
