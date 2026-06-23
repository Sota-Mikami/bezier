// AnnotationSurface builders for Map / QA. (Preview keeps its "build" surface in
// preview-pane; design html keeps `designSurface` in design-variants; md docs use
// text-selection comments, not Pin/Pen.) Each surface only declares WHAT the
// annotations instruct — the AnnotationLayer (Pin / Area / Pen + screenshot) is fully
// shared. Sending routes through session.injectOrFeedback (inject into the running
// agent, fall back to a fresh turn). Prompt text follows the maker's UI locale.

import { tt } from "@/lib/i18n";
import { mapFeedbackPrompt, qaFeedbackPrompt } from "@/lib/prompts";
import type { ImplementSession } from "./implement-session-types";
import type { AnnotationSurface } from "./design-annotations";

/** Map (bird's-eye): annotations target the scoped screens of the real app. */
export function mapAnnotationSurface(
  session: ImplementSession,
  routes: string[],
): AnnotationSurface {
  return {
    key: "map",
    canSend: !!session.ref,
    cannotSendMessage: tt("map.needWorktree"),
    buildPrompt: (lines, shot) => mapFeedbackPrompt(routes, lines, shot),
    send: (p, n) => session.injectOrFeedback(p, n),
  };
}

/** QA table: annotations are remarks on test cases / coverage. */
export function qaAnnotationSurface(session: ImplementSession): AnnotationSurface {
  return {
    key: "qa",
    canSend: true,
    cannotSendMessage: tt("session.noAgent"),
    buildPrompt: (lines, shot) => qaFeedbackPrompt(lines, shot),
    send: (p, n) => session.injectOrFeedback(p, n),
  };
}
