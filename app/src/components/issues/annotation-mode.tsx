"use client";

// Global annotation MODE — a cross-cutting toggle (not a destination). When ON,
// the currently-shown center surface (md doc / html design / Preview / Map / QA)
// renders the shared AnnotationLayer, so you point (Pin / Area / Pen) and the
// agent gets a fix request. When OFF, surfaces are interactive (edit / navigate).
// Toggled by the header button or ⌘⇧A. Lives in context so the one toggle reaches
// every surface across the Design and Prototype areas without prop-drilling.

import * as React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnnotationMode {
  on: boolean;
  toggle: () => void;
  set: (b: boolean) => void;
}

const Ctx = React.createContext<AnnotationMode | null>(null);

export function AnnotationModeProvider({ children }: { children: React.ReactNode }) {
  const [on, setOn] = React.useState(false);

  // ⌘⇧A toggles globally (matched via e.code so Shift's remapping is irrelevant).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && e.code === "KeyA") {
        e.preventDefault();
        setOn((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo<AnnotationMode>(
    () => ({ on, toggle: () => setOn((v) => !v), set: setOn }),
    [on],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the global annotation mode. Safe to call outside a provider (returns off). */
export function useAnnotationMode(): AnnotationMode {
  return React.useContext(Ctx) ?? { on: false, toggle: () => {}, set: () => {} };
}

/** Header toggle for the global annotation mode. */
export function AnnotationToggle() {
  const { on, toggle } = useAnnotationMode();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="注釈モード ・ ⌘⇧A（Pin / Area / Pen で agent へ修正依頼）"
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Pencil className="size-3.5" />
      注釈
    </button>
  );
}
