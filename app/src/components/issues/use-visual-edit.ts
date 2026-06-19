"use client";

// Visual-edit engine (DEC-131). Drives the in-page overlay agent (bezier-overlay.ts)
// inside the embedded webview and surfaces selection + live style/structure editing
// to the Style/Layer panels. Bezier→page = embed_browser_eval (apply/activate/inject/
// move); page→Bezier = embed_browser_drain (eval_with_callback → `bz-edit` event).
// Edits apply LIVE (instant) and accumulate as diffs + reorder ops; "apply to code"
// hands them to the user's agent via sendDesignFeedback (preview-pane owns that call).

import * as React from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { embedBrowserEval, embedBrowserDrain } from "@/lib/ipc";
import { OVERLAY_JS, DRAIN_JS } from "@/lib/bezier-overlay";

const DRAIN_MS = 120;

export interface ElBrief {
  selector: string;
  tag: string;
  classes: string[];
  text: string;
}
export interface SelectedInfo extends ElBrief {
  computed: Record<string, string>;
  ancestors: ElBrief[];
  children: ElBrief[];
  /** Full direct text (leaf text elements only) — editable in the Content field. */
  content: string;
  editableText: boolean;
}
export interface TextEdit {
  selector: string;
  tag: string;
  classes: string[];
  before: string;
  after: string;
}
export interface StyleDiff {
  selector: string;
  tag: string;
  classes: string[];
  prop: string;
  before: string;
  after: string;
}
export interface ReorderOp {
  src: ElBrief;
  dest: ElBrief;
  before: boolean;
}
/** A node in the full page layer tree (left panel shows the whole page). */
export interface TreeNode {
  sel: string;
  tag: string;
  classes: string[];
  text: string;
  children: TreeNode[];
}

interface DrainEvent {
  type: string;
  el?: SelectedInfo;
  root?: TreeNode;
  sel?: string | null;
  src?: ElBrief;
  dest?: ElBrief;
  before?: boolean;
}
interface HistoryEntry {
  selector: string;
  tag: string;
  classes: string[];
  prop: string;
  prevValue: string;
  origBefore: string;
}

function q(s: string) {
  return JSON.stringify(s);
}

export interface VisualEdit {
  selected: SelectedInfo | null;
  /** The full page layer tree (left panel), refreshed on activate / reorder. */
  tree: TreeNode | null;
  /** Selector of the currently-selected node, for highlighting in the tree. */
  selectedSelector: string | null;
  /** Applied overrides for the SELECTED element (prop → value), for display. */
  overrides: Record<string, string>;
  diffs: StyleDiff[];
  reorders: ReorderOp[];
  textEdits: TextEdit[];
  /** diffs + reorders + text edits count — drives the pending bar. */
  editCount: number;
  applyStyle: (prop: string, value: string) => void;
  /** Edit the selected element's text content (leaf text elements). */
  setText: (value: string) => void;
  resetProp: (prop: string) => void;
  undo: () => void;
  canUndo: boolean;
  selectParent: () => void;
  selectPath: (path: string) => void;
  /** Reorder: move `src` before/after `dest` (shared-parent siblings). */
  moveChild: (src: ElBrief, dest: ElBrief, before: boolean) => void;
  /** Keyboard reorder: move the selected element among its siblings (-1 up / +1 down). */
  moveSelectedBy: (delta: number) => void;
  clearEdits: () => void;
}

export function useVisualEdit({
  active,
  navKey,
}: {
  active: boolean;
  navKey: string;
}): VisualEdit {
  const [selected, setSelected] = React.useState<SelectedInfo | null>(null);
  const [tree, setTree] = React.useState<TreeNode | null>(null);
  const [selectedSelector, setSelectedSelector] = React.useState<string | null>(null);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const diffsRef = React.useRef<Map<string, StyleDiff>>(new Map());
  const [diffs, setDiffs] = React.useState<StyleDiff[]>([]);
  const [reorders, setReorders] = React.useState<ReorderOp[]>([]);
  const textEditsRef = React.useRef<Map<string, TextEdit>>(new Map());
  const [textEdits, setTextEdits] = React.useState<TextEdit[]>([]);
  const historyRef = React.useRef<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);
  const selectedRef = React.useRef<SelectedInfo | null>(null);
  React.useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const syncDiffs = React.useCallback(() => {
    setDiffs(Array.from(diffsRef.current.values()));
  }, []);

  const evalApplyTo = (selector: string, prop: string, value: string) =>
    void embedBrowserEval(
      `window.__bzEdit && window.__bzEdit.applyTo(${q(selector)}, ${q(prop)}, ${q(value)})`,
    ).catch(() => {});

  // Forward edit (apply / reset / paste): records history + diff, updates the live DOM.
  const recordEdit = React.useCallback(
    (info: ElBrief, prop: string, value: string, computedBefore: string) => {
      const key = `${info.selector}|${prop}`;
      const existing = diffsRef.current.get(key);
      const origBefore = existing ? existing.before : computedBefore;
      const prevValue = existing ? existing.after : origBefore;
      historyRef.current.push({
        selector: info.selector,
        tag: info.tag,
        classes: info.classes,
        prop,
        prevValue,
        origBefore,
      });
      setCanUndo(true);
      if (value === origBefore) diffsRef.current.delete(key);
      else
        diffsRef.current.set(key, {
          selector: info.selector,
          tag: info.tag,
          classes: info.classes,
          prop,
          before: origBefore,
          after: value,
        });
      syncDiffs();
    },
    [syncDiffs],
  );

  const applyStyle = React.useCallback(
    (prop: string, value: string) => {
      const sel = selectedRef.current;
      if (!sel) return;
      recordEdit(sel, prop, value, sel.computed[prop] ?? "");
      setOverrides((o) =>
        value === (sel.computed[prop] ?? "") ? omit(o, prop) : { ...o, [prop]: value },
      );
      void embedBrowserEval(`window.__bzEdit && window.__bzEdit.apply(${q(prop)}, ${q(value)})`).catch(
        () => {},
      );
    },
    [recordEdit],
  );

  const resetProp = React.useCallback(
    (prop: string) => {
      const sel = selectedRef.current;
      if (!sel) return;
      const key = `${sel.selector}|${prop}`;
      const d = diffsRef.current.get(key);
      const orig = d ? d.before : sel.computed[prop] ?? "";
      recordEdit(sel, prop, orig, sel.computed[prop] ?? "");
      setOverrides((o) => omit(o, prop));
      evalApplyTo(sel.selector, prop, orig);
    },
    [recordEdit],
  );

  const undo = React.useCallback(() => {
    const e = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    if (!e) return;
    const key = `${e.selector}|${e.prop}`;
    if (e.prevValue === e.origBefore) diffsRef.current.delete(key);
    else
      diffsRef.current.set(key, {
        selector: e.selector,
        tag: e.tag,
        classes: e.classes,
        prop: e.prop,
        before: e.origBefore,
        after: e.prevValue,
      });
    syncDiffs();
    evalApplyTo(e.selector, e.prop, e.prevValue);
    const sel = selectedRef.current;
    if (sel && sel.selector === e.selector) {
      setOverrides((o) =>
        e.prevValue === e.origBefore ? omit(o, e.prop) : { ...o, [e.prop]: e.prevValue },
      );
    }
  }, [syncDiffs]);

  const selectParent = React.useCallback(() => {
    void embedBrowserEval("window.__bzEdit && window.__bzEdit.selectParent()").catch(() => {});
  }, []);
  const selectPath = React.useCallback((path: string) => {
    void embedBrowserEval(`window.__bzEdit && window.__bzEdit.selectPath(${q(path)})`).catch(
      () => {},
    );
  }, []);

  const moveChild = React.useCallback((src: ElBrief, dest: ElBrief, before: boolean) => {
    if (src.selector === dest.selector) return;
    void embedBrowserEval(
      `window.__bzEdit && window.__bzEdit.moveNode(${q(src.selector)}, ${q(dest.selector)}, ${before})`,
    ).catch(() => {});
    setReorders((r) => [...r, { src, dest, before }]);
  }, []);

  // Edit the selected element's text content (live + recorded as a text intent).
  const setText = React.useCallback((value: string) => {
    const sel = selectedRef.current;
    if (!sel) return;
    const key = sel.selector;
    const existing = textEditsRef.current.get(key);
    const before = existing ? existing.before : sel.content;
    if (value === before) textEditsRef.current.delete(key);
    else
      textEditsRef.current.set(key, {
        selector: sel.selector,
        tag: sel.tag,
        classes: sel.classes,
        before,
        after: value,
      });
    setTextEdits(Array.from(textEditsRef.current.values()));
    void embedBrowserEval(`window.__bzEdit && window.__bzEdit.setText(${q(value)})`).catch(() => {});
  }, []);

  // Keyboard reorder (↑/↓). The overlay performs the move in-page and emits a
  // `reorder` event we record (so it works even when the webview has focus).
  const moveSelectedBy = React.useCallback((delta: number) => {
    void embedBrowserEval(`window.__bzEdit && window.__bzEdit.moveSelectedBy(${delta})`).catch(
      () => {},
    );
  }, []);

  const clearEdits = React.useCallback(() => {
    diffsRef.current.clear();
    historyRef.current = [];
    textEditsRef.current.clear();
    setCanUndo(false);
    setReorders([]);
    setTextEdits([]);
    syncDiffs();
    setOverrides({});
  }, [syncDiffs]);

  // Activate / inject on (re)entry + on navigation; deactivate on exit.
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | null = null;
    let unlisten: UnlistenFn | null = null;

    (async () => {
      setSelected(null);
      setOverrides({});
      try {
        unlisten = await listen<string>("bz-edit", (e) => {
          if (cancelled) return;
          let evs: DrainEvent[];
          try {
            evs = JSON.parse(e.payload) as DrainEvent[];
          } catch {
            return;
          }
          for (const ev of evs) {
            if (ev.type === "selected" && ev.el) {
              const el = ev.el;
              setSelected(el);
              setSelectedSelector(el.selector);
              // Re-selecting an already-edited element → show its pending overrides.
              const ov: Record<string, string> = {};
              diffsRef.current.forEach((d) => {
                if (d.selector === el.selector) ov[d.prop] = d.after;
              });
              setOverrides(ov);
            } else if (ev.type === "tree" && ev.root) {
              setTree(ev.root);
              if (ev.sel !== undefined) setSelectedSelector(ev.sel);
            } else if (ev.type === "reorder" && ev.src && ev.dest) {
              const op = { src: ev.src, dest: ev.dest, before: !!ev.before };
              setReorders((r) => [...r, op]);
            }
          }
        });
        if (cancelled) return;
        await embedBrowserEval(OVERLAY_JS);
        await embedBrowserEval("window.__bzEdit && window.__bzEdit.activate()");
        timer = window.setInterval(() => {
          void embedBrowserDrain(DRAIN_JS).catch(() => {});
        }, DRAIN_MS);
      } catch {
        /* webview not ready / eval failed — Edit mode just shows the empty state */
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      if (unlisten) unlisten();
      void embedBrowserEval("window.__bzEdit && window.__bzEdit.deactivate()").catch(() => {});
    };
  }, [active, navKey]);

  return {
    selected,
    tree,
    selectedSelector,
    overrides,
    diffs,
    reorders,
    textEdits,
    editCount: diffs.length + reorders.length + textEdits.length,
    applyStyle,
    setText,
    resetProp,
    undo,
    canUndo,
    selectParent,
    selectPath,
    moveChild,
    moveSelectedBy,
    clearEdits,
  };
}

function omit(o: Record<string, string>, k: string): Record<string, string> {
  if (!(k in o)) return o;
  const n = { ...o };
  delete n[k];
  return n;
}
