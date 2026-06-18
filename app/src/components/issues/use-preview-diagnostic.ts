"use client";

// Preview self-diagnosis (DEC-125). After the dev server is "ready", the preview
// can still be a silent blank — the app 404s at `/`, is auth-gated, errors, or
// returns no HTML. Connectivity (`httpPing`) can't tell these apart (any status =
// "up"). This hook GETs the ACTUALLY-loaded URL and produces a verdict so the pane
// can explain it instead of blanking. Re-probes ride the embedded browser's
// onNavigate signal (DEC-121) — no extra polling loop.
//
// SCOPE: server-observable only, and SESSIONLESS — the probe is a raw server GET
// with no login cookie, so it can't see the user's authenticated view. It is a
// STARTUP SMOKE TEST: it explains an initial blank/error, re-probes slowly to clear
// a transient/stale one, and the moment a probe sees a good page it SETTLES and goes
// dormant — otherwise it would keep false-flagging an auth-gated app the moment the
// user logs in (DEC-127 follow-up). A client-rendered SPA that 200s then blanks from
// a JS error is also invisible here (see verdictFor in lib/preview).

import * as React from "react";

import { httpProbe, verdictFor, type PreviewVerdict } from "@/lib/preview";

export interface PreviewDiagnostic {
  verdict: PreviewVerdict | null;
  /** Last probed HTTP status (for the message). */
  status: number | null;
  /** Wire to EmbeddedBrowser.onNavigate — re-probes the page the webview shows. */
  onNavigate: (url: string) => void;
  /** Hide the banner for the current page until the user navigates elsewhere. */
  dismiss: () => void;
}

export function usePreviewDiagnostic({
  ready,
  baseUrl,
  src,
}: {
  /** status === "ready" && a url is set (web runner). */
  ready: boolean;
  /** The dev-server origin (server.url) — gates probing to same-origin pages. */
  baseUrl: string | null;
  /** The current target URL (origin + path) — seeds the initial probe. */
  src: string | null;
}): PreviewDiagnostic {
  const [verdict, setVerdict] = React.useState<PreviewVerdict | null>(null);
  const [status, setStatus] = React.useState<number | null>(null);
  const dismissedUrlRef = React.useRef<string | null>(null);
  const lastUrlRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const seqRef = React.useRef(0); // supersede in-flight probes / cancellations
  // Once a probe sees a good page, the smoke test passes → go dormant (the
  // sessionless probe can't judge the app once the user logs in). Reset per ready.
  const settledRef = React.useRef(false);

  // Dev-server origin; external pages (OAuth bounce) aren't ours to diagnose.
  const baseOrigin = React.useMemo(() => {
    if (!baseUrl) return null;
    try {
      return new URL(baseUrl).origin;
    } catch {
      return null;
    }
  }, [baseUrl]);

  const runProbe = React.useCallback(async (url: string) => {
    if (settledRef.current) return; // smoke test already passed → dormant
    const seq = ++seqRef.current;
    const res = await httpProbe(url);
    if (seq !== seqRef.current) return; // superseded by a newer nav / cancel
    lastUrlRef.current = url;
    if (!res) return; // transient failure → keep the current verdict (no flap)
    // Moving to a different page clears a prior dismissal.
    if (url !== dismissedUrlRef.current) dismissedUrlRef.current = null;
    const v = verdictFor(res);
    if (!v) {
      // Good page (200 HTML / redirect): the smoke test passed. Settle + go
      // dormant so we never re-flag this (possibly auth-gated) app once the user
      // is past the entry — the sessionless probe can't judge it from here on.
      settledRef.current = true;
      setVerdict(null);
      setStatus(res.status);
      return;
    }
    if (url === dismissedUrlRef.current) return; // user dismissed this page
    setVerdict(v);
    setStatus(res.status);
  }, []);

  const request = React.useCallback(
    (url: string, debounceMs: number) => {
      if (settledRef.current) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runProbe(url);
      }, debounceMs);
    },
    [runProbe],
  );

  // Reset everything when the server stops being ready (start / stop / restart) —
  // done in cleanup (not a sync effect body) so a stale verdict can't linger and a
  // fresh start re-probes clean.
  React.useEffect(() => {
    if (!ready) return;
    return () => {
      // A stale in-flight probe resolving after this is harmless: consumers gate
      // on `ready`, and the next ready session's initial probe bumps seqRef and
      // supersedes it.
      dismissedUrlRef.current = null;
      lastUrlRef.current = null;
      settledRef.current = false; // fresh start → run the smoke test again
      setVerdict(null);
      setStatus(null);
    };
  }, [ready]);

  // Probe the landing URL immediately on ready (catches a landing 404 fast, e.g.
  // an auth-gated app whose `/` is a 404). onNavigate re-probes once the webview
  // reports its real URL (and on every later navigation).
  React.useEffect(() => {
    if (ready && src) request(src, 0);
  }, [ready, src, request]);

  // Slow re-probe until the smoke test passes: clears a stale/transient error once
  // the page recovers (e.g. a startup 500 during recompile that the URL-change
  // signal alone would miss). Stops the moment a probe settles (good page).
  React.useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      if (settledRef.current) return;
      const u = lastUrlRef.current ?? src;
      if (u) void runProbe(u);
    }, 2500);
    return () => window.clearInterval(id);
  }, [ready, src, runProbe]);

  const onNavigate = React.useCallback(
    (rawUrl: string) => {
      if (!baseOrigin) return;
      let origin: string;
      try {
        origin = new URL(rawUrl).origin;
      } catch {
        return;
      }
      if (origin !== baseOrigin) {
        // External page (OAuth) — nothing to diagnose; drop any stale verdict.
        seqRef.current++;
        setVerdict(null);
        setStatus(null);
        return;
      }
      request(rawUrl, 400); // debounce collapses a redirect burst to the final URL
    },
    [baseOrigin, request],
  );

  const dismiss = React.useCallback(() => {
    seqRef.current++;
    dismissedUrlRef.current = lastUrlRef.current;
    setVerdict(null);
  }, []);

  React.useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { verdict, status, onNavigate, dismiss };
}
