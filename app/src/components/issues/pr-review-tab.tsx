"use client";

// PR Review sub-tab — Phase 1. Shows review threads from the PR associated
// with this worktree, lets the maker select unresolved comments, and injects
// a structured prompt into the running agent via session.injectOrFeedback
// (DEC-152). No thread reply / resolve / re-request — those are Phase 2.

import * as React from "react";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ghPrReviews, type PrReviewData } from "@/lib/pr-reviews";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/ipc";
import type { ImplementSession } from "./implement-session-types";

/** Auto-refresh threshold: re-fetch if last fetch was > 2 min ago. */
const STALE_MS = 2 * 60 * 1000;

// ---- helpers ---------------------------------------------------------------

function decisionBadge(
  decision: PrReviewData["reviewDecision"],
  t: ReturnType<typeof useT>,
) {
  if (!decision) return null;
  const map: Record<
    NonNullable<PrReviewData["reviewDecision"]>,
    { label: string; cls: string }
  > = {
    APPROVED: {
      label: t("review.statusDecisionApproved"),
      cls: "text-emerald-600 dark:text-emerald-400",
    },
    CHANGES_REQUESTED: {
      label: t("review.statusDecisionChangesRequested"),
      cls: "text-destructive",
    },
    REVIEW_REQUIRED: {
      label: t("review.statusDecisionReviewRequired"),
      cls: "text-muted-foreground",
    },
    COMMENTED: {
      label: t("review.statusDecisionCommented"),
      cls: "text-muted-foreground",
    },
  };
  const entry = map[decision];
  if (!entry) return null;
  return (
    <span className={cn("text-xs font-semibold uppercase tracking-wide", entry.cls)}>
      {entry.label}
    </span>
  );
}

function stateBadge(state: string, t: ReturnType<typeof useT>) {
  if (state === "OPEN") return null;
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
      {state === "MERGED" ? t("review.stateMerged") : t("review.stateClosed")}
    </span>
  );
}

function ciSummary(
  checks: PrReviewData["ciChecks"],
  t: ReturnType<typeof useT>,
) {
  if (checks.length === 0) return <span className="text-xs text-muted-foreground">{t("review.ciNone")}</span>;
  const passed = checks.filter((c) => c.state === "SUCCESS").length;
  const failed = checks.filter(
    (c) => c.state === "FAILURE" || c.state === "ERROR",
  ).length;
  const label =
    failed > 0
      ? t("review.ciPassedFailed", {
          passed: String(passed),
          failed: String(failed),
        })
      : t("review.ciPassed", { passed: String(passed) });
  return (
    <span
      className={cn(
        "text-xs",
        failed > 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {t("review.ciLabel")}: {label}
    </span>
  );
}

// ---- DiffHunk display ------------------------------------------------------

function DiffHunk({ hunk }: { hunk: string }) {
  const t = useT();
  const lines = hunk.split("\n");
  const MAX_COLLAPSED = 8;
  const [expanded, setExpanded] = React.useState(false);

  const shown = expanded ? lines : lines.slice(0, MAX_COLLAPSED);
  const hasMore = lines.length > MAX_COLLAPSED && !expanded;

  return (
    <div className="mt-1.5">
      <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-[11px] leading-relaxed font-mono text-muted-foreground whitespace-pre">
        {shown.join("\n")}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="inline size-3 mr-0.5" />
          {t("review.showMore", { n: String(lines.length - MAX_COLLAPSED) })}
        </button>
      )}
      {expanded && lines.length > MAX_COLLAPSED && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronUp className="inline size-3 mr-0.5" />
          {t("review.showLess")}
        </button>
      )}
    </div>
  );
}

// ---- Thread row ------------------------------------------------------------

function ThreadRow({
  thread,
  selected,
  onToggle,
  showResolved,
}: {
  thread: PrReviewData["threads"][number];
  selected: boolean;
  onToggle: () => void;
  showResolved: boolean;
}) {
  const t = useT();
  const lineLabel =
    thread.line != null
      ? `${thread.path}:${thread.line}`
      : `${thread.path} (${t("review.outdated")})`;

  if (thread.isResolved && !showResolved) return null;

  return (
    <div
      className={cn(
        "border-b px-3 py-3 last:border-b-0",
        thread.isResolved && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          disabled={thread.isResolved}
          onChange={onToggle}
          className="mt-0.5 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed"
          aria-label={lineLabel}
        />
        <div className="min-w-0 flex-1">
          {/* Header row: path + resolved badge */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-xs font-medium text-foreground">
              {lineLabel}
            </span>
            {thread.isResolved && (
              <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
                {t("review.resolvedBadge")}
              </span>
            )}
            {thread.replyCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                +{thread.replyCount} {t("review.replies")}
              </span>
            )}
          </div>

          {/* Author + body */}
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {thread.initiatingComment.author}:
            </span>{" "}
            <span className="line-clamp-2" title={thread.initiatingComment.body}>
              {thread.initiatingComment.body}
            </span>
          </p>

          {/* Diff hunk */}
          {thread.diffHunk && <DiffHunk hunk={thread.diffHunk} />}
        </div>
      </div>
    </div>
  );
}

// ---- Main component --------------------------------------------------------

export function PrReviewTab({
  session,
  onUnresolvedCount,
}: {
  session: ImplementSession;
  onUnresolvedCount?: (n: number) => void;
}) {
  const t = useT();

  const repoPath = session.ref?.path ?? session.root;
  const branch = session.ref?.branch ?? "";
  const prUrl = session.prUrl;

  const [data, setData] = React.useState<PrReviewData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<number | null>(null);

  const [filter, setFilter] = React.useState<"unresolved" | "all">("unresolved");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [injecting, setInjecting] = React.useState(false);

  // Report unresolved count to parent (for tab label badge).
  const unresolvedCount = data
    ? data.threads.filter((th) => !th.isResolved).length
    : 0;
  React.useEffect(() => {
    onUnresolvedCount?.(unresolvedCount);
  }, [unresolvedCount, onUnresolvedCount]);

  const fetchData = React.useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ghPrReviews(repoPath, branch);
      setData(result);
      setLastFetchedAt(Date.now());
      // Clear selection on refresh so stale checks don't linger.
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath, branch]);

  // Initial fetch + auto-refresh when data is stale (>2 min).
  // Uses a cancellable .then() chain (the codebase pattern — issue-map.tsx)
  // so setState is called inside callbacks, not synchronously in the effect body.
  React.useEffect(() => {
    if (!prUrl || !branch) return;
    const isStale =
      data === null ||
      (lastFetchedAt !== null && Date.now() - lastFetchedAt > STALE_MS);
    if (!isStale) return;

    let cancelled = false;
    void ghPrReviews(repoPath, branch)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLastFetchedAt(Date.now());
        setSelected(new Set());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // Re-run when the tab becomes visible (the parent will mount/unmount us),
    // so we check staleness on every mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prUrl]);

  function toggleThread(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnresolved() {
    const ids = data?.threads.filter((th) => !th.isResolved).map((th) => th.id) ?? [];
    setSelected(new Set(ids));
  }

  async function handleAddress(ids: string[]) {
    if (!data || ids.length === 0) return;
    const threads = data.threads.filter((th) => ids.includes(th.id));
    const promptLines: string[] = [
      `Address the following PR review comments in this worktree (branch: ${branch}).`,
      `For each comment, locate the indicated file and line, understand what the reviewer is asking for, and implement the fix directly. Do not reply to review threads or add explanatory comments — just fix the code. When done, write a brief summary of what you changed per comment.`,
      "",
    ];
    threads.forEach((thread, idx) => {
      const lineStr =
        thread.line != null ? String(thread.line) : "outdated";
      promptLines.push(
        `[${idx + 1}] ${thread.path}:${lineStr} — ${thread.initiatingComment.author}:`,
        `"${thread.initiatingComment.body}"`,
        "",
      );
      if (thread.diffHunk) {
        promptLines.push(`Diff context (for reference):\n${thread.diffHunk}`, "");
      }
    });

    const text = promptLines.join("\n");
    setInjecting(true);
    try {
      await session.injectOrFeedback(text);
      setSelected(new Set());
    } finally {
      setInjecting(false);
    }
  }

  // ---- render ---------------------------------------------------------------

  // Should not be rendered if no PR, but guard anyway.
  if (!prUrl) return null;

  // Loading (initial).
  if (loading && data === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        {t("review.loadingComments")}
      </div>
    );
  }

  // Error state.
  if (error !== null && data === null) {
    const isFork = error.includes("FORK_PR_NOT_SUPPORTED");
    const isAuth =
      error.includes("authentication") ||
      error.includes("auth") ||
      error.includes("401") ||
      error.includes("not logged") ||
      error.includes("gh auth");
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 p-6 text-sm">
        {isFork ? (
          <>
            <p className="text-muted-foreground">{t("review.errorForkNotSupported")}</p>
            <button
              onClick={() => void openExternal(prUrl).catch(() => {})}
              className="text-foreground underline underline-offset-2"
            >
              {t("review.viewOnGitHub")}
            </button>
          </>
        ) : isAuth ? (
          <p className="text-muted-foreground">{t("review.errorGhNotAuth")}</p>
        ) : (
          <p className="break-all text-muted-foreground">
            {t("review.errorGeneric")}: {error}
          </p>
        )}
        <button
          onClick={() => void fetchData()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          {t("review.refresh")}
        </button>
      </div>
    );
  }

  const unresolved = data?.threads.filter((th) => !th.isResolved) ?? [];
  const showResolved = filter === "all";
  const visibleThreads =
    filter === "unresolved"
      ? (data?.threads.filter((th) => !th.isResolved) ?? [])
      : (data?.threads ?? []);
  const selectedIds = Array.from(selected);
  const totalThreads = data?.threads.length ?? 0;
  const hasHundred = totalThreads >= 100;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar */}
      <div className="shrink-0 border-b px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {/* PR state + review decision */}
            <div className="flex flex-wrap items-center gap-2">
              {data && stateBadge(data.prState, t)}
              {data && decisionBadge(data.reviewDecision, t)}
              {data && data.reviewers.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("review.reviewers")}:{" "}
                  {data.reviewers.map((r, i) => (
                    <React.Fragment key={r.login + r.submittedAt}>
                      {i > 0 && ", "}
                      <span
                        className={cn(
                          r.state === "CHANGES_REQUESTED" && "font-medium text-foreground",
                        )}
                      >
                        {r.login}
                      </span>
                    </React.Fragment>
                  ))}
                </span>
              )}
            </div>
            {/* CI */}
            {data && ciSummary(data.ciChecks, t)}
          </div>

          {/* Refresh */}
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            title={t("review.refresh")}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      {data && data.threads.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
          <button
            onClick={() => setFilter("unresolved")}
            className={cn(
              "rounded px-2 py-0.5 text-xs",
              filter === "unresolved"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("review.filterUnresolved")}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded px-2 py-0.5 text-xs",
              filter === "all"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("review.filterAll")}
          </button>
        </div>
      )}

      {/* Thread list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {data === null ? (
          // Refresh was triggered but we already had data — show spinner overlay
          <div className="flex h-full items-center justify-center">
            <RefreshCw className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : data.threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>{t("review.emptyNoComments")}</p>
            <button
              onClick={() => void fetchData()}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              {t("review.refresh")}
            </button>
          </div>
        ) : visibleThreads.length === 0 && filter === "unresolved" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{t("review.emptyNoUnresolved")}</p>
            <button
              onClick={() => setFilter("all")}
              className="text-xs underline underline-offset-2 hover:text-foreground"
            >
              {t("review.showAll")}
            </button>
          </div>
        ) : (
          <>
            {hasHundred && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                {t("review.truncatedAt100")}
              </p>
            )}
            {(filter === "all" ? data.threads : visibleThreads).map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                selected={selected.has(thread.id)}
                onToggle={() => toggleThread(thread.id)}
                showResolved={showResolved}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      {data && unresolved.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t px-3 py-2">
          <button
            onClick={() => void handleAddress(selectedIds)}
            disabled={injecting || selectedIds.length === 0}
            className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {t("review.addressSelected", { n: String(selectedIds.length) })}
          </button>
          <button
            onClick={() => {
              selectAllUnresolved();
              // Trigger address on next tick (after state update).
              setTimeout(() => {
                const ids = data.threads
                  .filter((th) => !th.isResolved)
                  .map((th) => th.id);
                void handleAddress(ids);
              }, 0);
            }}
            disabled={injecting || unresolved.length === 0}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-40"
          >
            {t("review.addressAllUnresolved")}
          </button>
        </div>
      )}
    </div>
  );
}

export default PrReviewTab;
