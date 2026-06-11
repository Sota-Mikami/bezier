"use client";

// v0.5 slice 2.6 — the CENTER "Design" tab: review ONLY (no agent terminal, no
// Implement controls — those moved to the persistent right agent panel).
//
// Renders the live worktree iframe Preview ⇆ the text Diff, both reading the
// SHARED implementation session (worktree ref + dev-server preview) so they
// track the same worktree the right-panel terminal runs in. Both sub-panes stay
// mounted (hidden toggling) so the iframe + diff scroll survive switching.

import * as React from "react";
import { Loader2, RotateCw, MonitorPlay, FileDiff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { parseDiff, changedPathsFromStatus } from "@/lib/git";
import { PreviewPane } from "./preview-pane";
import type { ImplementSession } from "./use-implement-session";

type ReviewTab = "preview" | "diff";

export function DesignReview({ session }: { session: ImplementSession }) {
  const { ref, preview, diff, statusText, diffLoading, refreshDiff } = session;

  // Design defaults to the visual iframe (Preview); Diff is the secondary view.
  const [reviewTab, setReviewTab] = React.useState<ReviewTab>("preview");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <Button
          size="sm"
          variant={reviewTab === "preview" ? "secondary" : "ghost"}
          className="h-7 gap-1.5"
          onClick={() => setReviewTab("preview")}
        >
          <MonitorPlay className="size-3.5" />
          Preview
        </Button>
        <Button
          size="sm"
          variant={reviewTab === "diff" ? "secondary" : "ghost"}
          className="h-7 gap-1.5"
          onClick={() => setReviewTab("diff")}
        >
          <FileDiff className="size-3.5" />
          Diff
        </Button>
        {reviewTab === "diff" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1.5"
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

      {/* Both panes stay mounted (hidden toggling) so the iframe + diff scroll
          survive switching tabs. */}
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", reviewTab !== "preview" && "hidden")}>
          <PreviewPane server={preview} hasRef={!!ref} />
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
        worktree がありません。右の「Implement with AI」で branch + worktree を作成してください。
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

export default DesignReview;
