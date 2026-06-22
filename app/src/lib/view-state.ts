// Per-issue center-view state that must survive REMOUNTS (DEC-141). Switching the
// center area with ⌘⇧[ / ⌘⇧] unmounts the hidden area (issues/page.tsx renders
// `tab === "design" ? <IssueDesign> : <BuildReview>`), which would otherwise reset
// its active sub-tab / preview route back to the first one every time. A tiny
// module-level cache, keyed by issue id, remembers them so going Design ⇄ Prototype
// returns you to exactly what you were looking at. In-memory (per app run) by design.

interface ViewState {
  /** Selected Design doc/variant path. */
  designTab: string | null;
  /** Prototype sub-tab: "preview" | "map" | "qa". */
  protoTab: string;
  /** Current Preview route. */
  previewPath: string;
}

const cache = new Map<string, Partial<ViewState>>();

export function getViewState(issueId: string): Partial<ViewState> {
  return cache.get(issueId) ?? {};
}

export function setViewState(issueId: string, patch: Partial<ViewState>): void {
  cache.set(issueId, { ...cache.get(issueId), ...patch });
}
