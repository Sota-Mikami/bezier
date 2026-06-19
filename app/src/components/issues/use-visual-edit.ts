"use client";

// Visual-edit engine (DEC-131). Drives the in-page overlay agent (bezier-overlay.ts)
// inside the embedded webview and surfaces selection + live style editing to the
// Style/Layer panels. Bezier→page = embed_browser_eval (apply/activate/inject);
// page→Bezier = embed_browser_drain (eval_with_callback → `bz-edit` event) which we
// listen to and parse. Edits apply LIVE as inline styles (instant feedback) and
// accumulate as diffs; "apply to code" hands the diffs to the user's agent via the
// existing sendDesignFeedback rail (preview-pane owns that call).

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
}
export interface StyleDiff {
  selector: string;
  tag: string;
  classes: string[];
  prop: string;
  before: string;
  after: string;
}

interface DrainEvent {
  type: string;
  el?: SelectedInfo;
}

function q(s: string) {
  return JSON.stringify(s);
}

export interface VisualEdit {
  selected: SelectedInfo | null;
  /** Current applied overrides for the SELECTED element (prop → value), for display. */
  overrides: Record<string, string>;
  /** All pending edits across elements (last write per selector+prop wins). */
  diffs: StyleDiff[];
  applyStyle: (prop: string, value: string) => void;
  selectParent: () => void;
  selectPath: (path: string) => void;
  clearEdits: () => void;
}

export function useVisualEdit({
  active,
  navKey,
}: {
  /** Edit mode on AND the embedded webview is live (ready + url). */
  active: boolean;
  /** Changes when the preview navigates (full reload) → re-inject the overlay. */
  navKey: string;
}): VisualEdit {
  const [selected, setSelected] = React.useState<SelectedInfo | null>(null);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  // diffs keyed by `${selector}|${prop}` so re-editing the same prop overwrites.
  const diffsRef = React.useRef<Map<string, StyleDiff>>(new Map());
  const [diffs, setDiffs] = React.useState<StyleDiff[]>([]);
  const selectedRef = React.useRef<SelectedInfo | null>(null);
  React.useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const syncDiffs = React.useCallback(() => {
    setDiffs(Array.from(diffsRef.current.values()));
  }, []);

  const applyStyle = React.useCallback(
    (prop: string, value: string) => {
      const sel = selectedRef.current;
      if (!sel) return;
      const key = `${sel.selector}|${prop}`;
      const existing = diffsRef.current.get(key);
      const before = existing ? existing.before : sel.computed[prop] ?? "";
      diffsRef.current.set(key, {
        selector: sel.selector,
        tag: sel.tag,
        classes: sel.classes,
        prop,
        before,
        after: value,
      });
      syncDiffs();
      setOverrides((o) => ({ ...o, [prop]: value }));
      void embedBrowserEval(`window.__bzEdit && window.__bzEdit.apply(${q(prop)}, ${q(value)})`).catch(
        () => {},
      );
    },
    [syncDiffs],
  );

  const selectParent = React.useCallback(() => {
    void embedBrowserEval("window.__bzEdit && window.__bzEdit.selectParent()").catch(() => {});
  }, []);
  const selectPath = React.useCallback((path: string) => {
    void embedBrowserEval(`window.__bzEdit && window.__bzEdit.selectPath(${q(path)})`).catch(
      () => {},
    );
  }, []);

  const clearEdits = React.useCallback(() => {
    diffsRef.current.clear();
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
      // New page context → drop stale selection/overrides (the diffs persist: they're
      // an accumulating edit list the maker still wants to send).
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
              setSelected(ev.el);
              setOverrides({}); // fresh element → no pending overrides shown yet
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

  return { selected, overrides, diffs, applyStyle, selectParent, selectPath, clearEdits };
}
