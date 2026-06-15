"use client";

// Segment-level error boundary. Catches render/runtime errors inside the route
// so a single broken view does not white-screen the whole app — the sidebar and
// titlebar (rendered by the root layout) stay intact and the user can recover.
//
// Logging is LOCAL ONLY (console + local app log). No external telemetry.
// Next 16 renamed the retry prop `reset` -> `unstable_retry`.

import { useEffect } from "react";

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[bezier] route error:", error);
    // Best-effort: also append to the local Rust log. Never throws in browser dev.
    void import("@/lib/log").then((m) => m.logClientError("route", error));
  }, [error]);

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="max-w-md space-y-4 rounded-lg border bg-background p-6 text-center shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          この画面でエラーが発生しました
        </h2>
        <p className="text-sm text-muted-foreground">
          作業内容は失われていない可能性があります。まず「再試行」を、直らなければ「リロード」をお試しください。
        </p>
        {error?.digest ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            digest: {error.digest}
          </p>
        ) : null}
        <div className="flex justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            再試行
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            リロード
          </button>
        </div>
      </div>
    </div>
  );
}
