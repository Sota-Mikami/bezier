"use client";

// The CENTER "Implement" tab (DEC-051; was "Design" pre-restructure). The REAL
// repo result — review only (no agent terminal / controls — those live in the
// persistent right agent panel). Sub-views over the SHARED implementation
// session (so they track the worktree the right-panel terminal runs in):
//   - Preview : the live worktree dev-server iframe (+ annotations).
//   - Diff    : the text diff of what the agent changed.
//   - Code    : the real worktree source tree, browsable + editable (DEC-059).
// Verify is GONE from this UI (DEC-058 / DEC-059): AI self-scoring was distrusted
// by every persona, so verification moves into the Spec as evidence rather than
// a verdict tab here.
// All panes stay mounted (hidden toggling) so the iframe + scroll survive switches.

import * as React from "react";
import {
  Loader2,
  RotateCw,
  MonitorPlay,
  FileDiff,
  Code2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UnderlineTab } from "@/components/ui/underline-tab";
import { cn } from "@/lib/utils";
import { parseDiff, changedPathsFromStatus } from "@/lib/git";
import { useTabShortcuts } from "@/lib/use-tab-shortcuts";
import { PreviewPane } from "./preview-pane";
import { CodeBrowser } from "./code-browser";
import type { ImplementSession } from "./use-implement-session";

type ReviewTab = "preview" | "diff" | "code";
const REVIEW_TABS: ReviewTab[] = ["preview", "diff", "code"];

export function BuildReview({
  session,
  active = false,
}: {
  session: ImplementSession;
  /** Whether Implement is the visible center tab — gates the tab shortcuts so
   *  ⌘1-9 / ⌘⌥←→ only move the sub-tabs while Implement is on screen (DEC-066). */
  active?: boolean;
}) {
  const {
    ref,
    preview,
    diff,
    statusText,
    diffLoading,
    refreshDiff,
  } = session;

  // Implement defaults to the visual iframe (Preview); Diff + Code are secondary.
  const [reviewTab, setReviewTab] = React.useState<ReviewTab>("preview");

  // Chrome-style tab nav, same as the Design candidate tabs (DEC-066).
  useTabShortcuts({
    active,
    ids: REVIEW_TABS,
    currentId: reviewTab,
    onSelect: (id) => setReviewTab(id as ReviewTab),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-stretch border-b px-1.5">
        <UnderlineTab
          active={reviewTab === "preview"}
          onClick={() => setReviewTab("preview")}
        >
          <MonitorPlay className="size-4" />
          Preview
        </UnderlineTab>
        <UnderlineTab
          active={reviewTab === "diff"}
          onClick={() => setReviewTab("diff")}
        >
          <FileDiff className="size-4" />
          Diff
        </UnderlineTab>
        <UnderlineTab
          active={reviewTab === "code"}
          onClick={() => setReviewTab("code")}
          title="worktree の実コードを見て編集する"
        >
          <Code2 className="size-4" />
          Code
        </UnderlineTab>
        {reviewTab === "diff" && (
          <Button
            size="sm"
            variant="ghost"
            className="my-auto ml-auto h-7 gap-1.5"
            disabled={!ref || diffLoading}
            onClick={() => ref && void refreshDiff(ref.path)}
          >
            {diffLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            Refresh
          </Button>
        )}
      </div>

      {/* All panes stay mounted (hidden toggling) so the iframe + scroll survive. */}
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", reviewTab !== "preview" && "hidden")}>
          <PreviewPane server={preview} hasRef={!!ref} session={session} />
        </div>
        <div className={cn("absolute inset-0", reviewTab !== "diff" && "hidden")}>
          <ScrollArea className="h-full">
            <DiffView
              diff={diff}
              statusText={statusText}
              loading={diffLoading}
              hasRef={!!ref}
            />
          </ScrollArea>
        </div>
        <div className={cn("absolute inset-0", reviewTab !== "code" && "hidden")}>
          <CodeBrowser key={ref?.path ?? "no-worktree"} session={session} />
        </div>
      </div>
    </div>
  );
}

function DiffView({
  diff,
  statusText,
  loading,
  hasRef,
}: {
  diff: string;
  statusText: string;
  loading: boolean;
  hasRef: boolean;
}) {
  if (!hasRef) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        worktree がありません。右の「Implement」で branch + worktree を作成してください。
      </p>
    );
  }

  const files = changedPathsFromStatus(statusText);
  const lines = parseDiff(diff);

  return (
    <div>
      {files.length > 0 && (
        <div className="border-b px-4 py-2 text-xs">
          <span className="font-medium text-muted-foreground">
            変更ファイル ({files.length})
          </span>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-foreground/80">
            {files.map((p) => (
              <li key={p} className="truncate">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading diff…</p>
      ) : lines.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          差分はまだありません。エージェントが変更したら Refresh で更新してください。
        </p>
      ) : (
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-[1.5]">
          {lines.map((ln, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre",
                ln.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                ln.kind === "del" && "bg-red-500/10 text-red-700 dark:text-red-400",
                ln.kind === "hunk" && "text-sky-600 dark:text-sky-400",
                ln.kind === "meta" && "text-muted-foreground",
                ln.kind === "context" && "text-foreground/80",
              )}
            >
              {ln.text || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export default BuildReview;
