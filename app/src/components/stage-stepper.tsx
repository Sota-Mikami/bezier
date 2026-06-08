import { Check } from "lucide-react";
import { STAGES, type Stage } from "@/lib/data";
import { cn } from "@/lib/utils";

// Spec駆動ループの可視化: Intent→Spec→Design→Mock→QA→Handoff。
// Mock の発散/収束が Spec(確定) にフィードバックする様子を控えめに示す。
export function StageStepper({
  current,
  className,
}: {
  current: Stage;
  className?: string;
}) {
  const curIdx = STAGES.indexOf(current);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {STAGES.map((s, i) => {
        const done = i < curIdx;
        const active = i === curIdx;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
                active && "border-foreground bg-foreground text-background font-medium",
                done && "border-border bg-muted text-muted-foreground",
                !active && !done && "border-dashed border-border text-muted-foreground/70"
              )}
            >
              <span
                className={cn(
                  "flex size-3.5 items-center justify-center rounded-full text-[9px]",
                  done && "bg-muted-foreground/30 text-foreground",
                  active && "bg-background/20"
                )}
              >
                {done ? <Check className="size-2.5" /> : i + 1}
              </span>
              {s}
            </div>
            {i < STAGES.length - 1 && (
              <span className="text-muted-foreground/40 text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
