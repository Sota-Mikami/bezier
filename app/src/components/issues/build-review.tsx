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
import { cn } from "@/lib/utils";
import { PreviewPane } from "./preview-pane";
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
  const [tab, setTab] = React.useState<ProtoTab>("preview");

  // Same Chrome-style nav as Design (⌘1–9 / ⌘⌥←→ / Ctrl+Tab).
  useTabShortcuts({
    active,
    ids: PROTO_TABS,
    currentId: tab,
    onSelect: (id) => setTab(id as ProtoTab),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b px-1.5">
        <UnderlineTab active={tab === "preview"} onClick={() => setTab("preview")}>
          <MonitorPlay className="size-4" />
          Preview
        </UnderlineTab>
        <UnderlineTab active={tab === "map"} onClick={() => setTab("map")}>
          <MapIcon className="size-4" />
          Map
        </UnderlineTab>
        <UnderlineTab active={tab === "qa"} onClick={() => setTab("qa")}>
          <ListChecks className="size-4" />
          QA
        </UnderlineTab>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Preview stays mounted (hidden toggle) so the iframe + dev server survive. */}
        <div className={cn("absolute inset-0", tab !== "preview" && "hidden")}>
          <PreviewPane server={session.preview} hasRef={!!session.ref} session={session} />
        </div>
        {tab === "map" && <MapScaffold />}
        {tab === "qa" && <QaProposal issue={session.issue} />}
      </div>
    </div>
  );
}

function MapScaffold() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapIcon className="size-5" />
      </div>
      <div className="text-sm font-medium text-foreground">Map — このイシューが触る範囲を俯瞰</div>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        範囲（scope）と開始ルート（entry）をイシューに紐づけ、各画面をスクショして
        Figma のように並べます。scope / entry / スクショは <code className="font-mono">.bezier</code> に
        保存され、<strong className="font-medium text-foreground">PR には入りません</strong>。
        <br />
        撮影 → board 描画は次の段階で実装します。
      </p>
    </div>
  );
}

export default BuildReview;
