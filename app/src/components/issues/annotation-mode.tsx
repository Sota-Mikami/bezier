"use client";

// Global annotation MODE — a cross-cutting toggle (not a destination). When ON,
// the currently-shown center surface (md doc / html design / Preview / Map / QA)
// renders the shared AnnotationLayer, so you point (Pin / Area / Pen) and the
// agent gets a fix request. When OFF, surfaces are interactive (edit / navigate).
// Toggled by the header button or ⌘⇧A. Lives in context so the one toggle reaches
// every surface across the Design and Prototype areas without prop-drilling.

import * as React from "react";
import { Pencil } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface AnnotationMode {
  on: boolean;
  toggle: () => void;
  set: (b: boolean) => void;
  /** True while another mode (Preview's Edit mode) owns the surface. When locked,
   *  annotate can't be turned ON (toggle/⌘⇧A no-op) — Edit & Annotate are mutually
   *  exclusive (DEC-131): annotate freezes the webview to a screenshot, Edit needs
   *  it live, so they can't coexist. */
  locked: boolean;
  setLocked: (b: boolean) => void;
}

const Ctx = React.createContext<AnnotationMode | null>(null);

export function AnnotationModeProvider({ children }: { children: React.ReactNode }) {
  const [on, setOn] = React.useState(false);
  const [locked, setLockedState] = React.useState(false);
  // Ref so the mount-once keydown handler reads the latest lock without re-subscribing.
  const lockedRef = React.useRef(locked);
  React.useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // ⌘⇧A toggles globally (matched via e.code so Shift's remapping is irrelevant).
  // No-op while locked (Edit mode active).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && e.code === "KeyA") {
        e.preventDefault();
        if (lockedRef.current) return;
        setOn((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo<AnnotationMode>(
    () => ({
      on,
      // Can't enable annotate while locked; disabling is always allowed.
      toggle: () => setOn((v) => (lockedRef.current ? false : !v)),
      set: (b) => setOn(b && lockedRef.current ? false : b),
      locked,
      // Entering a locking mode (Edit) force-clears annotate so they never coexist.
      setLocked: (b) => {
        setLockedState(b);
        if (b) setOn(false);
      },
    }),
    [on, locked],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the global annotation mode. Safe to call outside a provider (returns off). */
export function useAnnotationMode(): AnnotationMode {
  return (
    React.useContext(Ctx) ?? {
      on: false,
      toggle: () => {},
      set: () => {},
      locked: false,
      setLocked: () => {},
    }
  );
}

/** Header toggle for the global annotation mode. Disabled while Edit mode owns the
 *  surface (DEC-131) — annotate and Edit can't run at once. */
export function AnnotationToggle() {
  const { on, toggle, locked } = useAnnotationMode();
  const t = useT();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      disabled={locked}
      title={locked ? t("topbar.annotateLocked") : t("topbar.annotateTitle")}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <Pencil className="size-3.5" />
      {t("topbar.annotate")}
    </button>
  );
}
