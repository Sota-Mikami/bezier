"use client";

// Chrome-style tab navigation, shared by every tab row that wants it (Design
// candidates, the Implement Preview/Diff/Code sub-tabs) — DEC-066.
//
//   ⌘1–8 → tab N      ⌘9 → last (rightmost) tab
//   ⌘⌥→ → next        ⌘⌥← → prev        Ctrl(+Shift)+Tab → next/prev
//
// `active` gates the listener so only the VISIBLE tab row reacts (two rows that
// both use ⌘1–9 never fight). The latest ids/current/onSelect are read through a
// ref, so the window listener is registered once per `active` toggle — no churn
// when the id list changes every render.

import * as React from "react";

export function useTabShortcuts({
  active,
  ids,
  currentId,
  onSelect,
}: {
  active: boolean;
  ids: string[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = React.useRef({ ids, currentId, onSelect });
  React.useEffect(() => {
    ref.current = { ids, currentId, onSelect };
  });

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const { ids, currentId, onSelect } = ref.current;
      const n = ids.length;
      if (!n) return;
      const cycle = (back: boolean) => {
        const cur = ids.indexOf(currentId ?? "");
        const next = ((cur < 0 ? 0 : cur) + (back ? -1 : 1) + n) % n;
        onSelect(ids[next]);
      };
      // ⌘1–8 → tab N ; ⌘9 → last tab (Chrome semantics)
      if (e.metaKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = e.key === "9" ? n - 1 : Number(e.key) - 1;
        if (idx >= 0 && idx < n) {
          e.preventDefault();
          onSelect(ids[idx]);
        }
        return;
      }
      // ⌘⌥→ next / ⌘⌥← prev
      if (e.metaKey && e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        cycle(false);
        return;
      }
      if (e.metaKey && e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        cycle(true);
        return;
      }
      // Ctrl+Tab → next ; Ctrl+Shift+Tab → prev
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        cycle(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
