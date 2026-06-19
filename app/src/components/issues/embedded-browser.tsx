"use client";

// Embedded browser (DEC-120 — cmux-style). Instead of an <iframe> (a sandboxed,
// cross-origin, storage-partitioned frame that can't run OAuth), this pins a
// NATIVE child webview into the pane. Because it's a first-party, top-level
// browser, Google/Facebook login completes inline and the session persists —
// the maker logs in and uses the app here while watching the agent chat.
//
// A native webview is NOT a DOM node: it ignores CSS (display:none, z-index,
// overflow). So this component renders a placeholder "slot" and continuously
// mirrors that slot's on-screen rect to the real webview (Rust set_bounds), and
// HIDES the webview whenever the slot isn't actually visible (tab switched to
// Map/QA → the ancestor gets `hidden`; annotation/Design → `active` goes false).
//
// Overlays (dialogs/dropdowns) also can't be drawn over a native webview. Rather
// than blanking the pane to white (which looks like a bug), when an overlay
// overlaps the browser we FREEZE it to a screenshot and show that still — so the
// modal/dropdown appears over what looks like the live browser. It un-freezes
// (shows the live webview again) when the overlay closes.

import * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  embedBrowserOpen,
  embedBrowserSetBounds,
  embedBrowserNavigate,
  embedBrowserUrl,
  embedBrowserHide,
  embedBrowserClose,
  captureRegion,
} from "@/lib/ipc";
import { loadImageDataUrl } from "@/lib/annotations";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A native webview paints ABOVE all HTML, so it covers any overlay drawn over
// the pane. Dialogs (⌘K palette, Share, shortcuts, confirm) are role="dialog";
// dropdowns/menus (Ship ▾, Title ▾, base-ui Menu) are role="menu"; selects are
// role="listbox". React only when such an overlay actually OVERLAPS the browser
// rect — so an unrelated menu elsewhere (e.g. top-left Title ▾) is ignored.
// (base-ui portals these only while open, so presence ≈ open.)
function overlayOverlaps(rect: Rect): boolean {
  const els = document.querySelectorAll(
    '[role="dialog"], [role="menu"], [role="listbox"]',
  );
  for (const el of els) {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (
      r.left < rect.x + rect.width &&
      r.right > rect.x &&
      r.top < rect.y + rect.height &&
      r.bottom > rect.y
    ) {
      return true;
    }
  }
  return false;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  // Sub-pixel jitter from layout → round to whole px before comparing.
  return (
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

// Screenshot the slot (the live webview sits there) to a data URL for the freeze.
// capture_region only writes inside a granted `.bezier` store, so the caller
// passes such a dir. Returns null on any failure (→ caller falls back to hide).
async function captureSlot(rect: Rect, dir: string): Promise<string | null> {
  try {
    const win = getCurrentWindow();
    const pos = await win.innerPosition();
    const scale = await win.scaleFactor();
    const path = await captureRegion(
      pos.x / scale + rect.x,
      pos.y / scale + rect.y,
      rect.width,
      rect.height,
      `${dir.replace(/\/+$/, "")}/embed-freeze.png`,
    );
    return await loadImageDataUrl(path);
  } catch {
    return null;
  }
}

// --- Native-webview singleton coordinator (PE P0-2, DEC-130) ------------------
// The Rust webview labelled "embedded-browser" is ONE global object, but several
// EmbeddedBrowser React instances can be mounted at once — Live stays mounted but
// hidden behind an open issue's Preview (issues/page.tsx). Without coordination they
// (a) show each other's page (open() reuses the existing webview WITHOUT navigating,
// so the second instance inherits the first's URL) and (b) either one's unmount
// embedBrowserClose()s it from under the other. So: track mounted instances + which
// one currently OWNS (drives) the webview. An instance that takes over a webview
// another built navigates it to its own src; we only CLOSE on the LAST unmount —
// otherwise hide it and let whoever remains adopt the live (session-intact) webview.
// In the common single-instance case this is identical to the old behavior (owner is
// always self → never re-navigates → OAuth session preserved; last-out → close).
const embedInstances = new Set<string>();
let embedOwner: string | null = null;

export function EmbeddedBrowser({
  src,
  active,
  reloadKey = 0,
  captureDir,
  onNavigate,
}: {
  /** Full URL (origin + path) the embedded browser should load. */
  src: string;
  /** Browser mode on AND this surface should show it (e.g. not annotating). */
  active: boolean;
  /** Bump to force a navigate (reload button / route submit). */
  reloadKey?: number;
  /** A granted `.bezier` dir to write the freeze screenshot into. Without it,
   *  an overlapping overlay falls back to hiding the browser (blank). */
  captureDir?: string;
  /** Called (full URL) whenever the page navigates ITSELF — links, redirects,
   *  OAuth return, SPA pushState — so the caller can sync its address bar. */
  onNavigate?: (url: string) => void;
}) {
  // Stable per-instance identity for the singleton coordinator (PE P0-2). useId is
  // hook-legal during render (unlike reading a ref) and unique per mounted instance.
  const instanceId = React.useId();
  const slotRef = React.useRef<HTMLDivElement | null>(null);
  const createdRef = React.useRef(false); // add_child has run
  const shownRef = React.useRef(false); // webview currently visible
  const lastRectRef = React.useRef<Rect | null>(null);
  const disposedRef = React.useRef(false);
  const capturingRef = React.useRef(false);
  // Last URL reported to onNavigate (dedupe the poll) + the latest callback in a
  // ref so the mount-keyed observer loop reads it without re-subscribing.
  const lastUrlRef = React.useRef<string | null>(null);
  const onNavigateRef = React.useRef(onNavigate);
  React.useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);
  // Freeze still shown while an overlay overlaps (ref mirrors state so the
  // mount-keyed sync loop reads the latest synchronously).
  const [freeze, setFreeze] = React.useState<string | null>(null);
  const freezeRef = React.useRef<string | null>(null);
  const setFreezeBoth = (v: string | null) => {
    freezeRef.current = v;
    setFreeze(v);
  };
  // Latest src in a ref so the mount-keyed observer loop reads it without
  // re-subscribing (same pattern as the terminal's pendingRef / onExitRef).
  const srcRef = React.useRef(src);

  const hideWebview = () => {
    if (shownRef.current) {
      shownRef.current = false;
      void embedBrowserHide().catch(() => {});
    }
  };

  // True only when the slot actually occupies screen space. offsetParent is null
  // under display:none (the `hidden` toggle when Map/QA is shown), and a 0-area
  // rect means collapsed — either way the native webview must be hidden.
  const measure = (): Rect | null => {
    const el = slotRef.current;
    if (!el || el.offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };

  // Reconcile the native webview + freeze still with the slot. Three outcomes:
  // pane not visible → hide (no still); overlay overlaps → freeze (still shown,
  // webview hidden); else → live (webview shown, still cleared). Cheap to call
  // often — it only hits IPC / capture on a real transition.
  const sync = React.useCallback(() => {
    if (disposedRef.current) return;
    const m = active ? measure() : null;

    // Pane not visible (Map/QA/Design/collapsed) → hide; drop any freeze.
    if (!m) {
      hideWebview();
      if (freezeRef.current) setFreezeBoth(null);
      return;
    }

    // An overlay overlaps the browser → show a frozen still instead of blanking.
    if (overlayOverlaps(m)) {
      if (freezeRef.current) return; // already frozen
      if (!createdRef.current || !captureDir) {
        // Nothing to capture (webview never shown, or no .bezier dir) → hide.
        hideWebview();
        return;
      }
      if (capturingRef.current) return; // capture in flight — keep webview live
      capturingRef.current = true;
      void captureSlot(m, captureDir).then((url) => {
        capturingRef.current = false;
        if (disposedRef.current) return;
        const mm = active ? measure() : null;
        const stillOverlapped = !!mm && overlayOverlaps(mm);
        if (url && stillOverlapped) {
          setFreezeBoth(url); // show the still, then hide the live webview
          hideWebview();
        } else if (stillOverlapped) {
          hideWebview(); // capture failed → fall back to blank-hide
        }
        // overlay already gone → leave the live webview as-is (next sync fixes bounds)
      });
      return;
    }

    // Visible & unobstructed → live webview; clear any freeze.
    if (freezeRef.current) setFreezeBoth(null);
    const rect = m;
    if (!createdRef.current) {
      createdRef.current = true;
      shownRef.current = true;
      lastRectRef.current = rect;
      // Adopting a webview ANOTHER instance built (it shows that instance's page)?
      // Then point it at OUR src after revealing it. If embedOwner is null we're the
      // first/only one → open() builds it with our src, no navigate needed.
      const adopting = embedOwner !== null && embedOwner !== instanceId;
      embedOwner = instanceId;
      void embedBrowserOpen(srcRef.current, rect.x, rect.y, rect.width, rect.height)
        .then(() => {
          if (disposedRef.current) {
            if (embedInstances.size === 0) void embedBrowserClose().catch(() => {});
            return;
          }
          if (adopting) void embedBrowserNavigate(srcRef.current).catch(() => {});
        })
        .catch(() => {});
      return;
    }
    if (!shownRef.current) {
      shownRef.current = true;
      lastRectRef.current = rect;
      // Re-showing after a hide. If another instance drove the webview while we were
      // hidden (embedOwner changed), it now shows their page → navigate back to ours.
      // If we're still the owner, DON'T navigate (preserve our live/OAuth session).
      const adopting = embedOwner !== instanceId;
      embedOwner = instanceId;
      void embedBrowserOpen(srcRef.current, rect.x, rect.y, rect.width, rect.height)
        .then(() => {
          if (adopting && !disposedRef.current) {
            void embedBrowserNavigate(srcRef.current).catch(() => {});
          }
        })
        .catch(() => {});
      return;
    }
    if (!sameRect(rect, lastRectRef.current)) {
      lastRectRef.current = rect;
      void embedBrowserSetBounds(rect.x, rect.y, rect.width, rect.height).catch(() => {});
    }
  }, [active, captureDir, instanceId]);

  // Observe everything that can move/resize/hide the slot or open an overlay.
  // ResizeObserver catches pane resize + the `hidden` toggle (size → 0); the
  // MutationObserver catches overlays mounting deep in the React tree (coalesced
  // to one sync per frame so streaming chat/terminal output doesn't thrash).
  React.useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    sync();
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    const io = new IntersectionObserver(() => sync());
    io.observe(el);
    const onWin = () => sync();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    const tick = window.setInterval(sync, 300);
    // Poll the webview's actual URL (separate, slower cadence than sync — sync
    // fires on every DOM mutation) and report changes so the address bar tracks
    // where the page went on its own. Only while the live webview is shown.
    const urlTick = window.setInterval(() => {
      if (!createdRef.current || disposedRef.current || !shownRef.current) return;
      void embedBrowserUrl()
        .then((u) => {
          if (!u || disposedRef.current || u === lastUrlRef.current) return;
          lastUrlRef.current = u;
          onNavigateRef.current?.(u);
        })
        .catch(() => {});
    }, 300);
    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      window.clearInterval(tick);
      window.clearInterval(urlTick);
    };
  }, [sync]);

  // Keep the latest target URL in a ref (used by open + reload-driven navigate).
  // NOTE: a `src` change alone must NOT navigate — the address-bar sync updates
  // `src` from the page's OWN navigation (onNavigate → caller setPath), so
  // re-navigating here would bounce the webview back / loop.
  React.useEffect(() => {
    srcRef.current = src;
  }, [src]);

  // Navigate ONLY on an explicit reload/route-submit (reloadKey bump from the
  // address bar's submit or the reload button). Skip the initial mount —
  // add_child already loaded `src`.
  const mountedReloadRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedReloadRef.current) {
      mountedReloadRef.current = true;
      return;
    }
    if (createdRef.current && !disposedRef.current) {
      lastUrlRef.current = null; // force the next poll to re-report the new page
      void embedBrowserNavigate(srcRef.current).catch(() => {});
    }
  }, [reloadKey]);

  // Register with the singleton coordinator on mount; on unmount, destroy the native
  // webview only when we're the LAST instance (PE P0-2). If another instance remains
  // (e.g. Live behind a closing issue's Preview), just hide it — that instance adopts
  // the live webview on its next sync instead of cold-reloading. Runs once.
  React.useEffect(() => {
    embedInstances.add(instanceId);
    return () => {
      disposedRef.current = true;
      embedInstances.delete(instanceId);
      if (embedOwner === instanceId) embedOwner = null;
      if (embedInstances.size === 0) {
        void embedBrowserClose().catch(() => {});
      } else {
        void embedBrowserHide().catch(() => {});
      }
    };
  }, [instanceId]);

  return (
    <div ref={slotRef} className="h-full w-full bg-white">
      {freeze && (
        // eslint-disable-next-line @next/next/no-img-element -- local data: URL freeze in a Tauri webview; next/image doesn't apply
        <img
          src={freeze}
          alt=""
          aria-hidden
          className="pointer-events-none h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export default EmbeddedBrowser;
