import * as React from "react";
import { cn } from "@/lib/utils";

// A keyboard key cap (DEC-073). `data-slot="kbd"` lets the Tooltip styling pick
// it up. Outlined in the CURRENT text color so it reads on both a light surface
// (the shortcuts dialog) and the dark tooltip popup.
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-current/30 px-1 font-sans text-[11px] leading-none opacity-90",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Render a shortcut (array of key tokens) as a row of Kbd caps. */
export function KbdKeys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}

export default Kbd;
