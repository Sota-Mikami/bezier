"use client";

// The LEFT panel of the Issue detail — now PURE CHAT (DEC-052).
//
// The maker talks to the agent here while judging the result on the right
// (Spec / Design / Build). All the git "plumbing" that used to crowd this panel
// moved to where it's relevant: Verify → the Build tab, Commit / Ship (Sync /
// Open PR / Merge) → the issue header, and the occasional controls (agent
// picker, 再 Implement, Discard) → a single ⋯ menu. So this panel is just: a slim
// header (chat + branch + ⋯), the agent terminal (the conversation), and a thin
// status line. The session state is still owned by the shared useImplementSession
// hook so the terminal persists across center-tab switches.

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Sparkles,
  Play,
  GitBranch,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import type { TerminalPaneProps } from "@/components/workspace/terminal";
import type { ImplementSession } from "./use-implement-session";

// xterm-backed terminal — client-only (DOM + CSS), like /workspace.
const TerminalPane = dynamic(() => import("@/components/workspace/terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      Starting terminal…
    </div>
  ),
}) as React.ComponentType<TerminalPaneProps>;

interface IssueAgentPanelProps {
  session: ImplementSession;
}

export function IssueAgentPanel({ session }: IssueAgentPanelProps) {
  const {
    gitRepo,
    ref,
    selectedAgent,
    action,
    error,
    info,
    termMounted,
    termCwd,
    termSpawn,
    termNonce,
    termKey,
    termEventsPath,
    handleTermReady,
    handleTermExit,
    canResume,
    handleResume,
    handleStart,
  } = session;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: チャット + branch + ⋯ */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">チャット</span>
        {ref && (
          <span
            className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground"
            title={ref.branch}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{ref.branch}</span>
          </span>
        )}
        <div className="ml-auto shrink-0">
          <SessionMenu session={session} />
        </div>
      </div>

      {/* Body: the conversation. Terminal when live, else resume, else start. */}
      <div className="min-h-0 flex-1 bg-background">
        {termMounted && termCwd ? (
          <TerminalPane
            key={`${termCwd}#${termNonce}#${termSpawn?.cmd ?? "shell"}`}
            cwd={termCwd}
            spawn={termSpawn}
            sessionKey={termKey}
            eventsPath={termEventsPath}
            onReady={handleTermReady}
            onExit={handleTermExit}
          />
        ) : ref ? (
          <ResumePane canResume={canResume} onResume={() => void handleResume()} />
        ) : (
          <ChatStart
            disabled={!selectedAgent?.available || gitRepo === false}
            busy={action === "implement"}
            gitRepo={gitRepo}
            agentAvailable={!!selectedAgent?.available}
            onSend={(m) => void handleStart(m)}
          />
        )}
      </div>

      {/* Thin status line (errors / confirmations). */}
      {(error || info) && (
        <div className="shrink-0 border-t px-3 py-2">
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="text-xs text-emerald-600 dark:text-emerald-500">{info}</p>
          )}
        </div>
      )}
    </div>
  );
}

// The single ⋯ menu: the occasional controls that used to be buttons — the
// implementation agent picker, re-running the build, and discarding the worktree.
function SessionMenu({ session }: { session: ImplementSession }) {
  const {
    gitRepo,
    ref,
    agents,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgent,
    action,
    handleRerun,
    handleDiscard,
  } = session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="セッション操作"
        title="エージェント / 再 Implement / Discard"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {agents.length === 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              エージェントを検出中…
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuRadioGroup
            value={selectedAgentId ?? ""}
            onValueChange={(v) => setSelectedAgentId(v)}
          >
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              実装エージェント
            </DropdownMenuLabel>
            {agents.map((a) => (
              <DropdownMenuRadioItem
                key={a.id}
                value={a.id}
                disabled={!a.available}
                className="text-xs"
              >
                {a.name}
                {a.comingSoon
                  ? "（coming soon）"
                  : !a.available
                    ? "（not found）"
                    : ""}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}

        {ref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              disabled={!selectedAgent?.available || !!action}
              onClick={() => void handleRerun()}
            >
              <RotateCcw className="size-3.5" />
              編集後の Spec で再 Implement
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
              disabled={!!action}
              onClick={() => void handleDiscard()}
            >
              <Trash2 className="size-3.5" />
              変更を破棄（Discard）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel
                className="font-mono text-[10px] font-normal break-all text-muted-foreground"
                title={ref.path}
              >
                {ref.branch}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}

        {gitRepo === false && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-3" />
                git リポジトリではありません
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Shown when a worktree exists but no live pty (app restarted / issue re-opened):
// offer to resume the prior conversation rather than start over.
function ResumePane({
  canResume,
  onResume,
}: {
  canResume: boolean;
  onResume: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
        <Play className="size-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">セッションは休止中</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        この Issue には worktree があります。前回のエージェント会話を再開できます。
      </p>
      <Button size="sm" className="gap-1.5" disabled={!canResume} onClick={onResume}>
        <Play className="size-3.5" />
        セッションを再開
      </Button>
    </div>
  );
}

// Chat-first start (DEC-023): the entry shown when no worktree exists yet. The
// user types what they want; sending creates the worktree + launches the agent
// seeded with that message (Clarify → Spec → implement, DEC-050).
function ChatStart({
  disabled,
  busy,
  gitRepo,
  agentAvailable,
  onSend,
}: {
  disabled: boolean;
  busy: boolean;
  gitRepo: boolean | null;
  agentAvailable: boolean;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const send = () => {
    const m = draft.trim();
    if (!m || disabled || busy) return;
    onSend(m);
    setDraft("");
  };

  const placeholder =
    gitRepo === false
      ? "このフォルダは git リポジトリではありません"
      : !agentAvailable
        ? "利用可能なエージェントがありません"
        : "やりたいことを書く…（Enter で開始 / Shift+Enter で改行）";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
          <Sparkles className="size-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-foreground">チャットで始める</div>
        <p className="max-w-xs text-xs text-muted-foreground">
          {gitRepo === false ? (
            <>
              Implement には git リポジトリが必要です。リポジトリのフォルダを開いてください。
            </>
          ) : (
            <>
              やりたいことを書くと worktree を作成して AI が起動し、まず 2〜3 問の確認（Clarify）をしてから Spec を一緒に書き起こします。
            </>
          )}
        </p>
      </div>
      <div className="border-t border-border p-3">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          disabled={disabled || busy}
          placeholder={placeholder}
          className="w-full resize-none rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={disabled || busy || !draft.trim()}
            onClick={send}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            開始
          </Button>
        </div>
      </div>
    </div>
  );
}

export default IssueAgentPanel;
