// AnnotationSurface builders for the surfaces that don't already have one.
// Preview keeps its "build" surface (preview-pane) and design html keeps
// `designSurface` (design-variants); these add md docs / Map / QA. Each surface
// only declares WHAT the annotations instruct — the AnnotationLayer (Pin / Area /
// Pen + screenshot) is fully shared. Sending routes through sendDesignFeedback.
// The agent prompt text follows the maker's UI locale (DEC-108 · @/lib/prompts).

import { tt } from "@/lib/i18n";
import { docFeedbackPrompt, mapFeedbackPrompt, qaFeedbackPrompt } from "@/lib/prompts";
import type { ImplementSession } from "./implement-session-types";
import type { AnnotationSurface } from "./design-annotations";

/** md document (Spec / 決定 / QA-doc): reflect the annotations into the doc or impl. */
export function docAnnotationSurface(
  session: ImplementSession,
  docPath: string,
  type: string,
  label: string,
): AnnotationSurface {
  return {
    key: `doc:${type}`,
    canSend: true,
    cannotSendMessage: tt("session.noAgent"),
    buildPrompt: (lines, shot) => docFeedbackPrompt(label, docPath, lines, shot),
    send: async (p, n) => (await session.injectToAgent(p)) || session.sendDesignFeedback(p, n),
  };
}

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
    send: async (p, n) => (await session.injectToAgent(p)) || session.sendDesignFeedback(p, n),
  };
}

/** QA table: annotations are remarks on test cases / coverage. */
export function qaAnnotationSurface(session: ImplementSession): AnnotationSurface {
  return {
    key: "qa",
    canSend: true,
    cannotSendMessage: tt("session.noAgent"),
    buildPrompt: (lines, shot) => qaFeedbackPrompt(lines, shot),
    send: async (p, n) => (await session.injectToAgent(p)) || session.sendDesignFeedback(p, n),
  };
}
