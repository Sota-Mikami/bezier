"use client";

// The CENTER "Implement" tab — the live worktree app, via Preview only.
//
// Diff and Code were removed: a raw text diff and a code browser are commodities
// that GitHub (the PR) and the local editor do better, and for makers who don't
// read code they were untouchable noise. The plain-language "what changed" lives
// in the agent chat summary; engineers use the PR / "open in editor". Verify
// (acceptance criteria + grounds + ⚠️ risk flags) lives in the Spec/Docs, never a
// verdict tab here (DEC-058/059). The diff data still feeds Verify's evidence
// collection in the session — only the in-app Diff / Code *views* are gone.

import { PreviewPane } from "./preview-pane";
import type { ImplementSession } from "./implement-session-types";

export function BuildReview({
  session,
}: {
  session: ImplementSession;
  /** Accepted for call-site compatibility; Implement is now a single pane. */
  active?: boolean;
}) {
  return (
    <PreviewPane
      server={session.preview}
      hasRef={!!session.ref}
      session={session}
    />
  );
}

export default BuildReview;
