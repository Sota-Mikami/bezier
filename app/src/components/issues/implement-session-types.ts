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

  sendDesignFeedback: (promptText: string, note?: string) => Promise<void>;

  canImplement: boolean;
  handleImplement: () => Promise<void>;
  handleStart: (message: string) => Promise<void>;
  handleRerun: () => Promise<void>;

  canGenerateVariant: boolean;
  handleGenerateVariant: (ids: string[], context: string) => Promise<void>;
  handlePickVariant: (id: string) => Promise<void>;
  reviseDesignPattern: (promptText: string, note: string) => Promise<void>;
  handleDiscard: () => Promise<void>;
}
