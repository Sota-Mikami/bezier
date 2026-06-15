"use client";

// User-curated ordering for auto-discovered lists (Docs, Design variants).
// The list itself comes from the filesystem (polling); this layers a manual
// order on top, persisted per key in localStorage. Items not yet in the saved
// order keep their natural (discovery) position at the end — so newly created
// docs/variants just appear last until the user moves them.
//
// Persistence is per-machine (localStorage). Making the order travel with the
// issue (a small order file / the BEZIER.md index) is a deliberate follow-up.

import * as React from "react";

function loadOrder(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useOrdered<T>(
  storageKey: string,
  items: T[],
  getId: (t: T) => string,
): { ordered: T[]; setOrder: (ids: string[]) => void } {
  // Lazy-load on mount; reload on key change via render-time detection (React's
  // "adjust state when a prop changes" pattern) — no setState-in-effect.
  const [order, setOrder] = React.useState<string[]>(() => loadOrder(storageKey));
  const [lastKey, setLastKey] = React.useState(storageKey);
  if (storageKey !== lastKey) {
    setLastKey(storageKey);
    setOrder(loadOrder(storageKey));
  }

  const save = React.useCallback(
    (ids: string[]) => {
      setOrder(ids);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(ids));
      } catch {
        // private mode / quota — order just won't persist.
      }
    },
    [storageKey],
  );

  const ordered = React.useMemo(() => {
    const pos = new Map(order.map((id, i) => [id, i]));
    return items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const ap = pos.get(getId(a.item));
        const bp = pos.get(getId(b.item));
        if (ap != null && bp != null) return ap - bp;
        if (ap != null) return -1; // saved items lead unsaved ones
        if (bp != null) return 1;
        return a.i - b.i; // both unsaved → discovery order
      })
      .map((x) => x.item);
  }, [items, order, getId]);

  return { ordered, setOrder: save };
}

/** Per-item props for native HTML5 drag-to-reorder. Spread onto each tab. */
export function useDragReorder(
  orderedIds: string[],
  onReorder: (ids: string[]) => void,
) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  return React.useCallback(
    (id: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragId || dragId === id) {
          setDragId(null);
          return;
        }
        const ids = orderedIds.filter((x) => x !== dragId);
        const at = ids.indexOf(id);
        ids.splice(at < 0 ? ids.length : at, 0, dragId);
        onReorder(ids);
        setDragId(null);
      },
      onDragEnd: () => setDragId(null),
      "data-dragging": dragId === id ? "" : undefined,
    }),
    [orderedIds, onReorder, dragId],
  );
}
