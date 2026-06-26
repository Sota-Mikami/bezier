"use client";

import * as React from "react";
import { webviewSnapshot, grantPath, messageDialog, writeFileBytes } from "@/lib/ipc";
import {
  readAnnotations,
  writeAnnotations,
  newAnnotation,
  type Annotation,
} from "@/lib/annotations";
import { tt } from "@/lib/i18n";
import { promptPhrases } from "@/lib/prompts";
import type { VisualEditTransport } from "@/lib/visual-edit-transport";
import type { ImplementSession } from "./implement-session-types";
import type { AnnotationSurface } from "./design-annotations";
import type { ImageBlob } from "@/lib/use-image-attachments";

type Tool = "cursor" | "comment" | "pen" | "element";
export type CaptureMode = "none" | "marks" | "clean";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
const raf2 = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

export function normRect(r: Rect): Rect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

/** Maps stored Annotation[] to the slim shape the in-page overlay expects. */
function toOverlayPins(items: Annotation[]): unknown[] {
  return items.map((a, i) => ({
    n: i + 1,
    kind: a.kind,
    status: a.status,
    pageX: a.pageX ?? 0,
    pageY: a.pageY ?? 0,
    pageRect: a.pageRect,
    pagePath: a.pagePath,
  }));
}

export interface UseAnnotationDataParams {
  root: string;
  issue: { id: string; dir: string };
  surface: AnnotationSurface;
  agentState: ImplementSession["agentState"];
  transport?: VisualEditTransport;
  layerRef: React.RefObject<HTMLDivElement | null>;
}

export interface UseAnnotationDataResult {
  items: Annotation[];
  activeId: string | null;
  tool: Tool;
  draftPath: { x: number; y: number }[] | null;
  draftRect: Rect | null;
  captureMode: CaptureMode;
  busy: boolean;
  redoStack: Annotation[];
  drafts: Annotation[];
  hasDraftMark: boolean;
  active: Annotation | null;
  drawing: boolean;
  showMarks: boolean;
  showChrome: boolean;
  surface: AnnotationSurface;
  setTool: (t: Tool) => void;
  setActiveId: (id: string | null) => void;
  toFrac: (e: React.PointerEvent) => { x: number; y: number };
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  undoLast: () => void;
  redoLast: () => void;
  clearDrafts: () => void;
  patch: (id: string, fields: Partial<Annotation>) => void;
  removeItem: (id: string) => void;
  numberOf: (id: string) => number;
  send: (batch: Annotation[], imageBlobs?: ImageBlob[]) => Promise<void>;
  issue: { id: string; dir: string };
}

// Describe annotation for prompt
function describePkg(a: Annotation): string {
  const p = promptPhrases();
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const pos = `${pct(a.x)},${pct(a.y)}`;
  switch (a.kind) {
    case "pen": return p.describePen(pos);
    case "rect": return p.describeRect(pos, pct(a.rect?.w ?? 0), pct(a.rect?.h ?? 0));
    case "element": {
      const el = a.element;
      const sel = el?.selector ? p.describeSelector(el.selector) : "";
      const tag = el?.tag ? `<${el.tag}>` : p.describeElementWord;
      return p.describeElement(tag, sel, pos);
    }
    default: return p.describePin(pos);
  }
}

export function useAnnotationData({
  root,
  issue,
  surface,
  agentState,
  transport,
  layerRef,
}: UseAnnotationDataParams): UseAnnotationDataResult {
  const [tool, setToolState] = React.useState<Tool>("comment");
  const [items, setItems] = React.useState<Annotation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [draftPath, setDraftPath] = React.useState<{ x: number; y: number }[] | null>(null);
  const [draftRect, setDraftRect] = React.useState<Rect | null>(null);
  const [captureMode, setCaptureMode] = React.useState<CaptureMode>("none");
  const [busy, setBusy] = React.useState(false);
  const [redoStack, setRedoStack] = React.useState<Annotation[]>([]);

  // Load annotations for this surface
  React.useEffect(() => {
    let cancelled = false;
    readAnnotations(root, issue.id, surface.key).then((a) => {
      if (!cancelled) setItems(a);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [root, issue.id, surface.key]);

  // Persist helpers
  const save = React.useCallback(
    (next: Annotation[]) => {
      void writeAnnotations(root, issue.id, surface.key, next).catch(() => {});
    },
    [root, issue.id, surface.key],
  );

  const addAnnotation = React.useCallback((a: Annotation) => {
    setItems((cur) => {
      const next = [...cur, a];
      save(next);
      return next;
    });
  }, [save]);

  const patch = React.useCallback((id: string, fields: Partial<Annotation>) => {
    setItems((cur) => {
      const next = cur.map((a) => (a.id === id ? { ...a, ...fields } : a));
      save(next);
      return next;
    });
  }, [save]);

  const removeItem = React.useCallback((id: string) => {
    setItems((cur) => {
      const next = cur.filter((a) => a.id !== id);
      save(next);
      return next;
    });
    setActiveId((cur) => (cur === id ? null : cur));
  }, [save]);

  // Coordinate conversion (overlay mode — fractions of layerRef)
  const toFrac = React.useCallback((e: React.PointerEvent) => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }, [layerRef]);

  // Pointer handlers (overlay mode — for AnnotationLayer DOM overlay)
  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    const p = toFrac(e);
    if (tool === "comment") {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
    } else if (tool === "pen") {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraftPath([p]);
    }
  }, [tool, toFrac]);

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (tool === "pen" && draftPath) {
      setDraftPath((cur) => (cur ? [...cur, toFrac(e)] : cur));
    } else if (tool === "comment" && draftRect) {
      const p = toFrac(e);
      setDraftRect((r) => r ? { x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y } : r);
    }
  }, [tool, draftPath, draftRect, toFrac]);

  const onPointerUp = React.useCallback(() => {
    if (tool === "pen" && draftPath) {
      if (draftPath.length >= 2) {
        const a = newAnnotation("pen", avg(draftPath.map((p) => p.x)), avg(draftPath.map((p) => p.y)), { path: draftPath });
        addAnnotation(a);
        setRedoStack([]);
      }
      setDraftPath(null);
    } else if (tool === "comment" && draftRect) {
      const n = normRect(draftRect);
      const a = n.w < 0.015 && n.h < 0.015
        ? newAnnotation("pin", draftRect.x, draftRect.y)
        : newAnnotation("rect", n.x, n.y, { rect: { w: n.w, h: n.h } });
      addAnnotation(a);
      setActiveId(a.id);
      setRedoStack([]);
      setDraftRect(null);
    }
  }, [tool, draftPath, draftRect, addAnnotation]);

  // Undo/redo/clear
  const undoLast = React.useCallback(() => {
    const removed = [...items].reverse().find((a) => a.status === "draft");
    if (!removed) return;
    removeItem(removed.id);
    setRedoStack((r) => [...r, removed]);
  }, [items, removeItem]);

  const redoLast = React.useCallback(() => {
    if (!redoStack.length) return;
    addAnnotation(redoStack[redoStack.length - 1]);
    setRedoStack((r) => r.slice(0, -1));
  }, [redoStack, addAnnotation]);

  const clearDrafts = React.useCallback(() => {
    setItems((cur) => {
      const next = cur.filter((a) => a.status !== "draft");
      save(next);
      return next;
    });
    setRedoStack([]);
    setActiveId(null);
  }, [save]);

  // Set tool + sync pen mode to transport
  const setTool = React.useCallback((t: Tool) => {
    setToolState(t);
    if (transport) {
      transport.call("annotatePenMode", [t === "pen"]);
    }
  }, [transport]);

  // Screenshot capture — uses WKWebView native snapshot (no Screen Recording).
  //
  // Dual-mode:
  //   transport !== undefined  →  Live mode. Annotation marks are injected INTO
  //     the embedded browser. Snapshot the full embedded-browser webview.
  //   transport === undefined  →  Design mode. Marks are a DOM overlay in the
  //     main webview. Crop the main webview to the annotation layer's rect.
  const captureShot = React.useCallback(async (clean: boolean): Promise<string | null> => {
    const layer = layerRef.current;
    if (!layer) return null;
    setCaptureMode(clean ? "clean" : "marks");
    await raf2();
    try {
      const out = `${issue.dir}/feedback/${Date.now()}-${clean ? "after" : "before"}.png`;
      if (transport !== undefined) {
        // Live mode: content lives in the embedded-browser child webview.
        return await webviewSnapshot("embedded-browser", 0, 0, 0, 0, out);
      }
      // Design mode: capture a crop of the main webview at the layer's rect.
      // getBoundingClientRect() returns CSS-pixel coords in the viewport, which
      // map 1:1 to WKWebView logical points (CSS px == macOS points).
      const r = layer.getBoundingClientRect();
      return await webviewSnapshot("main", r.left, r.top, r.width, r.height, out);
    } catch {
      return null;
    } finally {
      setCaptureMode("none");
    }
  }, [issue.dir, layerRef, transport]);

  const numberOf = React.useCallback((id: string) => items.findIndex((a) => a.id === id) + 1, [items]);

  // Persist helper ref for effect below
  const saveRef = React.useRef(save);
  React.useEffect(() => { saveRef.current = save; }, [save]);

  // Turn-ended detector (running → done) + "after" capture
  const sentTurnRef = React.useRef(false);
  const sawRunningRef = React.useRef(false);
  const captureAfter = React.useCallback((ids: string[]) => {
    window.setTimeout(async () => {
      const after = await captureShot(true);
      if (!after) return;
      setItems((cur) => {
        const idset = new Set(ids);
        const next = cur.map((a) => idset.has(a.id) ? { ...a, afterShot: after } : a);
        saveRef.current(next);
        return next;
      });
    }, 1000);
  }, [captureShot]);

  React.useEffect(() => {
    if (!sentTurnRef.current) return;
    if (agentState === "running") { sawRunningRef.current = true; return; }
    if (sawRunningRef.current && (agentState === "waiting" || agentState === "done" || agentState === "error" || agentState === null)) {
      sentTurnRef.current = false;
      sawRunningRef.current = false;
      setItems((cur) => {
        const runningIds = cur.filter((a) => a.status === "running").map((a) => a.id);
        if (runningIds.length === 0) return cur;
        const next = cur.map((a) => a.status === "running" ? { ...a, status: "done" as const } : a);
        saveRef.current(next);
        captureAfter(runningIds);
        return next;
      });
    }
  }, [agentState, captureAfter]);

  // Send batch
  const send = React.useCallback(async (batch: Annotation[], imageBlobs: ImageBlob[] = []) => {
    if (batch.length === 0) return;
    if (!surface.canSend) {
      await messageDialog(surface.cannotSendMessage, { title: tt("annotations.sendErrorTitle") });
      return;
    }
    setBusy(true);
    try {
      const shot = await captureShot(false);
      const ph = promptPhrases();
      const lines = batch.map((a) => `${numberOf(a.id)}. [${describePkg(a)}] ${a.text.trim() || ph.markFallback}`);
      if (imageBlobs.length > 0) {
        const dir = `${issue.dir}/chat-attachments`;
        for (const b of imageBlobs) {
          try {
            const outPath = `${dir}/${Date.now()}-${b.name}`;
            await grantPath(outPath);
            await writeFileBytes(outPath, new Uint8Array(await b.blob.arrayBuffer()));
            lines.push(`Image: ${outPath}`);
          } catch { /* non-fatal */ }
        }
      }
      const promptText = surface.buildPrompt(lines, shot);
      const sent = await surface.send(promptText, tt("annotations.annotationCount", { count: batch.length }));
      if (!sent) return;
      sentTurnRef.current = true;
      sawRunningRef.current = false;
      const ids = new Set(batch.map((a) => a.id));
      setItems((cur) => {
        const next = cur.map((a) => ids.has(a.id) ? { ...a, status: "running" as const, ...(shot ? { beforeShot: shot } : {}) } : a);
        saveRef.current(next);
        return next;
      });
      setActiveId(null);
    } catch (e) {
      await messageDialog(e instanceof Error ? e.message : String(e), { title: tt("annotations.sendFailedTitle") });
    } finally {
      setBusy(false);
    }
  }, [surface, captureShot, numberOf, issue]);

  // Transport: activation + event subscription
  const itemsRef = React.useRef(items);
  React.useEffect(() => { itemsRef.current = items; }, [items]);

  React.useEffect(() => {
    if (!transport) return;
    // Inject overlay (idempotent) then activate annotation mode
    transport.ensureOverlay?.();
    const activateTimer = window.setTimeout(() => {
      transport.call("annotateActivate", [toOverlayPins(itemsRef.current)]);
    }, 200);
    // Subscribe to events from the overlay
    const unsub = transport.subscribe((events) => {
      for (const ev of events as Array<Record<string, unknown>>) {
        if (ev.type === "annotate-pin") {
          const { pageX, pageY, docW, docH, near } = ev as { pageX: number; pageY: number; docW: number; docH: number; near: { selector?: string; tag?: string; text?: string } };
          const fracX = docW > 0 ? pageX / docW : 0;
          const fracY = docH > 0 ? pageY / docH : 0;
          const ann = newAnnotation("pin", fracX, fracY, { pageX, pageY, docW, docH, near });
          addAnnotation(ann);
          setActiveId(ann.id);
          setRedoStack([]);
        } else if (ev.type === "annotate-rect") {
          const { pageX, pageY, pageW, pageH, docW, docH, near } = ev as { pageX: number; pageY: number; pageW: number; pageH: number; docW: number; docH: number; near: { selector?: string; tag?: string; text?: string } };
          const fracX = docW > 0 ? pageX / docW : 0;
          const fracY = docH > 0 ? pageY / docH : 0;
          const fracW = docW > 0 ? pageW / docW : 0;
          const fracH = docH > 0 ? pageH / docH : 0;
          const ann = newAnnotation("rect", fracX, fracY, { rect: { w: fracW, h: fracH }, pageX, pageY, docW, docH, pageRect: { w: pageW, h: pageH }, near });
          addAnnotation(ann);
          setActiveId(ann.id);
          setRedoStack([]);
        } else if (ev.type === "annotate-pen-end") {
          const { path, docW, docH } = ev as { path: { x: number; y: number }[]; docW: number; docH: number };
          if (path && path.length >= 2) {
            const cx = avg(path.map((p) => p.x));
            const cy = avg(path.map((p) => p.y));
            const fracX = docW > 0 ? cx / docW : 0;
            const fracY = docH > 0 ? cy / docH : 0;
            const fracPath = path.map((p) => ({ x: docW > 0 ? p.x / docW : 0, y: docH > 0 ? p.y / docH : 0 }));
            const ann = newAnnotation("pen", fracX, fracY, { path: fracPath, pageX: cx, pageY: cy, docW, docH, pagePath: path });
            addAnnotation(ann);
            setRedoStack([]);
          }
        }
      }
    });
    return () => {
      window.clearTimeout(activateTimer);
      transport.call("annotateDeactivate", []);
      unsub();
    };
  }, [transport, addAnnotation]); // NOT items — activated once on mount

  // Sync items to in-page overlay pins when items change (transport mode)
  React.useEffect(() => {
    if (!transport) return;
    transport.call("annotateSyncPins", [toOverlayPins(items)]);
  }, [transport, items]);

  const drafts = items.filter((a) => a.status === "draft" && (a.kind === "pen" || a.text.trim() !== ""));
  const hasDraftMark = items.some((a) => a.status === "draft");
  const active = activeId ? items.find((a) => a.id === activeId) ?? null : null;
  const drawing = tool === "comment" || tool === "pen";
  const showMarks = captureMode !== "clean";
  const showChrome = captureMode === "none";

  return {
    items, activeId, tool, draftPath, draftRect, captureMode, busy, redoStack,
    drafts, hasDraftMark, active, drawing, showMarks, showChrome, surface,
    setTool, setActiveId, toFrac,
    onPointerDown, onPointerMove, onPointerUp,
    undoLast, redoLast, clearDrafts,
    patch, removeItem, numberOf, send,
    issue,
  };
}
