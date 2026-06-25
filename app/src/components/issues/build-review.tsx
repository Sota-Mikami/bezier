"use client";

// The CENTER "Prototype" area (IA finalize, staged). The 2nd diamond — make &
// verify the live worktree app, SCOPED to this issue. Sub-views:
//   - Preview : the live worktree dev-server (the real app). Stays MOUNTED across
//               sub-tab switches so the iframe + dev server survive.
//   - Map     : a bird's-eye board of the issue's scoped screens. Scaffold for
//               now — scope/entry capture lands in a later stage (CEO: Map 最後).
//   - QA      : the proposal-level QA table (TSV/MD-portable). Per-issue .bezier
//               persistence + seeding from Spec criteria lands with the merge stage.
//
// Diff / Code were removed earlier: commodity views GitHub (PR) and the editor do
// better; the "what changed" reassurance lives in the agent chat summary.

import * as React from "react";
import { MonitorPlay, Map as MapIcon, ListChecks } from "lucide-react";

import { UnderlineTab } from "@/components/ui/underline-tab";
import { useTabShortcuts } from "@/lib/use-tab-shortcuts";
import { getViewState, setViewState } from "@/lib/view-state";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PreviewPane } from "./preview-pane";
import { IssueMap } from "./issue-map";
import { QaProposal } from "./qa-proposal";
import { AnnotationToggle } from "./annotation-mode";
import type { ImplementSession } from "./implement-session-types";
import type { ManifestEntry } from "@/lib/map-manifest";

type ProtoTab = "preview" | "map" | "qa";
const PROTO_TABS: ProtoTab[] = ["preview", "map", "qa"];

export function BuildReview({
  session,
  active = false,
}: {
  session: ImplementSession;
  /** Whether Prototype is the visible center area — gates the sub-tab shortcuts. */
  active?: boolean;
}) {
  const t = useT();
  // Restore the last-viewed Prototype sub-tab across area switches (DEC-141).
  const [tab, setTab] = React.useState<ProtoTab>(
    () => (getViewState(session.issue.id).protoTab as ProtoTab) ?? "preview",
  );
  React.useEffect(() => {
    setViewState(session.issue.id, { protoTab: tab });
  }, [tab, session.issue.id]);

  // DEC-133 Map-A: the Map captures a logged-in screenshot of each scoped route
  // through the (authenticated) Preview browser. The Map requests it; we switch to
  // Preview so its webview is painted (capture_region needs it visible), bump a
  // nonce the PreviewPane acts on, then return to the Map showing fresh stills.
  //
  // CaptureReq can be route-based (DEC-133 flat list) or manifest-entry-based
  // (ISSUE-006 Phase 1: screen×state board). Only one kind fires at a time.
  const [captureReq, setCaptureReq] = React.useState<{
    routes?: string[];
    entries?: ManifestEntry[];
    nonce: number;
  } | null>(null);
  const [capturing, setCapturing] = React.useState(false);
  const [captureProgress, setCaptureProgress] = React.useState<{ done: number; total: number } | null>(
    null,
  );
  const [stillsNonce, setStillsNonce] = React.useState(0);
  // Gap tracking: entryId → gap reason string (transient, reset on next capture).
  const [captureGaps, setCaptureGaps] = React.useState<Record<string, string>>({});

  /** DEC-133 path: capture a list of routes (flat board). */
  const startCapture = React.useCallback((routes: string[]) => {
    if (!routes.length) return;
    setTab("preview");
    setCapturing(true);
    setCaptureProgress({ done: 0, total: routes.length });
    setCaptureGaps({});
    setCaptureReq((prev) => ({ routes, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  /** ISSUE-006 path: capture manifest entries (screen×state board). */
  const startManifestCapture = React.useCallback((entries: ManifestEntry[]) => {
    if (!entries.length) return;
    setTab("preview");
    setCapturing(true);
    setCaptureProgress({ done: 0, total: entries.length });
    setCaptureGaps({});
    setCaptureReq((prev) => ({ entries, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleCaptureDone = React.useCallback(() => {
    setCapturing(false);
    setCaptureProgress(null);
    setStillsNonce((n) => n + 1);
    setTab("map");
  }, []);

  const handleCaptureGap = React.useCallback((entryId: string, reason: string) => {
    setCaptureGaps((prev) => ({ ...prev, [entryId]: reason }));
  }, []);

  // Same Chrome-style nav as Design (⌘1–9 / ⌘⌥←→ / Ctrl+Tab).
  useTabShortcuts({
    active,
    ids: PROTO_TABS,
    currentId: tab,
    onSelect: (id) => setTab(id as ProtoTab),
  });

  // DF-3: when the dev server comes up (auto-started on a code change, or manual),
  // surface the Preview sub-tab so the maker lands on the live app instead of
  // whatever sub-view they last left open.
  const previewStatus = session.preview.status;
  const prevStatusRef = React.useRef(previewStatus);
  React.useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = previewStatus;
    const cameUp =
      (previewStatus === "starting" || previewStatus === "ready") &&
      was !== "starting" &&
      was !== "ready";
    if (cameUp) setTab("preview");
  }, [previewStatus]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b px-1.5">
        <UnderlineTab active={tab === "preview"} onClick={() => setTab("preview")}>
          <MonitorPlay className="size-4" />
          {t("prototype.tabPreview")}
        </UnderlineTab>
        <UnderlineTab active={tab === "map"} onClick={() => setTab("map")}>
          <MapIcon className="size-4" />
          {t("prototype.tabMap")}
        </UnderlineTab>
        <UnderlineTab active={tab === "qa"} onClick={() => setTab("qa")}>
          <ListChecks className="size-4" />
          {t("prototype.tabQa")}
        </UnderlineTab>
        {/* Surface-aware mode bar (IA): Preview / Map / QA all support Comment only. */}
        <div className="ml-auto flex shrink-0 items-center pr-1.5">
          <AnnotationToggle />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Preview stays mounted (hidden toggle) so the iframe + dev server survive. */}
        <div className={cn("absolute inset-0", tab !== "preview" && "hidden")}>
          <PreviewPane
            server={session.preview}
            hasRef={!!session.ref}
            session={session}
            captureReq={captureReq ?? undefined}
            onCaptureProgress={(done, total) => setCaptureProgress({ done, total })}
            onCaptureDone={handleCaptureDone}
            onCaptureGap={handleCaptureGap}
          />
        </div>
        {tab === "map" && (
          <IssueMap
            session={session}
            onCapture={startCapture}
            onManifestCapture={startManifestCapture}
            capturing={capturing}
            captureProgress={captureProgress}
            captureGaps={captureGaps}
            stillsNonce={stillsNonce}
          />
        )}
        {tab === "qa" && <QaProposal session={session} />}
      </div>
    </div>
  );
}

export default BuildReview;
