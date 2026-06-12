"use client";

// v0.5 slice 2.6 — the persistent RIGHT agent panel of the Issue detail.
//
// Always visible in the Issue detail (not buried in a tab): the agent picker
// (claude / codex), the session controls (Implement with AI / Re-run AI /
// Accept / Discard), and the embedded TerminalPane running the agent in the
// issue's worktree (cwd = worktree) — the persistent surface where the user
// converses with the agent while watching the Spec/Design in the center.
//
// All state is owned by the shared useImplementSession hook (parent), so this
// panel and the center Design tab read the same worktree, and the terminal
// stays mounted across Spec⇆Design center-tab switches.

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  GitBranch,
  GitMerge,
  ArrowDownToLine,
  RotateCcw,
  Check,
  Trash2,
  TriangleAlert,
  Sparkles,
  TerminalSquare,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TerminalPaneProps } from "@/components/workspace/terminal";
import type { ImplementSession } from "./use-implement-session";

// xterm-backed terminal — client-only (DOM + CSS), like /workspace.
const TerminalPane = dynamic(() => import("@/components/workspace/terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 p-3 text-xs text-zinc-400">
      <Loader2 className="size-3.5 animate-spin" />
      Starting terminal…
    </div>
  ),
}) as React.ComponentType<TerminalPaneProps>;

interface IssueAgentPanelProps {
  issue: { slots: { spec?: boolean } };
  session: ImplementSession;
}

export function IssueAgentPanel({ issue, session }: IssueAgentPanelProps) {
  const {
    gitRepo,
    ref,
    agents,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgent,
    action,
    error,
    info,
    termMounted,
    termCwd,
    termSpawn,
    termNonce,
    handleTermReady,
    handleTermExit,
    canResume,
    handleResume,
    behind,
    ahead,
    mergeClean,
    syncConflicts,
    syncMain,
    mergeToMain,
    resolveConflictsWithAI,
    canImplement,
    handleImplement,
    handleRerun,
    handleAccept,
    handleDiscard,
  } = session;

  // Merge-to-main is the guarded final step: only when the branch is fully
  // caught up to main (behind 0) AND the dry-run says the merge is clean.
  const canMerge = behind === 0 && mergeClean === true && !action;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <TerminalSquare className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">AI エージェント</span>
        {ref && (
          <Badge
            variant="secondary"
            className="ml-auto gap-1 font-mono text-[10px] font-normal"
          >
            <GitBranch className="size-3" />
            {ref.branch}
          </Badge>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 space-y-3 border-b p-3">
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
          <span
            className="block truncate font-mono text-[11px] text-muted-foreground"
            title={ref.path}
          >
            {ref.path}
          </span>
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
              {/* Resume the prior conversation when no live session is running
                  (app restarted / issue re-opened). */}
              {!termMounted && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!canResume}
                  onClick={() => void handleResume()}
                  title="前回のエージェント会話を再開（claude --continue）"
                >
                  <Play className="size-3.5" />
                  セッションを再開
                </Button>
              )}
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

        {/* Merge-safety layer (OPEN-001): behind-main visibility, Sync (resolve
            in the isolated worktree), guarded Merge-to-main. */}
        {ref && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              {behind === null ? (
                <Badge
                  variant="secondary"
                  className="gap-1 text-[10px] font-normal"
                >
                  <Loader2 className="size-3 animate-spin" />
                  main との差分を確認中…
                </Badge>
              ) : behind === 0 ? (
                <Badge className="gap-1 bg-emerald-600 text-[10px] font-normal text-white hover:bg-emerald-600">
                  <Check className="size-3" />
                  up to date
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="gap-1 text-[10px] font-normal text-amber-700 dark:text-amber-400"
                >
                  <TriangleAlert className="size-3" />
                  {behind} commits behind main
                </Badge>
              )}
              {ahead != null && ahead > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {ahead} ahead
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!!action}
                onClick={() => void syncMain()}
                title="main を worktree の branch に取り込む（衝突は worktree 内で解決）"
              >
                {action === "sync" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="size-3.5" />
                )}
                Sync with main
              </Button>
              {/* span wrapper so the tooltip shows even while the button is
                  disabled (disabled buttons don't emit hover events). */}
              <span title={canMerge ? "main に merge します" : "先に Sync with main"}>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!canMerge}
                  onClick={() => void mergeToMain()}
                >
                  {action === "merge" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="size-3.5" />
                  )}
                  Merge to main
                </Button>
              </span>
            </div>

            {syncConflicts.length > 0 && (
              <div className="space-y-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-2">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  衝突 {syncConflicts.length} ファイル — 右のターミナルで解決して commit してください
                </p>
                <ul className="space-y-0.5">
                  {syncConflicts.map((f) => (
                    <li
                      key={f}
                      className="truncate font-mono text-[10px] text-muted-foreground"
                      title={f}
                    >
                      {f}
                    </li>
                  ))}
                </ul>
                {selectedAgent?.available && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!!action}
                    onClick={() => resolveConflictsWithAI()}
                  >
                    <Sparkles className="size-3.5" />
                    AI に解決を依頼
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-xs text-emerald-600 dark:text-emerald-500">{info}</p>
        )}
      </div>

      {/* Embedded terminal (agent runs here, cwd = worktree). Stays mounted
          across Spec⇆Design center-tab switches so the session persists. */}
      <div className="min-h-0 flex-1 bg-[#0a0a0a]">
        {termMounted && termCwd ? (
          <TerminalPane
            key={`${termCwd}#${termNonce}#${termSpawn?.cmd ?? "shell"}`}
            cwd={termCwd}
            spawn={termSpawn}
            onReady={handleTermReady}
            onExit={handleTermExit}
          />
        ) : ref ? (
          // A worktree exists but no live pty (app restarted / issue re-opened):
          // offer to resume the prior conversation rather than start over.
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900">
              <Play className="size-4 text-zinc-400" />
            </div>
            <div className="text-sm font-medium text-zinc-200">
              セッションは休止中
            </div>
            <p className="max-w-xs text-xs text-zinc-400">
              この Issue には worktree があります。前回のエージェント会話を再開できます。
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!canResume}
              onClick={() => void handleResume()}
            >
              <Play className="size-3.5" />
              セッションを再開
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900">
              <Sparkles className="size-4 text-zinc-400" />
            </div>
            <div className="text-sm font-medium text-zinc-200">
              セッション未開始
            </div>
            <p className="max-w-xs text-xs text-zinc-400">
              「Implement with AI」で branch + worktree を作成し、選択したエージェントを worktree 内で起動します。ここで Spec や Design について対話できます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default IssueAgentPanel;
