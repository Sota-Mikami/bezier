"use client";

// Design-feedback overlay (DEC-045 / DEC-046). A transparent layer over the live
// preview iframe for Figma-style review: drop comment pins, draw freehand pen
// marks, box rectangular regions, or pick a precise element (cooperating
// previews). Each carries an instruction that becomes an agent fix request.
//
// Marks accumulate as DRAFTS; an explicit Send (single or "まとめて送信") captures
// an annotated screenshot of the preview and hands the batch to the agent as ONE
// fix turn (continues the conversation). The overlay lives in OUR app layer, so
// the agent's edits hot-reload the iframe WITHOUT wiping pins or a composer.
//
// before/after (DEC-046 #2): the annotated shot sent to the agent doubles as the
// "before"; a clean shot taken when the turn ends is the "after" — both shown on
// the done card. element pick (DEC-046 #3): postMessage to a cooperating preview
// (public/continuum-inspect.js); degrades to coordinates when absent.

import * as React from "react";
import {
  MousePointer2,
  MessageSquarePlus,
  Pencil,
  Square,
  MousePointerClick,
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
  loadImageDataUrl,
  type Annotation,
} from "@/lib/annotations";
import { cn } from "@/lib/utils";
import type { ImplementSession } from "./use-implement-session";

type Tool = "cursor" | "comment" | "pen" | "rect" | "element";
type CaptureMode = "none" | "marks" | "clean";
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const raf2 = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

export function DesignAnnotations({
  session,
  iframeRef,
}: {
  session: ImplementSession;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const { root, issue, ref, sendDesignFeedback, agentState } = session;

  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = React.useState<Tool>("cursor");
  const [items, setItems] = React.useState<Annotation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [draftPath, setDraftPath] = React.useState<{ x: number; y: number }[] | null>(
    null,
  );
  const [draftRect, setDraftRect] = React.useState<Rect | null>(null);
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>("none");
  const [busy, setBusy] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);

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

  // Persist helpers — functional updates so effects never read a stale list.
  const save = React.useCallback(
    (next: Annotation[]) => {
      void writeAnnotations(root, issue.id, next).catch(() => {});
    },
    [root, issue.id],
  );
  const addAnnotation = React.useCallback(
    (a: Annotation) => {
      setItems((cur) => {
        const next = [...cur, a];
        save(next);
        return next;
      });
    },
    [save],
  );
  const patch = React.useCallback(
    (id: string, fields: Partial<Annotation>) => {
      setItems((cur) => {
        const next = cur.map((a) => (a.id === id ? { ...a, ...fields } : a));
        save(next);
        return next;
      });
    },
    [save],
  );
  const removeItem = React.useCallback(
    (id: string) => {
      setItems((cur) => {
        const next = cur.filter((a) => a.id !== id);
        save(next);
        return next;
      });
      setActiveId((cur) => (cur === id ? null : cur));
    },
    [save],
  );

  // Transient hint toast (e.g. element-pick unsupported).
  React.useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 4000);
    return () => window.clearTimeout(t);
  }, [hint]);

  const toFrac = React.useCallback((e: React.PointerEvent) => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }, []);

  // --- pointer handlers (comment / pen / rect) ----------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const p = toFrac(e);
    if (tool === "comment") {
      e.preventDefault();
      const a = newAnnotation("pin", p.x, p.y);
      addAnnotation(a);
      setActiveId(a.id);
      setTool("cursor");
    } else if (tool === "pen") {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraftPath([p]);
    } else if (tool === "rect") {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === "pen" && draftPath) {
      setDraftPath((cur) => (cur ? [...cur, toFrac(e)] : cur));
    } else if (tool === "rect" && draftRect) {
      const p = toFrac(e);
      setDraftRect((r) =>
        r ? { x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y } : r,
      );
    }
  };

  const onPointerUp = () => {
    if (tool === "pen" && draftPath) {
      if (draftPath.length >= 2) {
        const a = newAnnotation(
          "pen",
          avg(draftPath.map((p) => p.x)),
          avg(draftPath.map((p) => p.y)),
          { path: draftPath },
        );
        addAnnotation(a);
        setActiveId(a.id);
      }
      setDraftPath(null);
      setTool("cursor");
    } else if (tool === "rect" && draftRect) {
      const n = normRect(draftRect);
      if (n.w > 0.015 && n.h > 0.015) {
        const a = newAnnotation("rect", n.x, n.y, { rect: { w: n.w, h: n.h } });
        addAnnotation(a);
        setActiveId(a.id);
      }
      setDraftRect(null);
      setTool("cursor");
    }
  };

  // --- element pick (cooperating preview via postMessage) -----------------
  React.useEffect(() => {
    if (tool !== "element") return;
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setTool("cursor");
      return;
    }
    let ponged = false;
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "continuum-inspect") return;
      if (d.type === "pong") {
        ponged = true;
        win.postMessage({ source: "continuum", type: "pick-start" }, "*");
      } else if (d.type === "picked" && d.payload) {
        const pl = d.payload;
        const a = newAnnotation("element", clamp01(pl.x ?? 0.5), clamp01(pl.y ?? 0.5), {
          element: {
            selector: typeof pl.selector === "string" ? pl.selector : undefined,
            tag: typeof pl.tag === "string" ? pl.tag : undefined,
            classes: typeof pl.classes === "string" ? pl.classes : undefined,
            text: typeof pl.text === "string" ? pl.text.slice(0, 120) : undefined,
          },
        });
        addAnnotation(a);
        setActiveId(a.id);
        setTool("cursor");
      }
    };
    window.addEventListener("message", onMsg);
    win.postMessage({ source: "continuum", type: "ping" }, "*");
    const t = window.setTimeout(() => {
      if (!ponged) {
        setHint(
          "このプレビューは要素ピックに未対応です（public/continuum-inspect.js を読み込むと有効化）。コメント/矩形で指定してください。",
        );
        setTool("comment");
      }
    }, 900);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(t);
      win.postMessage({ source: "continuum", type: "pick-cancel" }, "*");
    };
  }, [tool, iframeRef, addAnnotation]);

  // --- screenshot capture -------------------------------------------------
  // marks=true keeps pins in the shot (the agent's annotated screenshot);
  // clean=true hides marks too (the "after" comparison shot).
  const captureShot = React.useCallback(
    async (clean: boolean): Promise<string | null> => {
      const layer = layerRef.current;
      if (!layer) return null;
      setCaptureMode(clean ? "clean" : "marks");
      await raf2();
      try {
        const r = layer.getBoundingClientRect();
        const win = getCurrentWindow();
        const pos = await win.innerPosition();
        const scale = await win.scaleFactor();
        const x = pos.x / scale + r.left;
        const y = pos.y / scale + r.top;
        const out = `${issue.dir}/feedback/${Date.now()}-${clean ? "after" : "before"}.png`;
        return await captureRegion(x, y, r.width, r.height, out);
      } catch {
        return null;
      } finally {
        setCaptureMode("none");
      }
    },
    [issue.dir],
  );

  // --- turn-ended detector (running → done) + "after" capture -------------
  const sentTurnRef = React.useRef(false);
  const sawRunningRef = React.useRef(false);
  const captureAfter = React.useCallback(
    (ids: string[]) => {
      window.setTimeout(async () => {
        const after = await captureShot(true);
        if (!after) return;
        setItems((cur) => {
          const idset = new Set(ids);
          const next = cur.map((a) =>
            idset.has(a.id) ? { ...a, afterShot: after } : a,
          );
          save(next);
          return next;
        });
      }, 1000); // let HMR settle before the after shot
    },
    [captureShot, save],
  );
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
        const runningIds = cur.filter((a) => a.status === "running").map((a) => a.id);
        if (runningIds.length === 0) return cur;
        const next = cur.map((a) =>
          a.status === "running" ? { ...a, status: "done" as const } : a,
        );
        save(next);
        captureAfter(runningIds);
        return next;
      });
    }
  }, [agentState, save, captureAfter]);

  // --- send ----------------------------------------------------------------
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
        const shot = await captureShot(false);
        const lines = batch.map((a) => `${numberOf(a.id)}. [${describe(a)}] ${a.text.trim() || "(指示なし)"}`);
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
        sentTurnRef.current = true;
        sawRunningRef.current = false;
        const ids = new Set(batch.map((a) => a.id));
        setItems((cur) => {
          const next = cur.map((a) =>
            ids.has(a.id)
              ? { ...a, status: "running" as const, ...(shot ? { beforeShot: shot } : {}) }
              : a,
          );
          save(next);
          return next;
        });
        setActiveId(null);
      } catch (e) {
        await messageDialog(e instanceof Error ? e.message : String(e), {
          title: "送信エラー",
        });
      } finally {
        setBusy(false);
      }
    },
    [ref, captureShot, numberOf, sendDesignFeedback, save],
  );

  const drafts = items.filter((a) => a.status === "draft" && a.text.trim());
  const active = activeId ? items.find((a) => a.id === activeId) : null;
  const drawing = tool === "comment" || tool === "pen" || tool === "rect";
  const showMarks = captureMode !== "clean";
  const showChrome = captureMode === "none";

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
      {/* Capture surface — intercepts pointer events only for the draw tools
          (element pick lets the iframe receive events). */}
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

      {/* Rect annotations + in-progress rectangle */}
      {showMarks &&
        items
          .filter((a) => a.kind === "rect" && a.rect)
          .map((a) => (
            <div
              key={a.id}
              className={cn(
                "absolute rounded border-2",
                a.status === "done" ? "border-emerald-500/60" : "border-primary/70",
              )}
              style={{
                left: pct(a.x),
                top: pct(a.y),
                width: pct(a.rect!.w),
                height: pct(a.rect!.h),
                pointerEvents: "none",
              }}
            />
          ))}
      {showMarks && draftRect && (
        <div
          className="absolute rounded border-2 border-primary/70 bg-primary/5"
          style={{
            left: pct(normRect(draftRect).x),
            top: pct(normRect(draftRect).y),
            width: pct(normRect(draftRect).w),
            height: pct(normRect(draftRect).h),
            pointerEvents: "none",
          }}
        />
      )}

      {/* Pen strokes (existing + in-progress) */}
      {showMarks && (
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
      )}

      {/* Numbered badges (pins / pen / rect / element) */}
      {showMarks &&
        items.map((a, i) => (
          <PinBadge
            key={a.id}
            n={i + 1}
            x={a.x}
            y={a.y}
            kind={a.kind}
            status={a.status}
            active={a.id === activeId}
            onClick={() => setActiveId((cur) => (cur === a.id ? null : a.id))}
          />
        ))}

      {/* Composer for the active annotation */}
      {active && showChrome && (
        <Composer
          key={active.id}
          n={numberOf(active.id)}
          annotation={active}
          busy={busy}
          onChange={(t) => patch(active.id, { text: t })}
          onSend={() => void send([active])}
          onClose={() => setActiveId(null)}
          onDelete={() => removeItem(active.id)}
        />
      )}

      {/* Toolbar + batch bar + hint */}
      {showChrome && (
        <>
          <Toolbar tool={tool} setTool={setTool} />
          {tool === "element" && (
            <Banner>要素をクリックして選択してください（Esc でツールバーから解除）</Banner>
          )}
          {hint && <Banner tone="warn">{hint}</Banner>}
          {drafts.length > 0 && (
            <div
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur"
              style={{ pointerEvents: "auto" }}
            >
              <span className="text-xs text-muted-foreground">未送信 {drafts.length} 件</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send(drafts)}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Agent にまとめて送信
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- helpers --------------------------------------------------------------

function normRect(r: Rect): Rect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

function penPath(path: { x: number; y: number }[]): string {
  return path.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`).join(" ");
}

/** Human-readable "where" for the agent prompt, per annotation kind. */
function describe(a: Annotation): string {
  switch (a.kind) {
    case "pen":
      return `ペン注釈 位置 ${pct(a.x)},${pct(a.y)}`;
    case "rect":
      return `領域 左上 ${pct(a.x)},${pct(a.y)} / 幅${pct(a.rect?.w ?? 0)} 高${pct(a.rect?.h ?? 0)}`;
    case "element": {
      const el = a.element;
      const sel = el?.selector ? ` セレクタ \`${el.selector}\`` : "";
      const tag = el?.tag ? `<${el.tag}>` : "要素";
      return `${tag}${sel} 位置 ${pct(a.x)},${pct(a.y)}`;
    }
    default:
      return `ピン 位置 ${pct(a.x)},${pct(a.y)}`;
  }
}

function Banner({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-14 max-w-[80%] -translate-x-1/2 rounded-md border px-3 py-1.5 text-center text-xs shadow-md backdrop-blur",
        tone === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "bg-background/95 text-muted-foreground",
      )}
      style={{ pointerEvents: "none" }}
    >
      {children}
    </div>
  );
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

function Toolbar({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  return (
    <div
      className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{ pointerEvents: "auto" }}
    >
      <ToolButton t="cursor" current={tool} setTool={setTool} icon={<MousePointer2 className="size-4" />} label="操作（カーソル）" />
      <ToolButton t="comment" current={tool} setTool={setTool} icon={<MessageSquarePlus className="size-4" />} label="コメント" />
      <ToolButton t="pen" current={tool} setTool={setTool} icon={<Pencil className="size-4" />} label="ペン" />
      <ToolButton t="rect" current={tool} setTool={setTool} icon={<Square className="size-4" />} label="矩形リージョン" />
      <ToolButton t="element" current={tool} setTool={setTool} icon={<MousePointerClick className="size-4" />} label="要素を選択" />
    </div>
  );
}

function PinBadge({
  n,
  x,
  y,
  kind,
  status,
  active,
  onClick,
}: {
  n: number;
  x: number;
  y: number;
  kind: Annotation["kind"];
  status: Annotation["status"];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[11px] font-semibold shadow-md transition-transform hover:scale-110",
        // rect badges sit at the top-left corner (no centering translate-y bias).
        "rounded-full border-2 border-background",
        status === "done"
          ? "bg-emerald-500 text-white"
          : status === "running"
            ? "bg-amber-500 text-white"
            : "bg-primary text-primary-foreground",
        active && "ring-2 ring-ring ring-offset-1",
      )}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, pointerEvents: "auto" }}
      title={`注釈 ${n}（${kind}）`}
    >
      {status === "done" ? <Check className="size-3.5" /> : n}
    </button>
  );
}

function ShotViewer({ before, after }: { before?: string; after?: string }) {
  const [side, setSide] = React.useState<"before" | "after">(after ? "after" : "before");
  // Track which path the loaded URL belongs to, so `src` can be DERIVED (no
  // synchronous setState-in-effect on path change).
  const [loaded, setLoaded] = React.useState<{ path: string; url: string | null } | null>(
    null,
  );
  const path = side === "after" ? after : before;
  React.useEffect(() => {
    if (!path) return;
    let cancelled = false;
    loadImageDataUrl(path).then((u) => {
      if (!cancelled) setLoaded({ path, url: u });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  const src = loaded && loaded.path === path ? loaded.url : null;
  if (!before && !after) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => setSide("before")}
          disabled={!before}
          className={cn(
            "rounded px-1.5 py-0.5",
            side === "before" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            !before && "opacity-40",
          )}
        >
          Before
        </button>
        <button
          type="button"
          onClick={() => setSide("after")}
          disabled={!after}
          className={cn(
            "rounded px-1.5 py-0.5",
            side === "after" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            !after && "opacity-40",
          )}
        >
          After
        </button>
      </div>
      <div className="overflow-hidden rounded border bg-muted/30">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={side} className="block max-h-40 w-full object-contain" />
        ) : (
          <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
          </div>
        )}
      </div>
    </div>
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
  const editable = !done && !runningState;
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
        {KIND_LABEL[annotation.kind]}
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

      {annotation.kind === "element" && annotation.element?.selector && (
        <p className="mb-1.5 truncate rounded bg-muted/50 px-1.5 py-1 font-mono text-[10px] text-muted-foreground" title={annotation.element.selector}>
          {annotation.element.selector}
        </p>
      )}

      {editable ? (
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
      ) : (
        <p className="whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 text-xs">
          {annotation.text || "(指示なし)"}
        </p>
      )}

      {done && <ShotViewer before={annotation.beforeShot} after={annotation.afterShot} />}

      <div className="mt-1.5 flex items-center gap-1.5">
        {editable && (
          <button
            type="button"
            disabled={busy || !annotation.text.trim()}
            onClick={onSend}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            送信
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {editable ? "下書き" : "閉じる"}
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

const KIND_LABEL: Record<Annotation["kind"], string> = {
  pin: "コメント",
  pen: "ペン注釈",
  rect: "矩形リージョン",
  element: "要素",
};

export default DesignAnnotations;
