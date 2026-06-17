"use client";

// The "design" annotation surface (DEC-056): pins/pen/rect on a wireframe become
// a REVISE request for THAT design/NN.html — never code, never another file. The
// standalone DesignVariants tab this once lived in was superseded by the merged
// Document View (issue-design.tsx); only this surface helper remains in use.
// DF-2/DF-5: html is a free visual artifact (no per-variant "adopt"); you
// implement a direction from chat, and choose what to share per issue.

import { tt } from "@/lib/i18n";
import { designRevisePrompt } from "@/lib/prompts";
import type { Variant } from "@/lib/variants";
import type { AnnotationSurface } from "./design-annotations";
import type { ImplementSession } from "./implement-session-types";

export function designSurface(
  session: ImplementSession,
  pattern: Variant,
  agentAvailable: boolean,
  revise: (promptText: string, note: string) => Promise<void>,
): AnnotationSurface {
  return {
    key: `design:${pattern.id}`,
    canSend: agentAvailable,
    cannotSendMessage: tt("designVariants.noAgent"),
    buildPrompt: (lines, shot) =>
      designRevisePrompt(
        pattern.id,
        `${session.issue.dir}/design/${pattern.file}`,
        lines,
        shot,
      ),
    // The variant path doesn't gate on a live agent, so it always "sends" (true).
    send: (p, n) =>
      revise(p, tt("designVariants.reviseNote", { id: pattern.id, note: n })).then(
        () => true,
      ),
  };
}
