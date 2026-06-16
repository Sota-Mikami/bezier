"use client";

// Detect a repo's setup story for the Phase 3 handoff card (DEC-111). Runs
// regardless of readiness so the "set it up yourself" escape hatch is available
// even when the repo is already runnable.

import * as React from "react";

import { detectSetup, type SetupSignals } from "@/lib/readiness";

export function useSetupSignals(root: string, packageDir: string): SetupSignals | null {
  const [signals, setSignals] = React.useState<SetupSignals | null>(null);

  // cancelled-guard; setState only in the async continuation (no synchronous
  // effect setState), mirroring useReadiness.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await detectSetup(root, packageDir).catch(() => null);
      if (cancelled) return;
      setSignals(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [root, packageDir]);

  return signals;
}
