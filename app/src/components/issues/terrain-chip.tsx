"use client";

// The maker's "今ここ" orientation chip (E-4 terrain) — a compact, read-only summary
// of what THIS issue has right now (Spec · N designs · implementing · shared · PR).
// Reversible facts, not a completion gate (CEO: "there is no 'Spec done' state").
// Mirrors the same terrain the agent is seeded with (loop-state), so maker and agent
// share one picture of where things stand. Polls quietly while the issue is open.

import * as React from "react";
import { MapPin } from "lucide-react";

import { gatherTerrain, describeTerrain, type LoopTerrain } from "@/lib/loop-state";
import { useT } from "@/lib/i18n";
import type { Issue } from "@/lib/issues";

export function TerrainChip({ root, issue }: { root: string; issue: Issue }) {
  const t = useT();
  const [terrain, setTerrain] = React.useState<LoopTerrain | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void gatherTerrain(root, issue)
        .then((x) => {
          if (!cancelled) setTerrain(x);
        })
        .catch(() => {});
    };
    refresh();
    const h = window.setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [root, issue]);

  // Nothing yet (fresh issue) → don't add chrome; the empty state speaks for itself.
  if (!terrain || terrain.isEmpty) return null;

  return (
    <span
      className="hidden min-w-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-foreground/80 sm:inline-flex"
      title={t("terrain.tooltip")}
    >
      <MapPin className="size-3 shrink-0 text-primary/70" aria-hidden />
      <span className="text-muted-foreground">{t("terrain.label")}:</span>
      <span className="truncate">{describeTerrain(terrain)}</span>
    </span>
  );
}
