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
  /** Serialize the edited DOM back to an html string (mock/iframe only — the webview
   *  edits live code via the agent, so it doesn't implement this). Empty on failure. */
  serialize?(): Promise<string>;
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

/** Drives the overlay inside an OPAQUE IFRAME (the design mock) over postMessage — the
 *  iframe is sandboxed `allow-scripts` with NO `allow-same-origin` (the WKWebView-robust
 *  isolation the VIEW iframe uses), so we can't touch `contentWindow.__bzEdit` directly.
 *  The in-iframe bridge (mock-edit `BRIDGE_JS`) relays calls/events/serialize both ways.
 *  `getWin` returns the live contentWindow (changes across reloads, read lazily). */
export function iframeTransport(getWin: () => Window | null): VisualEditTransport {
  const post = (msg: unknown) => {
    try {
      getWin()?.postMessage(msg, "*");
    } catch {
      /* iframe navigated / not ready — ignore */
    }
  };
  return {
    call: (method, args = []) => post({ __bz: "call", method, args }),
    activate: () => post({ __bz: "call", method: "activate", args: [] }),
    subscribe: (onEvents) => {
      const onMsg = (e: MessageEvent) => {
        if (e.source !== getWin()) return; // only our iframe
        const d = e.data as { __bz?: string; events?: unknown[] };
        if (d && d.__bz === "events" && Array.isArray(d.events)) onEvents(d.events);
      };
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    },
    deactivate: () => post({ __bz: "call", method: "deactivate", args: [] }),
    serialize: () =>
      new Promise<string>((resolve) => {
        let done = false;
        const finish = (html: string) => {
          if (done) return;
          done = true;
          window.removeEventListener("message", onMsg);
          window.clearTimeout(timer);
          resolve(html);
        };
        const onMsg = (e: MessageEvent) => {
          if (e.source !== getWin()) return;
          const d = e.data as { __bz?: string; html?: string };
          if (d && d.__bz === "html" && typeof d.html === "string") finish(d.html);
        };
        window.addEventListener("message", onMsg);
        // The bridge deactivates the overlay then posts the serialized DOM back.
        post({ __bz: "serialize" });
        const timer = window.setTimeout(() => finish(""), 2000);
      }),
  };
}
