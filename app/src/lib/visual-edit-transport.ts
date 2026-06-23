// VisualEditTransport (E-1b) — the seam that lets the SAME visual-edit engine
// (bezier-overlay `OVERLAY_JS` + use-visual-edit hook + the Layer/Style panels) drive
// EITHER the embedded native webview (Preview) OR a same-origin iframe (the design
// mock). The overlay script is identical; only HOW Bezier talks to it differs:
//   - webview: string eval over Tauri IPC (embed_browser_eval) + drain via the
//     `bz-edit` event (a push model; the page can't be reached with DOM APIs).
//   - iframe: DIRECT calls on `contentWindow.__bzEdit` (no eval → no `unsafe-eval`
//     CSP dependency) + a poll that reads the queue (a pull model).
// The hook stays transport-agnostic; events flow back as raw objects it narrows.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { embedBrowserEval, embedBrowserDrain } from "@/lib/ipc";
import { OVERLAY_JS, DRAIN_JS } from "@/lib/bezier-overlay";

const DRAIN_MS = 120;

export interface VisualEditTransport {
  /** Invoke `window.__bzEdit.<method>(...args)` in the target (fire-and-forget). */
  call(method: string, args?: unknown[]): void;
  /** Ensure the overlay is installed + active (idempotent). */
  activate(): void;
  /** Begin delivering drained overlay events; returns an unsubscribe/stop fn. */
  subscribe(onEvents: (events: unknown[]) => void): () => void;
  /** Deactivate the overlay (removes its selection boxes/listeners). */
  deactivate(): void;
}

/** Serialize a `__bzEdit.<method>(...)` call for string-eval transports. */
function bzCallJs(method: string, args: unknown[]): string {
  const a = args.map((x) => JSON.stringify(x)).join(", ");
  return `window.__bzEdit && window.__bzEdit.${method}(${a})`;
}

/** Drives the overlay inside the embedded NATIVE webview (Preview) — unchanged
 *  behavior, just behind the transport seam. */
export function webviewTransport(): VisualEditTransport {
  return {
    call: (method, args = []) => void embedBrowserEval(bzCallJs(method, args)).catch(() => {}),
    activate: () => {
      void embedBrowserEval(OVERLAY_JS)
        .then(() => embedBrowserEval("window.__bzEdit && window.__bzEdit.activate()"))
        .catch(() => {});
    },
    subscribe: (onEvents) => {
      let stopped = false;
      let unlisten: UnlistenFn | null = null;
      void listen<string>("bz-edit", (e) => {
        if (stopped) return;
        try {
          const evs = JSON.parse(e.payload);
          if (Array.isArray(evs)) onEvents(evs);
        } catch {
          /* malformed payload — ignore */
        }
      }).then((u) => {
        if (stopped) u();
        else unlisten = u;
      });
      // The overlay buffers events in its queue, so a late `listen` loses nothing.
      const timer = window.setInterval(() => {
        void embedBrowserDrain(DRAIN_JS).catch(() => {});
      }, DRAIN_MS);
      return () => {
        stopped = true;
        window.clearInterval(timer);
        if (unlisten) unlisten();
      };
    },
    deactivate: () =>
      void embedBrowserEval("window.__bzEdit && window.__bzEdit.deactivate()").catch(() => {}),
  };
}

/** The overlay's installed API on a same-origin iframe window (loosely typed — the
 *  overlay is dynamic JS). */
type BzEditWin = Window & {
  __bzEdit?: { q?: unknown[]; [method: string]: unknown };
};

/** Drives the overlay inside a same-origin IFRAME (the design mock) via DIRECT calls —
 *  no eval, so no `unsafe-eval` CSP dependency. `getWin` returns the live
 *  contentWindow (it changes across reloads, so we read it lazily each call). */
export function iframeTransport(getWin: () => Window | null): VisualEditTransport {
  const api = () => (getWin() as BzEditWin | null)?.__bzEdit;
  return {
    call: (method, args = []) => {
      try {
        const fn = api()?.[method];
        if (typeof fn === "function") (fn as (...a: unknown[]) => void)(...args);
      } catch {
        /* iframe navigated / not ready — ignore */
      }
    },
    activate: () => {
      try {
        const fn = api()?.activate;
        if (typeof fn === "function") (fn as () => void)();
      } catch {
        /* not ready — the next activate (on load) covers it */
      }
    },
    subscribe: (onEvents) => {
      let stopped = false;
      const timer = window.setInterval(() => {
        if (stopped) return;
        try {
          const q = api()?.q;
          if (Array.isArray(q) && q.length) onEvents(q.splice(0));
        } catch {
          /* ignore */
        }
      }, DRAIN_MS);
      return () => {
        stopped = true;
        window.clearInterval(timer);
      };
    },
    deactivate: () => {
      try {
        const fn = api()?.deactivate;
        if (typeof fn === "function") (fn as () => void)();
      } catch {
        /* ignore */
      }
    },
  };
}
