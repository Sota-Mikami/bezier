"use client";

// v0.5 slice 2.6 — the shared Issue implementation session.
//
// Lifts the worktree/agent/preview state that used to live inside ImplementPanel
// up to the Issue-detail level so it can be shared by BOTH surfaces that now
// render it separately:
//   - the persistent RIGHT agent panel (issue-agent-panel.tsx): agent picker +
//     Implement/Re-run/Accept/Discard controls + the embedded TerminalPane
//     (cwd = worktree), and
//   - the CENTER "Design" tab (design-review.tsx): the Preview (iframe) ⇆ Diff.
//
// Both read the SAME WorktreeRef + PreviewServer, so the preview iframe and the
// terminal point at one worktree. The hook is instantiated ONCE per issue in the
// detail view, so the terminal/preview lifecycle survives Spec⇆Design center-tab
// switches (the whole point of the relocation) and only tears down on Discard /
// leaving the issue. The behaviors (Implement/Re-run/Accept/Discard, the handoff
// passed as the agent's positional prompt arg) are unchanged from slice 2/2.5.

import * as React from "react";

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
  changedPathsFromStatus,
} from "@/lib/git";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { ptyWrite } from "@/lib/pty";
import { usePreviewServer, type PreviewServer } from "./use-preview-server";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type SessionAction = "implement" | "rerun" | "accept" | "discard" | null;

export interface TermSpawn {
  cmd: string;
  args?: string[];
}

export interface ImplementSession {
  gitRepo: boolean | null;
  ref: WorktreeRef | null;
  agents: AgentTool[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string) => void;
  selectedAgent: AgentTool | null;
  action: SessionAction;
  error: string | null;
  info: string | null;

  diff: string;
  statusText: string;
  diffLoading: boolean;
  refreshDiff: (worktreePath: string) => Promise<void>;

  // Embedded terminal (agent runs here, cwd = worktree).
  termMounted: boolean;
  termCwd: string | null;
  termSpawn: TermSpawn | undefined;
  termNonce: number;
  handleTermReady: (id: string) => void;

  // Dev-server preview (iframe), shared with the Design tab.
  preview: PreviewServer;

  canImplement: boolean;
  handleImplement: () => Promise<void>;
  handleRerun: () => Promise<void>;
  handleAccept: () => Promise<void>;
  handleDiscard: () => Promise<void>;
}

export function useImplementSession(
  root: string,
  issue: Issue,
  onStatusChange: (status: IssueStatus) => void,
): ImplementSession {
  const [gitRepo, setGitRepo] = React.useState<boolean | null>(null);
  const [ref, setRef] = React.useState<WorktreeRef | null>(null);
  const [agents, setAgents] = React.useState<AgentTool[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(
    null,
  );
  const [action, setAction] = React.useState<SessionAction>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [diff, setDiff] = React.useState("");
  const [statusText, setStatusText] = React.useState("");
  const [diffLoading, setDiffLoading] = React.useState(false);

  // Dev-server lifecycle (the Preview). Hook-owned so it survives the
  // Preview⇆Diff toggle AND the Spec⇆Design center-tab switch, and can be
  // stopped on Discard. Keyed off the shared worktree path.
  const preview = usePreviewServer(root, ref?.path ?? null);

  // Embedded terminal (one at a time). termCwd/termSpawn/termNonce mirror the
  // /workspace pattern; pendingInput is written once the pty is ready.
  const [termMounted, setTermMounted] = React.useState(false);
  const [termCwd, setTermCwd] = React.useState<string | null>(null);
  const [termSpawn, setTermSpawn] = React.useState<TermSpawn | undefined>(
    undefined,
  );
  const [termNonce, setTermNonce] = React.useState(0);
  const pendingInputRef = React.useRef<string | null>(null);

  // Detect git + load any existing worktree ref + its diff (resume an
  // in-progress issue). Keyed by issue.id at the detail call site (fresh mount
  // per issue), so we only set state from async continuations.
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

  const handleImplement = React.useCallback(async () => {
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
  }, [gitRepo, issue, action, selectedAgent, root, onStatusChange, launchAgent]);

  // Re-run AI on the SAME worktree with a follow-up handoff built from the
  // (possibly edited) issue.md + spec.md (DEC-012 review↔refine cycle).
  const handleRerun = React.useCallback(async () => {
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
  }, [ref, action, selectedAgent, root, issue, launchAgent]);

  const handleAccept = React.useCallback(async () => {
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
  }, [ref, action, issue, root, onStatusChange, refreshDiff]);

  const handleDiscard = React.useCallback(async () => {
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
  }, [ref, action, preview, teardownTerminal, root, issue, onStatusChange]);

  const canImplement =
    gitRepo === true && issue.slots.spec && !!selectedAgent?.available && !action;

  return {
    gitRepo,
    ref,
    agents,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgent,
    action,
    error,
    info,
    diff,
    statusText,
    diffLoading,
    refreshDiff,
    termMounted,
    termCwd,
    termSpawn,
    termNonce,
    handleTermReady,
    preview,
    canImplement,
    handleImplement,
    handleRerun,
    handleAccept,
    handleDiscard,
  };
}
