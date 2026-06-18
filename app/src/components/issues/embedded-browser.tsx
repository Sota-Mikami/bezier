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

import * as React from "react";
import {
  embedBrowserOpen,
  embedBrowserSetBounds,
  embedBrowserNavigate,
  embedBrowserHide,
  embedBrowserClose,
} from "@/lib/ipc";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A native webview paints ABOVE all HTML, so it would cover any modal that opens
// over the pane. Bezier's overlays (⌘K palette, Share, shortcuts, confirm) all
// render role="dialog" — while one is up, hide the embedded browser.
function anyModalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
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

export function EmbeddedBrowser({
  src,
  active,
  reloadKey = 0,
}: {
  /** Full URL (origin + path) the embedded browser should load. */
  src: string;
  /** Browser mode on AND this surface should show it (e.g. not annotating). */
  active: boolean;
  /** Bump to force a navigate (reload button / route change). */
  reloadKey?: number;
}) {
  const slotRef = React.useRef<HTMLDivElement | null>(null);
  const createdRef = React.useRef(false); // add_child has run
  const shownRef = React.useRef(false); // currently visible
  const lastRectRef = React.useRef<Rect | null>(null);
  const disposedRef = React.useRef(false);
  // Latest src in a ref so the mount-keyed observer loop reads it without
  // re-subscribing (same pattern as the terminal's pendingRef / onExitRef).
  const srcRef = React.useRef(src);

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

  // Reconcile the native webview with the slot: open/show/move when visible,
  // hide when not. Cheap to call often — it only hits IPC on a real change.
  const sync = React.useCallback(() => {
    if (disposedRef.current) return;
    const rect = active && !anyModalOpen() ? measure() : null;
    if (rect) {
      if (!createdRef.current) {
        createdRef.current = true;
        shownRef.current = true;
        lastRectRef.current = rect;
        void embedBrowserOpen(
          srcRef.current,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        ).then(() => {
          // Unmounted before the child finished building → don't leak it.
          if (disposedRef.current) void embedBrowserClose().catch(() => {});
        }).catch(() => {});
        return;
      }
      if (!shownRef.current) {
        shownRef.current = true;
        lastRectRef.current = rect;
        void embedBrowserOpen(
          srcRef.current,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        ).catch(() => {});
        return;
      }
      if (!sameRect(rect, lastRectRef.current)) {
        lastRectRef.current = rect;
        void embedBrowserSetBounds(
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        ).catch(() => {});
      }
    } else if (shownRef.current) {
      shownRef.current = false;
      void embedBrowserHide().catch(() => {});
    }
  }, [active]);

  // Observe everything that can move/resize/hide the slot. ResizeObserver
  // catches the pane resizing AND the `hidden` toggle (size → 0); the rest are
  // belt-and-suspenders for scroll, window resize, and ancestor layout flips.
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
    // Modals (role="dialog") render deep in the React tree, so watch the whole
    // body for them — but coalesce the firehose of DOM mutations to one sync per
    // frame so streaming chat/terminal output doesn't thrash.
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
    // Backstop for ancestor display/visibility flips that no observer catches.
    const tick = window.setInterval(sync, 300);
    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      window.clearInterval(tick);
    };
  }, [sync]);

  // Navigate on route/reload changes — but only once the child exists, and never
  // on first mount (add_child already loads `src`, re-navigating would reload it).
  React.useEffect(() => {
    srcRef.current = src;
    if (createdRef.current && !disposedRef.current) {
      void embedBrowserNavigate(src).catch(() => {});
    }
  }, [src, reloadKey]);

  // Destroy the native webview when this surface goes away (issue switch, mode
  // off, unmount). Runs once on unmount.
  React.useEffect(() => {
    return () => {
      disposedRef.current = true;
      void embedBrowserClose().catch(() => {});
    };
  }, []);

  return <div ref={slotRef} className="h-full w-full bg-white" />;
}

export default EmbeddedBrowser;
