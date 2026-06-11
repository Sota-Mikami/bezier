"use client";

// Issue "Implementation" panel (v0.5 slice 2 — the implementation loop).
//
// From a spec'd Issue: create a branch + worktree off the repo HEAD, launch a
// CLI agent (claude/codex) inside that worktree (embedded TerminalPane, cwd =
// worktree), show the uncommitted git diff, then Accept (commit on the branch +
// auto-draft decision.md) or Discard (remove worktree + branch, status -> open).
//
// We do NOT auto-merge to main (DEC-008/G1'): Accept leaves the commit on the
// branch for a PR. The embedded terminal reuses the v0.2 TerminalPane; it is
// loaded via next/dynamic({ssr:false}) because xterm touches the DOM and the app
// builds with output:"export".

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  GitBranch,
  Play,
  RotateCw,
  Check,
  Trash2,
  TriangleAlert,
  Sparkles,
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

type Action = "implement" | "launch" | "accept" | "discard" | null;

interface ImplementPanelProps {
  root: string;
  issue: Issue;
  /** Bubble status changes up so the header badge stays in sync. */
  onStatusChange: (status: IssueStatus) => void;
  /** Called after Accept drafts decision.md so the Decision tab can appear. */
  onDecisionDrafted: () => void;
}

export function ImplementPanel({
  root,
  issue,
  onStatusChange,
  onDecisionDrafted,
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
    (agent: AgentTool, cwd: string, initialInput: string) => {
      pendingInputRef.current = initialInput;
      setTermCwd(cwd);
      setTermSpawn({ cmd: agent.bin, args: [] });
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

  const refreshDiff = React.useCallback(
    async (worktreePath: string) => {
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
    },
    [],
  );

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
      const wt = worktreeDir(root, issue);
      await gitWorktreeAdd(root, branch, wt);
      const newRef: WorktreeRef = { branch, path: wt, baseSHA: "" };
      await writeWorktreeRef(issue, newRef);
      await updateIssueMeta(root, issue, { status: "in-progress" });
      onStatusChange("in-progress");
      const handoff = await buildImplementHandoff(root, issue, wt);
      setRef(newRef);
      launchAgent(selectedAgent, wt, `Please read ${handoff} and implement.\n`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }

  async function handleLaunchAgent() {
    if (!ref || action) return;
    if (!selectedAgent?.available) {
      setError("利用可能なエージェント (claude / codex) が見つかりません。");
      return;
    }
    setAction("launch");
    setError(null);
    try {
      const handoff = await buildImplementHandoff(root, issue, ref.path);
      launchAgent(selectedAgent, ref.path, `Please read ${handoff} and implement.\n`);
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
      onDecisionDrafted();
      setInfo(
        `commit ${sha.slice(0, 9)} を ${ref.branch} に作成し、decision.md を生成しました。`,
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
      // Unmount the terminal first so the pty releases the worktree.
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

        {/* Action buttons */}
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
                onClick={() => void handleLaunchAgent()}
                title="エージェントを worktree でもう一度起動"
              >
                {action === "launch" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Launch agent
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

      {/* Changes (diff) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <span className="text-xs font-medium">Changes</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5"
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
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <DiffView
            diff={diff}
            statusText={statusText}
            loading={diffLoading}
            hasRef={!!ref}
          />
        </ScrollArea>
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
