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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PreviewPane } from "./preview-pane";
import { IssueMap } from "./issue-map";
import { QaProposal } from "./qa-proposal";
import type { ImplementSession } from "./implement-session-types";

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
  const [tab, setTab] = React.useState<ProtoTab>("preview");

  // DEC-133 Map-A: the Map captures a logged-in screenshot of each scoped route
  // through the (authenticated) Preview browser. The Map requests it; we switch to
  // Preview so its webview is painted (capture_region needs it visible), bump a
  // nonce the PreviewPane acts on, then return to the Map showing fresh stills.
  const [captureReq, setCaptureReq] = React.useState<{ routes: string[]; nonce: number } | null>(
    null,
  );
  const [capturing, setCapturing] = React.useState(false);
  const [captureProgress, setCaptureProgress] = React.useState<{ done: number; total: number } | null>(
    null,
  );
  const [stillsNonce, setStillsNonce] = React.useState(0);
  const startCapture = React.useCallback((routes: string[]) => {
    if (!routes.length) return;
    setTab("preview");
    setCapturing(true);
    setCaptureProgress({ done: 0, total: routes.length });
    setCaptureReq((prev) => ({ routes, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const handleCaptureDone = React.useCallback(() => {
    setCapturing(false);
    setCaptureProgress(null);
    setStillsNonce((n) => n + 1);
    setTab("map");
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
          />
        </div>
        {tab === "map" && (
          <IssueMap
            session={session}
            onCapture={startCapture}
            capturing={capturing}
            captureProgress={captureProgress}
            stillsNonce={stillsNonce}
          />
        )}
        {tab === "qa" && <QaProposal session={session} />}
      </div>
    </div>
  );
}

export default BuildReview;
