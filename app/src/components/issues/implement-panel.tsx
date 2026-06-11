"use client";

// Issue "Design" tab (v0.5 slice 2 + 2.5 — the implementation + review loop).
//
// From a spec'd Issue: create a branch + worktree off the repo HEAD, launch a
// CLI agent (claude/codex) inside that worktree (embedded TerminalPane, cwd =
// worktree), then review the result two ways — a live iframe Preview of the
// worktree dev server (slice 2.5) and the text Diff (slice 2) — and iterate:
// edit the Spec, Re-run AI (re-prompt the same worktree with a follow-up
// handoff), Preview/Diff again, then Accept (commit on the branch + auto-draft
// decision.md) or Discard (remove worktree + branch, status -> open).
//
// The controls are a CYCLE, not a stepper (DEC-012): Implement/Re-run · Preview
// · Diff · Accept · Discard are available together once a worktree exists; status
// stays in-progress across iterations. We do NOT auto-merge to main (DEC-008/
// G1'). The dev-server pty lives in usePreviewServer (parent-owned) so it
// survives the Preview⇆Diff toggle and is killed on Discard / unmount.

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  GitBranch,
  RotateCw,
  RotateCcw,
  Check,
  Trash2,
  TriangleAlert,
  Sparkles,
  MonitorPlay,
  FileDiff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  branchName,
  worktreeDir,
  readWorktreeRef,
  writeWorktreeRef,
  clearWorktreeRef,
  buildImplementHandoff,
  draftDecision,
  updateIssueMeta,
  type Issue,
  type IssueStatus,
  type WorktreeRef,
} from "@/lib/issues";
import {
  gitIsRepo,
  gitWorktreeAdd,
  gitDiff,
  gitStatus,
  gitCommitAll,
  gitWorktreeRemove,
  gitBranchDelete,
  parseDiff,
  changedPathsFromStatus,
} from "@/lib/git";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { ptyWrite } from "@/lib/pty";
import type { TerminalPaneProps } from "@/components/workspace/terminal";
import { usePreviewServer } from "./use-preview-server";
import { PreviewPane } from "./preview-pane";

// xterm-backed terminal — client-only (DOM + CSS), like /workspace.
const TerminalPane = dynamic(
  () => import("@/components/workspace/terminal"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-3 text-xs text-zinc-400">
        <Loader2 className="size-3.5 animate-spin" />
        Starting terminal…
      </div>
    ),
  },
) as React.ComponentType<TerminalPaneProps>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Action = "implement" | "rerun" | "accept" | "discard" | null;
type ReviewTab = "preview" | "diff";

interface ImplementPanelProps {
  root: string;
  issue: Issue;
  /** Bubble status changes up so the header badge stays in sync. */
  onStatusChange: (status: IssueStatus) => void;
}

export function ImplementPanel({
  root,
  issue,
  onStatusChange,
}: ImplementPanelProps) {
  const [gitRepo, setGitRepo] = React.useState<boolean | null>(null);
  const [ref, setRef] = React.useState<WorktreeRef | null>(null);
  const [agents, setAgents] = React.useState<AgentTool[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(
    null,
  );
  const [action, setAction] = React.useState<Action>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [diff, setDiff] = React.useState("");
  const [statusText, setStatusText] = React.useState("");
  const [diffLoading, setDiffLoading] = React.useState(false);

  // Design defaults to the visual iframe (Preview); Diff is the secondary view.
  const [reviewTab, setReviewTab] = React.useState<ReviewTab>("preview");

  // Dev-server lifecycle (the Preview). Parent-owned so it survives the
  // Preview⇆Diff toggle and can be stopped on Discard.
  const preview = usePreviewServer(root, ref?.path ?? null);

  // Embedded terminal (one at a time). termCwd/termSpawn/termNonce mirror the
  // /workspace pattern; pendingInput is written once the pty is ready.
  const [termMounted, setTermMounted] = React.useState(false);
  const [termCwd, setTermCwd] = React.useState<string | null>(null);
  const [termSpawn, setTermSpawn] = React.useState<
    { cmd: string; args?: string[] } | undefined
  >(undefined);
  const [termNonce, setTermNonce] = React.useState(0);
  const pendingInputRef = React.useRef<string | null>(null);

  // Detect git + load any existing worktree ref + its diff (resume an
  // in-progress issue). Keyed by issue.id at the call site (fresh mount per
  // issue), so we only set state from async continuations.
  React.useEffect(() => {
    let cancelled = false;
    gitIsRepo(root)
      .then((ok) => {
        if (!cancelled) setGitRepo(ok);
      })
      .catch(() => {
        if (!cancelled) setGitRepo(false);
      });
    readWorktreeRef(issue)
      .then((r) => {
        if (cancelled || !r) return;
        setRef(r);
        // Lazy-load the diff for a resumed worktree.
        Promise.all([gitDiff(r.path), gitStatus(r.path)])
          .then(([d, s]) => {
            if (cancelled) return;
            setDiff(d);
            setStatusText(s);
          })
          .catch(() => {
            /* worktree may have been removed externally */
          });
      })
      .catch(() => {
        /* no ref */
      });
    return () => {
      cancelled = true;
    };
  }, [root, issue]);

  // Detect installed agents once.
  React.useEffect(() => {
    let cancelled = false;
    detectAgents()
      .then((found) => {
        if (cancelled) return;
        setAgents(found);
        const first = found.find((a) => a.available);
        setSelectedAgentId(first ? first.id : null);
      })
      .catch(() => {
        /* none */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const launchAgent = React.useCallback(
    (agent: AgentTool, cwd: string, prompt: string) => {
      // Pass the handoff text as the agent's positional prompt arg
      // (`claude "<prompt>"` starts an interactive session seeded with it). This
      // is reliable + visible, unlike typing into the TUI after a fixed delay
      // (which raced the TUI's input loop and got dropped), and it avoids the
      // agent needing to read a handoff file that lives in the main repo while it
      // runs in the external worktree.
      setTermCwd(cwd);
      setTermSpawn({ cmd: agent.bin, args: [prompt] });
      setTermMounted(true);
      setTermNonce((n) => n + 1);
    },
    [],
  );

  const teardownTerminal = React.useCallback(() => {
    pendingInputRef.current = null;
    setTermSpawn(undefined);
    setTermMounted(false);
    setTermNonce((n) => n + 1);
  }, []);

  const handleTermReady = React.useCallback((id: string) => {
    const input = pendingInputRef.current;
    if (!input) return;
    pendingInputRef.current = null;
    // Give the CLI a moment to start its input loop before feeding the prompt.
    window.setTimeout(() => {
      void ptyWrite(id, input).catch(() => {
        /* session torn down */
      });
    }, 800);
  }, []);

  const refreshDiff = React.useCallback(async (worktreePath: string) => {
    setDiffLoading(true);
    try {
      const [d, s] = await Promise.all([
        gitDiff(worktreePath),
        gitStatus(worktreePath),
      ]);
      setDiff(d);
      setStatusText(s);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setDiffLoading(false);
    }
  }, []);

  async function handleImplement() {
    if (!gitRepo || !issue.slots.spec || action) return;
    if (!selectedAgent?.available) {
      setError("利用可能なエージェント (claude / codex) が見つかりません。");
      return;
    }
    setAction("implement");
    setError(null);
    setInfo(null);
    try {
      const branch = branchName(issue);
      const wt = await worktreeDir(root, issue);
      await gitWorktreeAdd(root, branch, wt);
      const newRef: WorktreeRef = { branch, path: wt, baseSHA: "" };
      await writeWorktreeRef(issue, newRef);
      await updateIssueMeta(root, issue, { status: "in-progress" });
      onStatusChange("in-progress");
      const { content } = await buildImplementHandoff(root, issue, wt);
      setRef(newRef);
      launchAgent(selectedAgent, wt, content);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }

  // Re-run AI on the SAME worktree with a follow-up handoff built from the
  // (possibly edited) issue.md + spec.md (DEC-012 review↔refine cycle).
  async function handleRerun() {
    if (!ref || action) return;
    if (!selectedAgent?.available) {
      setError("利用可能なエージェント (claude / codex) が見つかりません。");
      return;
    }
    setAction("rerun");
    setError(null);
    setInfo(null);
    try {
      const { content } = await buildImplementHandoff(root, issue, ref.path, {
        followUp: true,
      });
      launchAgent(selectedAgent, ref.path, content);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }

  async function handleAccept() {
    if (!ref || action) return;
    setAction("accept");
    setError(null);
    setInfo(null);
    try {
      // Capture changed paths BEFORE committing (status is clean afterwards).
      const before = await gitStatus(ref.path);
      const changed = changedPathsFromStatus(before);
      if (changed.length === 0) {
        setError("コミットする変更がありません。");
        setAction(null);
        return;
      }
      const sha = await gitCommitAll(ref.path, issue.title);
      await draftDecision(root, issue, {
        changedPaths: changed,
        branch: ref.branch,
      });
      await updateIssueMeta(root, issue, { status: "merged" });
      onStatusChange("merged");
      setInfo(
        `commit ${sha.slice(0, 9)} を ${ref.branch} に作成し、decision.md を生成しました（Decisions に表示されます）。`,
      );
      await refreshDiff(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }

  async function handleDiscard() {
    if (!ref || action) return;
    if (
      !window.confirm(
        "worktree と branch を破棄し、Issue を open に戻します。よろしいですか？",
      )
    ) {
      return;
    }
    setAction("discard");
    setError(null);
    setInfo(null);
    try {
      // Stop the dev server + unmount the terminal first so nothing holds the
      // worktree open while git removes it.
      await preview.stop();
      teardownTerminal();
      await gitWorktreeRemove(root, ref.path);
      await gitBranchDelete(root, ref.branch).catch(() => {
        /* branch may already be gone */
      });
      await clearWorktreeRef(issue);
      await updateIssueMeta(root, issue, { status: "open" });
      onStatusChange("open");
      setRef(null);
      setDiff("");
      setStatusText("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }

  const canImplement =
    gitRepo === true && issue.slots.spec && !!selectedAgent?.available && !action;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Controls */}
      <div className="shrink-0 space-y-3 border-b p-4">
        {gitRepo === false && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              このフォルダは git リポジトリではありません。Implement は使えません。
            </span>
          </div>
        )}
        {gitRepo === true && !issue.slots.spec && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>先に Spec を作成してください（Spec が実装の入力になります）。</span>
          </div>
        )}

        {ref && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1 font-mono font-normal">
              <GitBranch className="size-3" />
              {ref.branch}
            </Badge>
            <span
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={ref.path}
            >
              {ref.path}
            </span>
          </div>
        )}

        {/* Agent picker */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            実装エージェント
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Agent"
          >
            {agents.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                エージェントを検出中…
              </span>
            ) : (
              agents.map((a) => {
                const active = a.id === selectedAgentId;
                return (
                  <Button
                    key={a.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    disabled={!a.available}
                    aria-checked={active}
                    role="radio"
                    onClick={() => setSelectedAgentId(a.id)}
                  >
                    {a.name}
                    {!a.available && (
                      <Badge variant="secondary" className="ml-1">
                        not found
                      </Badge>
                    )}
                  </Button>
                );
              })
            )}
          </div>
        </div>

        {/* Action buttons — a cycle once a worktree exists (DEC-012). */}
        <div className="flex flex-wrap items-center gap-2">
          {!ref ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!canImplement}
              onClick={() => void handleImplement()}
            >
              {action === "implement" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Implement with AI
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!selectedAgent?.available || !!action}
                onClick={() => void handleRerun()}
                title="編集後の Spec で同じ worktree に再実装させる"
              >
                {action === "rerun" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Re-run AI
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!!action}
                onClick={() => void handleAccept()}
                title="変更を branch に commit し、decision を生成"
              >
                {action === "accept" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                disabled={!!action}
                onClick={() => void handleDiscard()}
                title="worktree と branch を破棄"
              >
                {action === "discard" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Discard
              </Button>
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {info && <p className="text-xs text-emerald-600 dark:text-emerald-500">{info}</p>}
      </div>

      {/* Embedded terminal (agent runs here, cwd = worktree) */}
      {termMounted && termCwd && (
        <div className="h-72 shrink-0 border-b bg-[#0a0a0a]">
          <TerminalPane
            key={`${termCwd}#${termNonce}#${termSpawn?.cmd ?? "shell"}`}
            cwd={termCwd}
            spawn={termSpawn}
            onReady={handleTermReady}
          />
        </div>
      )}

      {/* Review — Preview (iframe) ⇆ Diff (text) */}
      <div className="flex min-h-0 flex-1 flex-col">
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
          <div
            className={cn("absolute inset-0", reviewTab !== "preview" && "hidden")}
          >
            <PreviewPane server={preview} hasRef={!!ref} />
          </div>
          <div
            className={cn("absolute inset-0", reviewTab !== "diff" && "hidden")}
          >
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
        worktree がありません。「Implement with AI」で branch + worktree を作成してください。
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

export default ImplementPanel;
