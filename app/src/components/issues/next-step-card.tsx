"use client";

// "Next step" card — surfaces the AI's guidance, which was otherwise invisible (the
// agent's suggested next move was buried in terminal scroll, so the "orchestrator that
// guides you" never showed). The agent writes its ONE next move to <issue.dir>/next-step
// (loopBlock); Bezier polls it and shows it above the chat with a one-click "Proceed"
// that sends it back to the agent to continue the loop. First-cut to judge the UX.

import * as React from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";

import { readFile } from "@/lib/ipc";
import { useT, tt } from "@/lib/i18n";
import type { ImplementSession } from "./implement-session-types";

export function NextStepCard({ session }: { session: ImplementSession }) {
  const t = useT();
  const dir = session.issue.dir;
  const [suggestion, setSuggestion] = React.useState("");
  const [dismissed, setDismissed] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void readFile(`${dir}/next-step`)
        .then((txt) => {
          if (cancelled) return;
          const line =
            (txt || "")
              .split("\n")
              .map((l) => l.trim().replace(/^[-*▸•]\s*/, ""))
              .find((l) => l.length > 0) ?? "";
          setSuggestion(line);
        })
        .catch(() => {
          if (!cancelled) setSuggestion("");
        });
    };
    refresh();
    const h = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [dir]);

  // (Dismiss state resets naturally — the parent keys this component by issue dir.)
  if (!suggestion || suggestion === dismissed || !session.ref) return null;

  const proceed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Inject into the RUNNING chat (prefill), never restart the agent — the
      // no-restart seam (DEC-142). injectOrFeedback falls back to a fresh feedback
      // turn only when no agent is live.
      await session.injectOrFeedback(
        tt("nextStep.proceedPrompt", { suggestion }),
        tt("nextStep.note"),
      );
      setDismissed(suggestion); // hide until the agent writes a new one
    } catch {
      /* surfaced via session.error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 items-start gap-2 border-b bg-primary/5 px-3 py-2">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-primary/70">
          {t("nextStep.label")}
        </div>
        <div className="text-xs text-foreground">{suggestion}</div>
      </div>
      <button
        type="button"
        onClick={() => void proceed()}
        disabled={busy}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {t("nextStep.proceed")}
        <ArrowRight className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => setDismissed(suggestion)}
        aria-label={t("nextStep.dismiss")}
        title={t("nextStep.dismiss")}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
