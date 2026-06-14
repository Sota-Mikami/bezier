"use client";

// v0.5 slice 2.6 — the shared Issue implementation session.
//
// Lifts the worktree/agent/preview state that used to live inside ImplementPanel
// up to the Issue-detail level so it can be shared by BOTH surfaces that now
// render it separately:
//   - the persistent RIGHT agent panel (issue-agent-panel.tsx): agent picker +
//     Implement/Re-run/Accept/Discard controls + the embedded TerminalPane
//     (cwd = worktree), and
//   - the CENTER "Build" tab (build-review.tsx): Preview (iframe) ⇆ Diff ⇆ Verify,
//     and the "Design" tab (design-variants.tsx): throwaway HTML 別案 (DEC-051).
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
  buildVariantHandoff,
  buildPrBody,
  updateIssueMeta,
  readThread,
  appendThreadEvent,
  type Issue,
  type IssueStatus,
  type WorktreeRef,
  type ThreadEvent,
  type ThreadEventType,
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
  gitRemoteUrl,
  gitPush,
  ghPrCreate,
  ghPrState,
  gitRepoStatus,
  changedPathsFromStatus,
} from "@/lib/git";
import { detectAgents, type AgentTool } from "@/lib/agents";
import {
  listVariants,
  writeAdoptedDesign,
  syncSpecDesignSection,
} from "@/lib/variants";
import { getSettings, resolveDark } from "@/lib/settings";
import {
  ptyWrite,
  commandExists,
  ptyLookup,
  ptyKillKey,
  ptyStatuses,
  agentHookSettings,
  type AgentState,
} from "@/lib/pty";
import { confirmDialog } from "@/lib/ipc";
import { usePreviewServer, type PreviewServer } from "./use-preview-server";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type SessionAction =
  | "implement"
  | "rerun"
  | "variant"
  | "accept"
  | "discard"
  | "sync"
  | "merge"
  | "pr"
  | null;

/** The base branch Issue branches are cut from / merged back into (DEC-047). */
const BASE = "main";

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
   * opened folder IS the repo toplevel). The Code browser roots its tree at
   * <worktree>/<subPath> — the folder you actually opened, not the whole
   * monorepo. */
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

  // Embedded terminal (agent runs here, cwd = worktree).
  termMounted: boolean;
  termCwd: string | null;
  termSpawn: TermSpawn | undefined;
  termNonce: number;
  /** Stable key for the persistent agent pty (the issue id). */
  termKey: string;
  /** Path to the agent's hook-events file (deterministic waiting, DEC-028). */
  termEventsPath: string;
  /** A background agent (pty) is currently running for this issue (DEC-027). */
  running: boolean;
  /** Raw agent state (running / waiting / done / error / null), so callers can
   * detect a TURN ending (running → waiting) vs the process exiting (DEC-045). */
  agentState: AgentState | null;
  handleTermReady: (id: string) => void;
  handleTermExit: (code: number | null) => void;

  // Durable activity thread (chat-first loop): structured events rendered in the
  // LEFT thread, persisted to .bezier/issues/<id>/thread.json (survives the
  // volatile pty + Discard).
  thread: ThreadEvent[];

  // Session resume: when a worktree exists but no live pty is running, relaunch
  // `claude --continue` to pick the prior conversation back up.
  canResume: boolean;
  handleResume: () => Promise<void>;

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

  // Open-PR finalize (DEC-015). `canOpenPR` = a GitHub remote + `gh` available,
  // so the team-safe Open-PR path is the primary finalize; `prUrl` is the opened
  // PR's URL (persisted on the WorktreeRef, so it survives re-opening the issue).
  canOpenPR: boolean;
  prUrl: string | null;
  openPR: () => Promise<void>;

  /**
   * Send design feedback to the agent (DEC-045). `promptText` is the combined
   * batch of annotations (numbered, with a screenshot reference); it continues
   * the issue's conversation as a fix turn. Throws if no worktree / agent.
   */
  sendDesignFeedback: (promptText: string, note?: string) => Promise<void>;

  canImplement: boolean;
  handleImplement: () => Promise<void>;
  /** Chat-first start: begin a session from a free-text message (DEC-023). */
  handleStart: (message: string) => Promise<void>;
  handleRerun: () => Promise<void>;
  /**
   * Design "考える層" (DEC-051): generate / adopt throwaway HTML variants via the
   * live agent. `handleGenerateVariant(nextId, context)` writes the next
   * design/<id>.html; `handlePickVariant(id)` adopts a direction and asks the
   * agent to implement it in the real Build. Available once a worktree exists.
   */
  canGenerateVariant: boolean;
  handleGenerateVariant: (ids: string[], context: string) => Promise<void>;
  handlePickVariant: (id: string) => Promise<void>;
  /**
   * Revise a Design wireframe from annotations (DEC-056): the agent edits the
   * design/NN.html the annotations were drawn on (NOT code). Wired to the shared
   * AnnotationLayer's "design" surface. The prompt already names the file.
   */
  reviseDesignPattern: (promptText: string, note: string) => Promise<void>;
  handleAccept: () => Promise<void>;
  handleDiscard: () => Promise<void>;
}

export function useImplementSession(
  root: string,
  issue: Issue,
  onStatusChange: (status: IssueStatus) => void,
): ImplementSession {
  // The agent's hook-events file: Claude appends here (Stop/Notification hooks)
  // when it awaits the user; the backend watches it for "waiting" (DEC-028).
  const eventsPath = `${root.replace(/\/+$/, "")}/.bezier/agent-events/${issue.id}`;

  const [gitRepo, setGitRepo] = React.useState<boolean | null>(null);
  // Monorepo support (DEC-039): when the opened folder (`root`) is a SUBFOLDER
  // of the git repo, `subPath` is its path relative to the repo toplevel (""
  // when root IS the toplevel). Worktrees are cut off the toplevel (git does
  // this automatically), but the agent's cwd + the preview are scoped to
  // <worktree>/<subPath> — the package you actually opened. git ops (diff/
  // commit) stay on the worktree root (changes only land in subPath anyway).
  const [subPath, setSubPath] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    gitRepoStatus(root)
      .then((st) => {
        if (cancelled || !st.isRepo || !st.toplevel) return;
        const top = st.toplevel.replace(/\/+$/, "");
        const r = root.replace(/\/+$/, "");
        setSubPath(r.startsWith(top + "/") ? r.slice(top.length + 1) : "");
      })
      .catch(() => {
        /* leave "" */
      });
    return () => {
      cancelled = true;
    };
  }, [root]);
  // The agent's working directory inside a worktree: scoped to the opened
  // subfolder for monorepos (= the worktree root when not a subfolder).
  const workDir = React.useCallback(
    (worktreePath: string) =>
      subPath ? `${worktreePath}/${subPath}` : worktreePath,
    [subPath],
  );

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

  // Open-PR finalize (DEC-015). `canOpenPR` is detected once a worktree exists
  // (GitHub remote + `gh` available); `prUrl` mirrors the WorktreeRef's persisted
  // PR link so a re-opened issue still shows it.
  const [canOpenPR, setCanOpenPR] = React.useState(false);
  const [prUrl, setPrUrl] = React.useState<string | null>(null);

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
  const preview = usePreviewServer(
    root,
    ref ? workDir(ref.path) : null,
    issue.id,
  );

  // Embedded terminal (one at a time). termCwd/termSpawn/termNonce mirror the
  // /workspace pattern; pendingInput is written once the pty is ready.
  const [termMounted, setTermMounted] = React.useState(false);
  const [termCwd, setTermCwd] = React.useState<string | null>(null);
  const [termSpawn, setTermSpawn] = React.useState<TermSpawn | undefined>(
    undefined,
  );
  const [termNonce, setTermNonce] = React.useState(0);
  const pendingInputRef = React.useRef<string | null>(null);

  // Durable activity thread (loaded once per issue; appended on each action).
  const [thread, setThread] = React.useState<ThreadEvent[]>([]);

  // Resume bookkeeping. `resumeStartRef` is the ms timestamp of the LAST resume
  // launch (null = the last launch was not a resume); a quick non-zero exit
  // means `claude --continue` had no prior session, so we fall back to a fresh
  // seed launch. `refRef` mirrors the latest worktree ref so the exit handler
  // (captured once by the terminal) reads a current value.
  const resumeStartRef = React.useRef<number | null>(null);
  const refRef = React.useRef<WorktreeRef | null>(null);
  React.useEffect(() => {
    refRef.current = ref;
  }, [ref]);

  // Auto-resume bookkeeping. Set true as soon as ANY launch happens for this
  // issue (implement/rerun/resume), so the auto-resume effect fires at most once
  // per issue-detail mount — and never re-launches after the user has quit the
  // agent on their own. The hook re-instantiates per issue (fresh mount), so this
  // resets to false each time you open a different issue.
  const autoResumedRef = React.useRef(false);

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
        setPrUrl(r.prUrl ?? null);
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

  // Live "running" signal for the derived state (DEC-027): the agent session is
  // ALIVE (running or waiting for input) — not a lingering exited one. Uses
  // pty_statuses so a finished agent (which stays in the map for the inbox)
  // doesn't keep the badge green.
  const [running, setRunning] = React.useState(false);
  const [agentState, setAgentState] = React.useState<AgentState | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const all = await ptyStatuses().catch(() => []);
      if (cancelled) return;
      const mine = all.find((s) => s.key === issue.id);
      setAgentState(mine?.state ?? null);
      setRunning(mine?.state === "running" || mine?.state === "waiting");
    };
    void tick();
    const h = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [issue.id]);

  // Auto-"done" (DEC-027): once this issue's PR is MERGED on the platform, mark
  // it merged. Best-effort, checked when a PR link is present.
  const refPrUrl = ref?.prUrl ?? null;
  const refBranch = ref?.branch ?? null;
  React.useEffect(() => {
    if (!refPrUrl || !refBranch) return;
    // Already merged → do NOT re-check. Re-checking loops forever and floods
    // `gh pr view`: onStatusChange("merged") makes a fresh `issue` object, which
    // (being an effect dep) re-fires this effect, which calls onStatusChange
    // again… For a merged issue that's a runaway loop of GitHub network calls,
    // which is exactly what made "完了済み Issue があると激重" (DEC-070).
    if (issue.status === "merged") return;
    let cancelled = false;
    (async () => {
      const state = await ghPrState(root, refBranch).catch(() => "");
      if (cancelled || state !== "MERGED") return;
      await updateIssueMeta(root, issue, { status: "merged" }).catch(() => {});
      onStatusChange("merged");
    })();
    return () => {
      cancelled = true;
    };
  }, [refPrUrl, refBranch, root, issue, onStatusChange]);

  // Detect installed agents once.
  React.useEffect(() => {
    let cancelled = false;
    detectAgents()
      .then((found) => {
        if (cancelled) return;
        setAgents(found);
        // Prefer the user's default agent (Settings, DEC-043) when it's
        // available; otherwise fall back to the first available one.
        const preferredId = getSettings().defaultAgentId;
        const preferred = preferredId
          ? found.find((a) => a.id === preferredId && a.available)
          : undefined;
        const pick = preferred ?? found.find((a) => a.available);
        setSelectedAgentId(pick ? pick.id : null);
      })
      .catch(() => {
        /* none */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the durable activity thread once per issue.
  React.useEffect(() => {
    let cancelled = false;
    readThread(root, issue)
      .then((evts) => {
        if (!cancelled) setThread(evts);
      })
      .catch(() => {
        /* no thread yet */
      });
    return () => {
      cancelled = true;
    };
  }, [root, issue]);

  // Detect whether the team-safe Open-PR finalize is available: a worktree
  // exists, the repo has a GitHub `origin` remote, and `gh` is installed. Probed
  // when a worktree appears; failures (no remote / no gh) leave it false so only
  // the solo Merge-to-main path is offered.
  const hasRef = !!ref;
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // No worktree yet -> nothing to finalize, so no Open-PR affordance.
      if (!hasRef) {
        if (!cancelled) setCanOpenPR(false);
        return;
      }
      try {
        const hasGh = await commandExists("gh");
        if (!hasGh) {
          if (!cancelled) setCanOpenPR(false);
          return;
        }
        await gitRemoteUrl(root); // Err when no origin remote
        if (!cancelled) setCanOpenPR(true);
      } catch {
        if (!cancelled) setCanOpenPR(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasRef, root]);

  // Append a structured event to the durable thread + reflect it in state.
  // Best-effort: a write failure must never break the underlying action.
  const logEvent = React.useCallback(
    async (
      type: ThreadEventType,
      note?: string,
      extra?: Partial<Pick<ThreadEvent, "changedPaths" | "branch">>,
    ) => {
      try {
        const next = await appendThreadEvent(root, issue, {
          type,
          at: new Date().toISOString(),
          ...(note ? { note } : {}),
          ...(extra ?? {}),
        });
        setThread(next);
      } catch {
        /* thread is advisory; ignore persistence failures */
      }
    },
    [root, issue],
  );

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const launchAgent = React.useCallback(
    (
      agent: AgentTool,
      cwd: string,
      opts: { prompt?: string; resume?: boolean },
    ) => {
      // Pass the handoff text as the agent's positional prompt arg
      // (`claude "<prompt>"` starts an interactive session seeded with it). This
      // is reliable + visible, unlike typing into the TUI after a fixed delay
      // (which raced the TUI's input loop and got dropped), and it avoids the
      // agent needing to read a handoff file that lives in the main repo while it
      // runs in the external worktree.
      //
      // For claude specifically we also pass `--add-dir <issue.dir>` so the agent
      // can read+write the issue's spec.md (which lives in the MAIN repo's
      // .bezier tree, OUTSIDE this worktree) — that closes the chat⇆spec loop.
      // `--continue` resumes the prior conversation (the exit handler falls back
      // to a fresh seed if there is none).
      //
      // ORDER MATTERS: claude's `--add-dir <directories...>` is VARIADIC, so it
      // greedily swallows every following arg as a directory — including the
      // prompt. So the positional prompt must come FIRST and `--add-dir` LAST
      // (with `<dir>` as the only trailing arg it can consume):
      //   `claude "<prompt>" [--continue] --add-dir <dir>`
      // Other agents (codex) keep the bare positional prompt.
      const isClaude = agent.id === "claude";
      const args: string[] = [];
      if (opts.prompt) args.push(opts.prompt);
      if (isClaude) {
        if (opts.resume) args.push("--continue");
        // Wire Stop/Notification hooks → the events file (deterministic "agent is
        // awaiting you", DEC-028) AND match Claude's TUI theme to the terminal
        // background so its output stays legible in light mode (DEC-034). Follows
        // the resolved app theme (Settings override, not just the OS; DEC-043).
        const dark = resolveDark();
        args.push(
          "--settings",
          agentHookSettings(eventsPath, dark ? "dark" : "light"),
        );
        args.push("--add-dir", issue.dir);
      }
      // Any launch counts as "the agent has been started for this issue", so the
      // auto-resume-on-entry effect won't fire again (e.g. after the user quits).
      autoResumedRef.current = true;
      // Remember whether THIS launch is a resume so a quick failure can fall back.
      resumeStartRef.current = opts.resume ? Date.now() : null;
      setTermCwd(cwd);
      setTermSpawn({ cmd: agent.bin, args });
      setTermMounted(true);
      setTermNonce((n) => n + 1);
    },
    [issue.dir, eventsPath],
  );

  // Build a fresh seed handoff and launch it on an existing worktree. Used by the
  // resume fallback (when `claude --continue` finds no prior session). Kept in a
  // ref so the terminal's once-captured exit handler can call the latest closure.
  const seedLaunch = React.useCallback(
    async (worktreePath: string) => {
      if (!selectedAgent?.available) return;
      const wd = workDir(worktreePath);
      const { content } = await buildImplementHandoff(root, issue, wd, {
        subPath,
      });
      launchAgent(selectedAgent, wd, { prompt: content });
    },
    [selectedAgent, root, issue, launchAgent, workDir, subPath],
  );
  const seedLaunchRef = React.useRef(seedLaunch);
  React.useEffect(() => {
    seedLaunchRef.current = seedLaunch;
  }, [seedLaunch]);

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

  // Resume fallback: `claude --continue` exits quickly with a non-zero code when
  // there is no prior session to continue. In that case start a fresh seed launch
  // on the same worktree so the user isn't stranded. A clean/long-running exit
  // (the user finishing or quitting a real session) is left alone. Stable
  // identity (reads refs) so the terminal captures it once per launch.
  const handleTermExit = React.useCallback((code: number | null) => {
    const startedAt = resumeStartRef.current;
    resumeStartRef.current = null;
    const r = refRef.current;
    if (startedAt == null || !r) return; // last launch wasn't a resume
    const quick = Date.now() - startedAt < 6000;
    if (quick && code !== 0) {
      setInfo(
        "前回のセッションを再開できなかったため、新規セッションを開始しました。",
      );
      void seedLaunchRef.current(r.path);
    }
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
      const { content } = await buildImplementHandoff(root, issue, workDir(wt), {
        subPath,
      });
      setRef(newRef);
      launchAgent(selectedAgent, workDir(wt), { prompt: content });
      void logEvent("implement");
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
    logEvent,
    workDir,
    subPath,
  ]);

  // Chat-first start (DEC-023): begin from a free-text message instead of a
  // pre-written spec. Same worktree setup as Implement, but the handoff seeds the
  // agent with the user's first message and asks it to (1) draft the spec, (2)
  // title the issue, then (3) implement. Unlike handleImplement it does NOT
  // require a spec to exist — the agent writes it.
  const handleStart = React.useCallback(
    async (message: string) => {
      const msg = message.trim();
      if (!gitRepo || action || !msg) return;
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
        const { content } = await buildImplementHandoff(root, issue, workDir(wt), {
          userMessage: msg,
          subPath,
        });
        setRef(newRef);
        launchAgent(selectedAgent, workDir(wt), { prompt: content });
        void logEvent("implement", "チャット開始");
        void loadBehind(wt);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [
      gitRepo,
      issue,
      action,
      selectedAgent,
      root,
      onStatusChange,
      launchAgent,
      loadBehind,
      logEvent,
      workDir,
      subPath,
    ],
  );

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
      // Stop any background agent still running for this issue so the re-run is
      // the single live session (otherwise we'd spawn a 2nd pty for the key).
      await ptyKillKey(issue.id).catch(() => {});
      const { content } = await buildImplementHandoff(root, issue, workDir(ref.path), {
        followUp: true,
        subPath,
      });
      launchAgent(selectedAgent, workDir(ref.path), { prompt: content });
      void logEvent("rerun");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, selectedAgent, root, issue, launchAgent, logEvent, workDir, subPath]);

  // Design 別案を作る (DEC-053/054): one agent turn that writes N throwaway
  // grayscale WIREFRAMES (design/NN-slug.html), each a different direction — the
  // divergence half of the hybrid. Works BEFORE Build (no worktree needed, like
  // Spec): with no worktree the agent runs in the ISSUE FOLDER (issue.dir) — it's
  // stack-independent so it never touches the repo, and issue.dir is gitignored
  // (safe) while CLAUDE.md is still inherited upward. With a worktree it runs
  // there and continues the chat. The wireframes land in issue.dir/design; the
  // Design tab polls for them.
  const handleGenerateVariant = React.useCallback(
    async (ids: string[], context: string) => {
      if (action || ids.length === 0) return;
      if (!selectedAgent?.available) {
        setError("利用可能なエージェント (claude / codex) が見つかりません。");
        return;
      }
      // Pre-Build: run in the issue folder. Post-Build: run in the worktree and
      // continue the existing conversation.
      const cwd = ref ? workDir(ref.path) : issue.dir;
      setAction("variant");
      setError(null);
      setInfo(null);
      try {
        await ptyKillKey(issue.id).catch(() => {});
        const { content } = await buildVariantHandoff(root, issue, cwd, {
          ids,
          context,
        });
        launchAgent(selectedAgent, cwd, { prompt: content, resume: !!ref });
        void logEvent(
          "variant",
          `案 ${ids.join("/")} を生成${context ? `（${context}）` : ""}`,
        );
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [ref, action, selectedAgent, root, issue, launchAgent, logEvent, workDir],
  );

  // Adopt a Design direction (DEC-051/054): implement the chosen wireframe in the
  // REAL Build (worktree code = the convergence half of the hybrid). This is the
  // design→build PROMOTION: if no worktree exists yet (designs were explored
  // pre-Build), create the branch + worktree first, then build the picked
  // direction; if one already exists, continue the conversation. The agent reads
  // the picked wireframe via `--add-dir issue.dir`.
  const handlePickVariant = React.useCallback(
    async (id: string) => {
      if (action) return;
      if (!selectedAgent?.available) {
        setError("利用可能なエージェント (claude / codex) が見つかりません。");
        return;
      }
      const pickPrompt = [
        `デザインの方向として **案 ${id}（design/${id}-*.html）を採用** します。`,
        `\`${issue.dir}/design/\` の案 ${id} を読み、その方向に沿って **この worktree 内の実コード（実物の DS）で実装/調整** してください（受入基準を満たすことをゴールに）。`,
        "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
      ].join("\n");
      setAction("variant");
      setError(null);
      setInfo(null);
      try {
        // Record the DECISION (durable) + mirror it into spec.md (DEC-056).
        await writeAdoptedDesign(issue, id).catch(() => {});
        await listVariants(issue)
          .then((vs) => syncSpecDesignSection(issue, vs, id))
          .catch(() => {});
        await ptyKillKey(issue.id).catch(() => {});
        if (ref) {
          // Already building — continue in the worktree.
          launchAgent(selectedAgent, workDir(ref.path), {
            prompt: pickPrompt,
            resume: true,
          });
          void logEvent("variant", `案 ${id} を採用 → Implement`);
        } else {
          // Promote: pre-Build design → create the worktree, then build.
          if (!gitRepo) {
            setError("Implement には git リポジトリが必要です。");
            setAction(null);
            return;
          }
          const branch = branchName(issue);
          const wt = await worktreeDir(root, issue);
          await gitWorktreeAdd(root, branch, wt);
          const newRef: WorktreeRef = { branch, path: wt, baseSHA: "" };
          await writeWorktreeRef(issue, newRef);
          await updateIssueMeta(root, issue, { status: "in-progress" });
          onStatusChange("in-progress");
          setRef(newRef);
          launchAgent(selectedAgent, workDir(wt), { prompt: pickPrompt });
          void logEvent("variant", `案 ${id} を採用 → Implement 開始`);
          void loadBehind(wt);
        }
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [
      ref,
      action,
      gitRepo,
      selectedAgent,
      root,
      issue,
      launchAgent,
      logEvent,
      workDir,
      onStatusChange,
      loadBehind,
    ],
  );

  // Revise a Design wireframe from annotations (DEC-056). Same launch shape as
  // generation (cwd = worktree if building, else the issue folder; resume only
  // when there's a build session). The prompt (built by the AnnotationLayer's
  // design surface) already names design/NN.html and forbids touching code.
  const reviseDesignPattern = React.useCallback(
    async (promptText: string, note: string) => {
      if (!selectedAgent?.available) {
        throw new Error(
          "利用可能なエージェント (claude / codex) が見つかりません。",
        );
      }
      const cwd = ref ? workDir(ref.path) : issue.dir;
      await ptyKillKey(issue.id).catch(() => {});
      launchAgent(selectedAgent, cwd, { prompt: promptText, resume: !!ref });
      void logEvent("variant", note);
    },
    [ref, selectedAgent, issue, launchAgent, logEvent, workDir],
  );

  // Resume the prior agent conversation in the existing worktree. For claude this
  // is `claude --continue --add-dir <issue.dir>`; if there's no session to
  // continue the exit handler falls back to a fresh seed. Other agents have no
  // continue semantics here, so they get a fresh seed launch directly.
  const handleResume = React.useCallback(async () => {
    if (!ref || action) return;
    if (!selectedAgent?.available) {
      setError("利用可能なエージェント (claude / codex) が見つかりません。");
      return;
    }
    setError(null);
    setInfo(null);
    if (selectedAgent.id === "claude") {
      launchAgent(selectedAgent, workDir(ref.path), { resume: true });
    } else {
      await seedLaunch(ref.path);
    }
    void logEvent("resume");
  }, [ref, action, selectedAgent, launchAgent, seedLaunch, logEvent, workDir]);

  // Auto-resume on entry: when you open an issue that already has a worktree
  // (so there's a prior agent session to continue), relaunch `claude --continue`
  // automatically — no need to press "セッションを再開". The TUI replays the prior
  // conversation into the terminal, so opening an in-progress issue lands you
  // back in the live chat. Fires at most once per issue mount (autoResumedRef is
  // flipped by launchAgent), and only when nothing is already running. If there
  // turns out to be no session to continue, the exit handler seeds a fresh one.
  React.useEffect(() => {
    if (autoResumedRef.current) return;
    if (!ref || termMounted || action) return;
    if (!selectedAgent?.available) return;
    // Mark immediately so a re-render can't double-fire.
    autoResumedRef.current = true;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      // If a background agent is STILL RUNNING for this issue (you navigated
      // away and came back), reattach to it — mount the terminal pointing at the
      // worktree with NO spawn, and TerminalPane (sessionKey=issue.id) reattaches
      // to the live pty + replays its backlog. Otherwise fall back to resuming
      // the prior conversation (`claude --continue`).
      const live = await ptyLookup(issue.id).catch(() => null);
      if (cancelled) return;
      if (live) {
        setError(null);
        setInfo(null);
        setTermCwd(workDir(ref.path));
        setTermSpawn(undefined);
        setTermMounted(true);
        setTermNonce((n) => n + 1);
      } else {
        void handleResume();
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ref, termMounted, action, selectedAgent, handleResume, issue.id, workDir]);

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
      // Commit is a checkpoint on the branch — NOT a merge. Stay in-progress;
      // the issue only becomes "merged" on the actual Merge-to-main (or when the
      // PR merges on the platform, which the user reflects via the status menu).
      setInfo(`commit ${sha.slice(0, 9)} を ${ref.branch} に作成しました。`);
      // The durable record of "what changed / where" lives in thread.json
      // (DEC-014/A) — the accept event carries the committed paths + branch.
      void logEvent("accept", `commit ${sha.slice(0, 9)}`, {
        changedPaths: changed,
        branch: ref.branch,
      });
      await refreshDiff(ref.path);
      // Re-evaluate behind/ahead + merge cleanliness now that the branch moved.
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, issue, refreshDiff, loadBehind, logEvent]);

  const handleDiscard = React.useCallback(async () => {
    if (!ref || action) return;
    const ok = await confirmDialog(
      "worktree と branch を破棄し、Issue を open に戻します。",
      { title: "変更を破棄", okLabel: "破棄", cancelLabel: "キャンセル" },
    );
    if (!ok) return;
    setAction("discard");
    setError(null);
    setInfo(null);
    try {
      // Stop the dev server, kill the (now persistent) background agent, and
      // unmount the terminal first so nothing holds the worktree open while git
      // removes it. teardownTerminal no longer kills the pty (it persists), so
      // ptyKillKey is what actually stops the agent on Discard.
      await preview.stop();
      await ptyKillKey(issue.id).catch(() => {});
      teardownTerminal();
      await gitWorktreeRemove(root, ref.path);
      await gitBranchDelete(root, ref.branch).catch(() => {
        /* branch may already be gone */
      });
      await clearWorktreeRef(issue);
      await updateIssueMeta(root, issue, { status: "open" });
      onStatusChange("open");
      void logEvent("discard");
      setRef(null);
      setDiff("");
      setStatusText("");
      setBehind(null);
      setAhead(null);
      setMergeClean(null);
      setSyncConflicts([]);
      setPrUrl(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, preview, teardownTerminal, root, issue, onStatusChange, logEvent]);

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
        void logEvent("sync");
      } else {
        setSyncConflicts(res.conflicts);
        setError(
          `衝突しました（${res.conflicts.length} ファイル）。右のターミナルで解決して commit してください。`,
        );
        void logEvent("sync", `衝突 ${res.conflicts.length} ファイル`);
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, refreshDiff, loadBehind, logEvent]);

  // Hand the conflict off to the agent in the worktree terminal (reuses the same
  // launch path as Implement/Re-run). The agent resolves the markers + `git add`;
  // the human concludes the merge via Accept (commit on the branch).
  const resolveConflictsWithAI = React.useCallback(() => {
    if (!ref || action || !selectedAgent?.available) return;
    const files = syncConflicts.join(", ");
    const prompt = [
      `git worktree \`${ref.path}\` で main(\`${BASE}\`) を取り込んだ際にマージ衝突が発生しました。`,
      files ? `衝突ファイル: ${files}。` : "",
      "各ファイルの衝突マーカー (<<<<<<< / ======= / >>>>>>>) を解決し、解決後に `git add` してください（commit は人間が UI の Commit から行います）。",
    ]
      .filter(Boolean)
      .join("\n");
    launchAgent(selectedAgent, workDir(ref.path), { prompt });
  }, [ref, action, selectedAgent, syncConflicts, launchAgent, workDir]);

  // Guarded merge of the branch INTO main (the explicit final step on top of
  // Commit). The Rust guard rejects if main is dirty / the branch is behind or
  // conflicts; the UI also gates the button on behind===0 && mergeClean. This —
  // not Commit — is what actually lands on main, so it sets status "merged".
  const mergeToMain = React.useCallback(async () => {
    if (!ref || action) return;
    setAction("merge");
    setError(null);
    setInfo(null);
    try {
      const out = await gitMergeToMain(root, ref.branch);
      const first = out.split("\n").find((l) => l.trim().length > 0) ?? "merged";
      await updateIssueMeta(root, issue, { status: "merged" });
      onStatusChange("merged");
      setInfo(`main に merge しました: ${first}`);
      void logEvent("merge");
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, root, issue, onStatusChange, loadBehind, logEvent]);

  // Open-PR finalize (DEC-015, the team-safe default): build the PR body (spec +
  // activity, so the "why" rides with the PR — DEC-008), push the branch, then
  // `gh pr create`. Never touches main. The returned PR URL is persisted on the
  // WorktreeRef (survives re-opening the issue) and logged to the thread. Status
  // stays in-progress — review/merge happen on the platform.
  const openPR = React.useCallback(async () => {
    if (!ref || action) return;
    setAction("pr");
    setError(null);
    setInfo(null);
    try {
      const { path: bodyPath } = await buildPrBody(root, issue, thread);
      await gitPush(ref.path, ref.branch);
      const url = await ghPrCreate(root, ref.branch, issue.title, bodyPath);
      // Persist the PR URL on the worktree ref so it survives a re-open.
      const nextRef: WorktreeRef = { ...ref, prUrl: url };
      await writeWorktreeRef(issue, nextRef);
      setRef(nextRef);
      setPrUrl(url);
      setInfo(`PR を作成しました: ${url}`);
      void logEvent("pr_opened", url);
      // The branch was pushed (and possibly WIP-committed); refresh the local view.
      await refreshDiff(ref.path);
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, root, issue, thread, logEvent, refreshDiff, loadBehind]);

  // Design feedback (DEC-045): continue the issue's conversation with a fix turn
  // built from the reviewed annotations + an annotated screenshot. Mirrors
  // handleRerun's launch semantics (kill any live agent for the issue, relaunch
  // with `--continue` + the prompt as a positional arg — reliable arg-passing).
  // The screenshot lives under issue.dir, already readable via `--add-dir`.
  const sendDesignFeedback = React.useCallback(
    async (promptText: string, note?: string) => {
      if (!ref) throw new Error("worktree がありません。先に Implement してください。");
      if (!selectedAgent?.available) {
        throw new Error("利用可能なエージェント (claude / codex) が見つかりません。");
      }
      await ptyKillKey(issue.id).catch(() => {});
      launchAgent(selectedAgent, workDir(ref.path), {
        prompt: promptText,
        resume: true,
      });
      void logEvent("design_feedback", note);
    },
    [ref, selectedAgent, issue.id, launchAgent, workDir, logEvent],
  );

  const canImplement =
    gitRepo === true && issue.slots.spec && !!selectedAgent?.available && !action;

  // Resume is offered when a worktree exists but no live pty is mounted (e.g. the
  // app restarted / the issue was re-opened) and an agent is available.
  const canResume = !!ref && !termMounted && !!selectedAgent?.available && !action;

  // Variant generation works BEFORE Build too (DEC-054): it's stack-independent
  // and writes only into issue.dir, so it needs an agent but NOT a worktree.
  const canGenerateVariant = !!selectedAgent?.available && !action;

  return {
    root,
    issue,
    gitRepo,
    ref,
    subPath,
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
    termKey: issue.id,
    termEventsPath: eventsPath,
    running,
    handleTermReady,
    handleTermExit,
    agentState,
    thread,
    canResume,
    handleResume,
    preview,
    behind,
    ahead,
    mergeClean,
    syncConflicts,
    syncMain,
    mergeToMain,
    resolveConflictsWithAI,
    canOpenPR,
    prUrl,
    openPR,
    sendDesignFeedback,
    canImplement,
    handleImplement,
    handleStart,
    handleRerun,
    canGenerateVariant,
    handleGenerateVariant,
    handlePickVariant,
    reviseDesignPattern,
    handleAccept,
    handleDiscard,
  };
}
