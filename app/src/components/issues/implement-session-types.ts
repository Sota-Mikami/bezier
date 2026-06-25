import type { AgentTool } from "@/lib/agents";
import type { Checkpoint } from "@/lib/git";
import type {
  Issue,
  ThreadEvent,
  WorktreeRef,
} from "@/lib/issues";
import type { AgentState } from "@/lib/pty";

import type { JourneyController } from "./use-journey";
import type { PreviewServer } from "./use-preview-server";
import type { PublishController } from "./use-publish";

export type SessionAction =
  | "implement"
  | "rerun"
  | "variant"
  | "checkpoint"
  | "rollback"
  | "accept"
  | "discard"
  | "sync"
  | "merge"
  | "pr"
  | null;

export interface TermSpawn {
  cmd: string;
  args?: string[];
  /**
   * Run the command INSIDE the user's interactive shell and drop back to that
   * shell when it exits (TQ-1) — so `/exit`-ing the agent leaves a live terminal
   * (you can run it again) instead of a dead pane. The shell + quoting are
   * resolved in TerminalPane.
   */
  wrap?: boolean;
  /** Agent-state detection strategy for this launch (DEC-132): "hooks" (claude),
   *  "idle" (output-quiet ⇒ waiting), or "exit-only". Passed through to the pty. */
  waitingStrategy?: "hooks" | "idle" | "exit-only";
  /** For waitingStrategy="idle": quiet duration (ms) before "waiting". */
  idleWaitingMs?: number;
}

export interface ImplementSession {
  /** The opened repo root + the issue (for design-feedback paths / screenshots). */
  root: string;
  issue: Issue;
  gitRepo: boolean | null;
  ref: WorktreeRef | null;
  /** The opened package's path relative to the worktree/repo root ("" when the
   * opened folder IS the repo toplevel). */
  subPath: string;
  agents: AgentTool[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string) => void;
  selectedAgent: AgentTool | null;
  /** Re-run agent detection (recovery from a transient "no agent"); resolves to
   *  whether any agent is now available. */
  redetectAgents: () => Promise<boolean>;
  action: SessionAction;
  error: string | null;
  info: string | null;

  diff: string;
  statusText: string;
  diffLoading: boolean;
  refreshDiff: (worktreePath: string) => Promise<void>;

  termMounted: boolean;
  termCwd: string | null;
  termSpawn: TermSpawn | undefined;
  termNonce: number;
  termKey: string;
  termEventsPath: string;
  running: boolean;
  agentState: AgentState | null;
  handleTermReady: (id: string) => void;
  handleTermExit: (code: number | null) => void;

  thread: ThreadEvent[];
  canResume: boolean;
  handleResume: () => Promise<void>;

  preview: PreviewServer;
  publish: PublishController;
  journey: JourneyController;

  baseBranch: string;
  /** Base-branch picker (DEC-145): the branch a not-yet-started issue is cut from
   *  (default = repo's current branch), the available branches, and whether the
   *  worktree exists yet (after which the base is pinned/read-only). */
  chosenBase: string;
  setChosenBase: (b: string) => void;
  branches: string[];
  /** Re-fetch origin/* + re-list branches (no terminal needed) so a just-pushed
   *  branch becomes selectable; `refreshingBranches` drives the spinner. */
  refreshBranches: () => Promise<void>;
  refreshingBranches: boolean;
  hasWorktree: boolean;
  behind: number | null;
  ahead: number | null;
  mergeClean: boolean | null;
  syncConflicts: string[];

  checkpoints: Checkpoint[];
  makeCheckpoint: (label?: string) => Promise<void>;
  rollbackTo: (sha: string) => Promise<void>;
  syncMain: () => Promise<void>;
  mergeToMain: () => Promise<void>;
  resolveConflictsWithAI: () => void;

  canOpenPR: boolean;
  prUrl: string | null;
  openPR: () => Promise<void>;

  sendDesignFeedback: (promptText: string, note?: string) => Promise<boolean>;
  /** Paste text into the RUNNING agent's chat (pty) + submit — without restarting it.
   *  Returns false if no agent is live for this issue (caller can fall back). Used by
   *  batched annotations/comments so they land in the ongoing conversation. */
  injectToAgent: (text: string) => Promise<boolean>;
  /** injectToAgent, falling back to a fresh sendDesignFeedback turn when no agent is
   *  live. The shared "send annotation/comment batch" path (no restart when possible). */
  injectOrFeedback: (text: string, note?: string) => Promise<boolean>;

  canImplement: boolean;
  handleImplement: () => Promise<void>;
  handleStart: (message: string) => Promise<void>;
  handleRerun: (opts?: { fresh?: boolean }) => Promise<void>;

  canGenerateVariant: boolean;
  handleGenerateVariant: (ids: string[], context: string) => Promise<void>;
  reviseDesignPattern: (promptText: string, note: string) => Promise<void>;
  handleDiscard: () => Promise<void>;
}
