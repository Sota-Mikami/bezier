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
  Sparkles,
  Play,
  GitBranch,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT, tt } from "@/lib/i18n";
import type { TerminalPaneProps } from "@/components/workspace/terminal";
import type { ImplementSession } from "./implement-session-types";
import { NextStepCard } from "./next-step-card";

// xterm-backed terminal — client-only (DOM + CSS), like /workspace.
const TerminalPane = dynamic(() => import("@/components/workspace/terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {tt("agentPanel.startingTerminal")}
    </div>
  ),
}) as React.ComponentType<TerminalPaneProps>;

interface IssueAgentPanelProps {
  session: ImplementSession;
}

export function IssueAgentPanel({ session }: IssueAgentPanelProps) {
  const t = useT();
  const {
    gitRepo,
    ref,
    selectedAgent,
    redetectAgents,
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
      {/* Header: チャット + branch. The issue-level controls (agent / re-implement
          / discard) moved to the title ▾ menu in the top bar (DEC-058). */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{t("agentPanel.chat")}</span>
        {ref && (
          <span
            className="ml-auto flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground"
            title={ref.branch}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{ref.branch}</span>
          </span>
        )}
      </div>

      {/* The AI's suggested next move, surfaced out of the terminal scroll. Keyed by
          issue dir so dismiss state resets when switching issues. */}
      <NextStepCard key={session.issue.dir} session={session} />

      {/* Body: the conversation. Terminal when live, else resume, else start.
          The terminal IS the chat surface — the embedded agent (claude / codex)
          has its own prompt with native @ file refs and / slash commands, so we
          DON'T stack a second composer on top (that read as two inputs; DEC-076
          reverted DEC-075). Bezier ships its shortcuts as agent-native slash
          commands instead (/bezier:verify etc.), installed for the agent to pick
          up — one input, and portable to the user's own terminal. */}
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
          <ResumePane
            canResume={canResume}
            agentAvailable={!!selectedAgent?.available}
            onResume={() => void handleResume()}
            onRedetect={redetectAgents}
          />
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

// Shown when a worktree exists but no live pty (app restarted / issue re-opened):
// offer to resume the prior conversation rather than start over.
function ResumePane({
  canResume,
  agentAvailable,
  onResume,
  onRedetect,
}: {
  canResume: boolean;
  agentAvailable: boolean;
  onResume: () => void;
  onRedetect: () => Promise<boolean>;
}) {
  const t = useT();
  const [redetecting, setRedetecting] = React.useState(false);
  const redetect = async () => {
    if (redetecting) return;
    setRedetecting(true);
    try {
      await onRedetect();
    } finally {
      setRedetecting(false);
    }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
        <Play className="size-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">{t("agentPanel.sessionPaused")}</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        {t("agentPanel.sessionPausedDesc")}
      </p>
      {/* Resume needs the coding agent. When it isn't found, say WHY and offer a
          re-detect, so the maker is never stuck at a silently-disabled button. */}
      {!agentAvailable ? (
        <div className="flex flex-col items-center gap-2">
          <p className="max-w-xs text-xs text-amber-600 dark:text-amber-500">
            {t("agentPanel.agentMissing")}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={redetecting}
            onClick={() => void redetect()}
          >
            {redetecting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            {t("agentPanel.redetectAgent")}
          </Button>
        </div>
      ) : (
        <Button size="sm" className="gap-1.5" disabled={!canResume} onClick={onResume}>
          <Play className="size-3.5" />
          {t("agentPanel.resumeSession")}
        </Button>
      )}
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
  const t = useT();
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
      ? t("agentPanel.placeholderNotGitRepo")
      : !agentAvailable
        ? t("agentPanel.placeholderNoAgent")
        : t("agentPanel.placeholderDefault");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
          <Sparkles className="size-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-foreground">{t("agentPanel.startWithChat")}</div>
        <p className="max-w-xs text-xs text-muted-foreground">
          {gitRepo === false ? (
            <>{t("agentPanel.needGitRepo")}</>
          ) : !agentAvailable ? (
            <>{t("agentPanel.noAgentGuide")}</>
          ) : (
            <>{t("agentPanel.startHint")}</>
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
            {t("agentPanel.start")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default IssueAgentPanel;
