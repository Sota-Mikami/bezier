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
  gitBehindAhead,
  gitSyncMain,
  gitMergeConflictCheck,
  gitMergeToMain,
  changedPathsFromStatus,
} from "@/lib/git";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { ptyWrite } from "@/lib/pty";
import { usePreviewServer, type PreviewServer } from "./use-preview-server";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type SessionAction =
  | "implement"
  | "rerun"
  | "accept"
  | "discard"
  | "sync"
  | "merge"
  | null;

/** The base branch Issue branches are cut from / merged back into (DEC-009). */
const BASE = "main";

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

  // Merge-safety layer (OPEN-001). behind/ahead vs main, a dry-run conflict
  // verdict that gates Merge-to-main, and the conflicted-file list from a Sync.
  behind: number | null;
  ahead: number | null;
  mergeClean: boolean | null;
  syncConflicts: string[];
  syncMain: () => Promise<void>;
  mergeToMain: () => Promise<void>;
  resolveConflictsWithAI: () => void;

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

  // Merge-safety state (OPEN-001). `behind`/`ahead` vs main; `mergeClean` is the
  // dry-run verdict (null = unknown) that gates Merge-to-main; `syncConflicts`
  // holds the file list from a conflicted Sync.
  const [behind, setBehind] = React.useState<number | null>(null);
  const [ahead, setAhead] = React.useState<number | null>(null);
  const [mergeClean, setMergeClean] = React.useState<boolean | null>(null);
  const [syncConflicts, setSyncConflicts] = React.useState<string[]>([]);

  // Refresh behind/ahead + the dry-run conflict verdict for a worktree. Each
  // probe is independent: a failure (e.g. base ref missing) just clears that
  // signal rather than surfacing an error in the normal flow.
  const loadBehind = React.useCallback(async (worktreePath: string) => {
    try {
      const ba = await gitBehindAhead(worktreePath, BASE);
      setBehind(ba.behind);
      setAhead(ba.ahead);
    } catch {
      setBehind(null);
      setAhead(null);
    }
    try {
      const c = await gitMergeConflictCheck(worktreePath, BASE);
      setMergeClean(c.clean);
    } catch {
      setMergeClean(null);
    }
  }, []);

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
        // And its behind/ahead vs main (merge-safety badge).
        void loadBehind(r.path);
      })
      .catch(() => {
        /* no ref */
      });
    return () => {
      cancelled = true;
    };
  }, [root, issue, loadBehind]);

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
      // Branch is fresh off HEAD here, but main may already be ahead — show it.
      void loadBehind(wt);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [
    gitRepo,
    issue,
    action,
    selectedAgent,
    root,
    onStatusChange,
    launchAgent,
    loadBehind,
  ]);

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
      // Re-evaluate behind/ahead + merge cleanliness now that the branch moved.
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, issue, root, onStatusChange, refreshDiff, loadBehind]);

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
      setBehind(null);
      setAhead(null);
      setMergeClean(null);
      setSyncConflicts([]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, preview, teardownTerminal, root, issue, onStatusChange]);

  // Sync-with-main: merge main INTO the branch (inside the isolated worktree).
  // Clean -> behind goes to 0. Conflict -> surface the file list; the worktree
  // is left conflicted for resolution in the terminal (main never touched).
  const syncMain = React.useCallback(async () => {
    if (!ref || action) return;
    setAction("sync");
    setError(null);
    setInfo(null);
    setSyncConflicts([]);
    try {
      const res = await gitSyncMain(ref.path, BASE);
      await refreshDiff(ref.path);
      await loadBehind(ref.path);
      if (res.ok) {
        setInfo("main を取り込みました（同期済）。");
      } else {
        setSyncConflicts(res.conflicts);
        setError(
          `衝突しました（${res.conflicts.length} ファイル）。右のターミナルで解決して commit してください。`,
        );
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, refreshDiff, loadBehind]);

  // Hand the conflict off to the agent in the worktree terminal (reuses the same
  // launch path as Implement/Re-run). The agent resolves the markers + `git add`;
  // the human concludes the merge via Accept (commit on the branch).
  const resolveConflictsWithAI = React.useCallback(() => {
    if (!ref || action || !selectedAgent?.available) return;
    const files = syncConflicts.join(", ");
    const prompt = [
      `git worktree \`${ref.path}\` で main(\`${BASE}\`) を取り込んだ際にマージ衝突が発生しました。`,
      files ? `衝突ファイル: ${files}。` : "",
      "各ファイルの衝突マーカー (<<<<<<< / ======= / >>>>>>>) を解決し、解決後に `git add` してください（commit は人間が UI の Accept から行います）。",
    ]
      .filter(Boolean)
      .join("\n");
    launchAgent(selectedAgent, ref.path, prompt);
  }, [ref, action, selectedAgent, syncConflicts, launchAgent]);

  // Guarded merge of the branch INTO main (the explicit final step on top of
  // Accept). The Rust guard rejects if main is dirty / the branch is behind or
  // conflicts; the UI also gates the button on behind===0 && mergeClean.
  const mergeToMain = React.useCallback(async () => {
    if (!ref || action) return;
    setAction("merge");
    setError(null);
    setInfo(null);
    try {
      const out = await gitMergeToMain(root, ref.branch);
      const first = out.split("\n").find((l) => l.trim().length > 0) ?? "merged";
      setInfo(`main に merge しました: ${first}`);
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, root, loadBehind]);

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
  };
}
