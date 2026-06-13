"use client";

// The CENTER "Build" tab (DEC-051; was "Design" pre-restructure). The REAL repo
// result — review only (no agent terminal / controls — those live in the
// persistent right agent panel). Three sub-views over the SHARED implementation
// session (so they track the worktree the right-panel terminal runs in):
//   - Preview : the live worktree dev-server iframe (+ annotations).
//   - Diff    : the text diff of what the agent changed.
//   - Verify  : the spec's 受入基準 scored PASS/FAIL by the Verify turn (DEC-050),
//               read from issue.dir/verify.md — the human-readable "verified
//               result" a maker approves instead of unread code.
// All panes stay mounted (hidden toggling) so the iframe + scroll survive switches.

import * as React from "react";
import {
  Loader2,
  RotateCw,
  MonitorPlay,
  FileDiff,
  ListChecks,
  Check,
  X as XIcon,
  MinusCircle,
  CircleSlash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { readFile } from "@/lib/ipc";
import { parseDiff, changedPathsFromStatus } from "@/lib/git";
import { PreviewPane } from "./preview-pane";
import type { ImplementSession } from "./use-implement-session";

type ReviewTab = "preview" | "diff" | "verify";

export function BuildReview({ session }: { session: ImplementSession }) {
  const {
    ref,
    preview,
    diff,
    statusText,
    diffLoading,
    refreshDiff,
    action,
    canVerify,
    handleVerify,
  } = session;

  // Build defaults to the visual iframe (Preview); Diff + Verify are secondary.
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
        <Button
          size="sm"
          variant={reviewTab === "verify" ? "secondary" : "ghost"}
          className="h-7 gap-1.5"
          onClick={() => setReviewTab("verify")}
        >
          <ListChecks className="size-3.5" />
          Verify
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
        {reviewTab === "verify" && (
          <Button
            size="sm"
            className="ml-auto h-7 gap-1.5"
            disabled={!canVerify}
            onClick={() => void handleVerify()}
            title="受入基準を1つずつ採点（PASS/FAIL）して結果をここに表示"
          >
            {action === "verify" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ListChecks className="size-3.5" />
            )}
            検証する
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
        <div className={cn("absolute inset-0", reviewTab !== "verify" && "hidden")}>
          <ScrollArea className="h-full">
            <VerifyView session={session} />
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
        worktree がありません。右の「Build」で branch + worktree を作成してください。
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

// --- Verify view (DEC-050) -------------------------------------------------

type Verdict = "PASS" | "FAIL" | "BLOCKED" | "SKIP";

const VERDICT_META: Record<
  Verdict,
  { Icon: typeof Check; cls: string; chip: string }
> = {
  PASS: {
    Icon: Check,
    cls: "text-emerald-600 dark:text-emerald-400",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  FAIL: {
    Icon: XIcon,
    cls: "text-red-600 dark:text-red-400",
    chip: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  BLOCKED: {
    Icon: MinusCircle,
    cls: "text-amber-600 dark:text-amber-400",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  SKIP: {
    Icon: CircleSlash,
    cls: "text-muted-foreground",
    chip: "border-border bg-muted text-muted-foreground",
  },
};

const VERDICT_RE = /\b(PASS|FAIL|BLOCKED|SKIP)\b/;

interface VLine {
  verdict: Verdict | null;
  heading: boolean;
  text: string;
}

function parseVerify(md: string): {
  lines: VLine[];
  counts: Record<Verdict, number>;
} {
  const counts: Record<Verdict, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIP: 0 };
  const lines: VLine[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const heading = /^#{1,6}\s/.test(line);
    const m = VERDICT_RE.exec(line.toUpperCase());
    const verdict = (m?.[1] as Verdict | undefined) ?? null;
    if (verdict) counts[verdict] += 1;
    // Strip markdown checkbox / bullet / heading marks for display.
    const text = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*[-*]\s+\[[ xX]\]\s*/, "")
      .replace(/^\s*[-*]\s+/, "");
    lines.push({ verdict, heading, text });
  }
  return { lines, counts };
}

function VerifyView({ session }: { session: ImplementSession }) {
  const { issue, ref, agentState } = session;
  const path = `${issue.dir}/verify.md`;
  const [md, setMd] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    try {
      setMd(await readFile(path));
    } catch {
      setMd(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  // Initial load (inline async + cancel guard — setState only after the await, so
  // it never runs synchronously within the effect body).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await readFile(path);
        if (!cancelled) setMd(t);
      } catch {
        if (!cancelled) setMd(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Re-read when the agent settles (the Verify turn just wrote verify.md).
  const prev = React.useRef(agentState);
  React.useEffect(() => {
    const was = prev.current;
    prev.current = agentState;
    if (was === "running" && agentState !== "running") void reload();
  }, [agentState, reload]);

  if (!ref) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        worktree がありません。右の「Build」で実装してから Verify を回してください。
      </p>
    );
  }
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        読み込み中…
      </div>
    );
  }
  if (!md) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
        <ListChecks className="size-5 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          まだ検証していません。右上の <span className="font-medium">検証する</span>{" "}
          を押すと、エージェントが Spec の受入基準を1つずつ PASS / FAIL で採点し、ここに結果（verify.md）を表示します。
        </p>
      </div>
    );
  }

  const { lines, counts } = parseVerify(md);
  const total = counts.PASS + counts.FAIL + counts.BLOCKED + counts.SKIP;

  return (
    <div className="p-4">
      {total > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["PASS", "FAIL", "BLOCKED", "SKIP"] as Verdict[]).map((v) =>
            counts[v] > 0 ? (
              <span
                key={v}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                  VERDICT_META[v].chip,
                )}
              >
                {v} {counts[v]}
              </span>
            ) : null,
          )}
        </div>
      )}
      <ul className="space-y-1.5">
        {lines.map((ln, i) => {
          if (ln.verdict) {
            const { Icon, cls } = VERDICT_META[ln.verdict];
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", cls)} />
                <span className="min-w-0 flex-1 text-foreground/90">{ln.text}</span>
              </li>
            );
          }
          if (ln.heading) {
            return (
              <li key={i} className="pt-2 text-xs font-semibold text-foreground">
                {ln.text}
              </li>
            );
          }
          return (
            <li key={i} className="pl-5 text-[11px] text-muted-foreground">
              {ln.text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default BuildReview;
