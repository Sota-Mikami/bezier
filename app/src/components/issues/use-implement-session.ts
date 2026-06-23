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
  updateIssueMeta,
  readThread,
  appendThreadEvent,
  type Issue,
  type IssueStatus,
  type WorktreeRef,
  type ThreadEvent,
  type ThreadEventType,
  type ThreadNote,
} from "@/lib/issues";
import {
  gitIsRepo,
  gitWorktreeAdd,
  gitDiff,
  gitStatus,
  gitCommitAll,
  gitLog,
  gitResetHard,
  gitWorktreeRemove,
  gitBranchDelete,
  gitBehindAhead,
  gitBaseBranch,
  gitSyncMain,
  gitMergeConflictCheck,
  gitMergeToMain,
  gitRemoteUrl,
  gitPush,
  ghPrState,
  ghPrCreate,
  gitRepoStatus,
  changedPathsFromStatus,
  type Checkpoint,
} from "@/lib/git";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { adapterForId, buildLaunch } from "@/lib/agent-adapters";
import { getSettings, resolveDark } from "@/lib/settings";
import {
  ptyWrite,
  commandExists,
  ptyLookup,
  ptyKillKey,
  ptyStatuses,
  type AgentState,
} from "@/lib/pty";
import { confirmDialog, openExternal } from "@/lib/ipc";
import { notify, ensureNotificationPermission } from "@/lib/notify";
import { isUntitled, titleFromMessage } from "@/lib/issue-domain";
import { writeHandoffPrBody } from "@/lib/handoff";
import { tt } from "@/lib/i18n";
import { conflictResolvePrompt } from "@/lib/prompts";
import type {
  ImplementSession,
  SessionAction,
  TermSpawn,
} from "./implement-session-types";
export type {
  ImplementSession,
  SessionAction,
  TermSpawn,
} from "./implement-session-types";
import { usePreviewServer } from "./use-preview-server";
import { usePublish } from "./use-publish";
import { useJourney } from "./use-journey";
import { previewUrlDeclPath } from "@/lib/preview";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Fallback base branch when the repo's real integration branch can't be read
 * yet (resolved live via gitBaseBranch — OPEN-001: don't hardcode "main"). */
const DEFAULT_BASE = "main";

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
  // The repo's REAL integration branch (what git_merge_to_main merges into), so
  // behind/ahead + conflict-check use the same base as the merge instead of a
  // hardcoded "main" (OPEN-001). Resolved live below; the ref feeds the always-
  // stable loadBehind/syncMain callbacks, the state feeds UI labels.
  const [baseBranch, setBaseBranch] = React.useState(DEFAULT_BASE);
  const baseBranchRef = React.useRef(DEFAULT_BASE);

  // Checkpoints (§D / DEC-080): the branch's own commits = restore points. List
  // for the dropdown; create commits the current state; rollback resets the
  // worktree to a chosen one. Only Discard existed before (all-or-nothing).
  const [checkpoints, setCheckpoints] = React.useState<Checkpoint[]>([]);

  // Open-PR finalize (DEC-015). `canOpenPR` is detected once a worktree exists
  // (GitHub remote + `gh` available); `prUrl` mirrors the WorktreeRef's persisted
  // PR link so a re-opened issue still shows it.
  const [canOpenPR, setCanOpenPR] = React.useState(false);
  const [prUrl, setPrUrl] = React.useState<string | null>(null);

  // Refresh behind/ahead + the dry-run conflict verdict for a worktree. Each
  // probe is independent: a failure (e.g. base ref missing) just clears that
  // signal rather than surfacing an error in the normal flow.
  const loadBehind = React.useCallback(async (worktreePath: string) => {
    const base = baseBranchRef.current;
    try {
      const ba = await gitBehindAhead(worktreePath, base);
      setBehind(ba.behind);
      setAhead(ba.ahead);
    } catch {
      setBehind(null);
      setAhead(null);
    }
    try {
      const c = await gitMergeConflictCheck(worktreePath, base);
      setMergeClean(c.clean);
    } catch {
      setMergeClean(null);
    }
  }, []);

  // Load the branch's checkpoints (commits) for the dropdown (§D / DEC-080).
  const loadCheckpoints = React.useCallback(async (worktreePath: string) => {
    try {
      setCheckpoints(await gitLog(worktreePath, baseBranchRef.current));
    } catch {
      setCheckpoints([]);
    }
  }, []);

  // Dev-server lifecycle (the Preview). Hook-owned so it survives the
  // Preview⇆Diff toggle AND the Spec⇆Design center-tab switch, and can be
  // stopped on Discard. Keyed off the shared worktree path.
  const preview = usePreviewServer(
    root,
    ref ? workDir(ref.path) : null,
    issue.id,
    // Attach-first auto-detect (DEC-141 #5 ②a): the agent writes its dev-server URL
    // here (next to spec.md, in the issue dir it reads/writes via --add-dir).
    previewUrlDeclPath(issue.dir),
  );
  const publish = usePublish(root, ref ? workDir(ref.path) : null, issue.id);
  const journey = useJourney(root, issue.id, issue.title);

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
        // And its behind/ahead vs main (merge-safety badge) + checkpoints.
        void loadBehind(r.path);
        void loadCheckpoints(r.path);
      })
      .catch(() => {
        /* no ref */
      });
    return () => {
      cancelled = true;
    };
  }, [root, issue, loadBehind, loadCheckpoints]);

  // Resolve the repo's REAL integration branch once (OPEN-001). Until it lands,
  // loadBehind/syncMain use DEFAULT_BASE; when it resolves to something else we
  // re-probe the open worktree so the merge-safety badge reflects the true base
  // (and `git_merge_to_main`, which merges into this same branch, stays aligned).
  React.useEffect(() => {
    let cancelled = false;
    void gitBaseBranch(root)
      .then((b) => {
        if (cancelled || !b) return;
        baseBranchRef.current = b;
        setBaseBranch(b);
        if (refRef.current) {
          void loadBehind(refRef.current.path);
          void loadCheckpoints(refRef.current.path);
        }
      })
      .catch(() => {
        /* detached HEAD / not a repo — keep DEFAULT_BASE */
      });
    return () => {
      cancelled = true;
    };
  }, [root, loadBehind, loadCheckpoints]);

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
  // it merged. Best-effort, checked when a PR link is present. NOTE: since the
  // compare-URL Open-PR flow, ref.prUrl may hold the COMPARE URL (a "PR was opened"
  // marker), not a canonical .../pull/N — that's fine here, we resolve MERGED via
  // ghPrState on the BRANCH; prUrl is only the non-null gate. If no PR was ever
  // created, ghPrState returns "" and this exits harmlessly (no spin — one-shot).
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

  // Detect installed agents. Re-runnable so the maker can RECOVER from a transient
  // "no agent found" (e.g. a Finder launch that hadn't picked up the agent's PATH
  // yet, or the agent installed after launch) instead of being permanently stuck
  // with a disabled Resume/Start. Keeps a still-available current pick; only
  // re-picks when the current one is gone.
  const redetectAgents = React.useCallback(async (): Promise<boolean> => {
    const found = await detectAgents().catch(() => null);
    if (!found) return false;
    setAgents(found);
    setSelectedAgentId((cur) => {
      if (cur && found.some((a) => a.id === cur && a.available)) return cur;
      const preferredId = getSettings().defaultAgentId;
      const preferred = preferredId
        ? found.find((a) => a.id === preferredId && a.available)
        : undefined;
      const pick = preferred ?? found.find((a) => a.available);
      return pick ? pick.id : null;
    });
    return found.some((a) => a.available);
  }, []);

  // Initial detect. Inlined (not via redetectAgents) so setState runs only in the
  // async continuation under a cancelled guard — no synchronous effect setState.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await detectAgents().catch(() => null);
      if (cancelled || !found) return;
      setAgents(found);
      const preferredId = getSettings().defaultAgentId;
      const preferred = preferredId
        ? found.find((a) => a.id === preferredId && a.available)
        : undefined;
      const pick = preferred ?? found.find((a) => a.available);
      setSelectedAgentId(pick ? pick.id : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-detect when the window regains focus IF no agent is currently available —
  // so returning after installing/fixing the agent self-heals the dead-end.
  const noAgentRef = React.useRef(false);
  React.useEffect(() => {
    const onFocus = () => {
      if (noAgentRef.current) void redetectAgents();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [redetectAgents]);

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
      note?: ThreadNote,
      extra?: Partial<Pick<ThreadEvent, "changedPaths" | "branch">>,
    ) => {
      // A raw string note is a sha / message (verbatim); a {key, params} note is
      // resolved in the reader's locale at render time (DEC-108).
      const noteFields =
        typeof note === "string"
          ? note
            ? { note }
            : {}
          : note
            ? { noteKey: note.key, noteParams: note.params }
            : {};
      try {
        const next = await appendThreadEvent(root, issue, {
          type,
          at: new Date().toISOString(),
          ...noteFields,
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
  // Track "no available agent" for the focus-driven re-detect (recovery).
  const noAgent = !agents.some((a) => a.available);
  React.useEffect(() => {
    noAgentRef.current = noAgent;
  }, [noAgent]);

  const launchAgent = React.useCallback(
    (
      agent: AgentTool,
      cwd: string,
      opts: { prompt?: string; resume?: boolean },
    ) => {
      // Warm up notification permission NOW (the app is focused — the user just
      // started a turn) so the OS prompt shows at a sensible time, not the moment
      // an agent finishes while Bezier is backgrounded (DEC-136). Idempotent.
      void ensureNotificationPermission();
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
      // Agent-agnostic launch (DEC-132): the adapter declares HOW to deliver the
      // prompt + flags. buildLaunch encapsulates the variadic-safe arg order
      // (positional prompt first, claude's --add-dir last). For agents that don't
      // take a positional prompt (stdin/custom) it returns `initialInput`, which we
      // type into the pty once ready (handleTermReady). `eventsPath` is returned
      // only for hook agents (claude) — the pty wires the events file then.
      const adapter = adapterForId(agent.id, getSettings().customAgents);
      const built = buildLaunch(adapter, agent.bin, {
        prompt: opts.prompt,
        resume: opts.resume,
        contextDir: issue.dir,
        eventsPath,
        theme: resolveDark() ? "dark" : "light",
        cwd,
      });
      pendingInputRef.current = built.initialInput ?? null;
      // Any launch counts as "the agent has been started for this issue", so the
      // auto-resume-on-entry effect won't fire again (e.g. after the user quits).
      autoResumedRef.current = true;
      // Remember whether THIS launch is a resume so a quick failure can fall back.
      resumeStartRef.current = opts.resume ? Date.now() : null;
      setTermCwd(cwd);
      // Run the agent inside the user's shell so `/exit` returns to a live
      // terminal instead of killing the pane (TQ-1).
      setTermSpawn({
        cmd: built.cmd,
        args: built.args,
        wrap: true,
        waitingStrategy: built.notify,
        idleWaitingMs: built.idleWaitingMs,
      });
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
      setInfo(tt("session.resumeFallback"));
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
      setError(tt("session.noAgent"));
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
  // Provisional issue name from the first message (DEC-141) — used for notifications
  // until the prop title refines from "Untitled" to the spec H1. "" = none yet.
  const [provisionalTitle, setProvisionalTitle] = React.useState("");
  const handleStart = React.useCallback(
    async (message: string) => {
      const msg = message.trim();
      if (!gitRepo || action || !msg) return;
      if (!selectedAgent?.available) {
        setError(tt("session.noAgent"));
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
        // Give the issue a real name immediately (DEC-141) so the sidebar +
        // notifications don't say "Untitled" until the spec H1 lands. The spec's
        // first heading refines it later (autoTitleFromSpec).
        if (isUntitled(issue.title)) {
          const prov = titleFromMessage(msg);
          if (prov) {
            setProvisionalTitle(prov);
            void updateIssueMeta(root, issue, { title: prov }).catch(() => {});
          }
        }
        const { content } = await buildImplementHandoff(root, issue, workDir(wt), {
          userMessage: msg,
          subPath,
        });
        setRef(newRef);
        launchAgent(selectedAgent, workDir(wt), { prompt: content });
        void logEvent("implement", { key: "threadNote.chatStarted" });
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
  const handleRerun = React.useCallback(async (opts?: { fresh?: boolean }) => {
    if (!ref || action) return;
    if (!selectedAgent?.available) {
      setError(tt("session.noAgent"));
      return;
    }
    // Hard re-run starts a FRESH conversation (clean slate) — confirm, because the
    // default (soft) re-run keeps the thread via `--continue` so the "why" of the
    // prior decisions survives the cycle (heuristic #3: Re-run used to silently wipe
    // the conversation).
    if (opts?.fresh) {
      const ok = await confirmDialog(tt("session.rerunFreshConfirm"), {
        title: tt("session.rerunFreshTitle"),
        okLabel: tt("session.rerunFreshOk"),
        cancelLabel: tt("common.cancel"),
      });
      if (!ok) return;
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
      // Soft (default): `--continue` resumes the prior conversation AND keeps the
      // worktree changes, so the maker's iterative edits build on context. Hard:
      // fresh session (the old behaviour), used only when explicitly chosen.
      launchAgent(selectedAgent, workDir(ref.path), {
        prompt: content,
        resume: !opts?.fresh,
      });
      void logEvent("rerun", opts?.fresh ? "fresh" : "continue");
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
        setError(tt("session.noAgent"));
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
          context
            ? { key: "threadNote.variantGeneratedCtx", params: { ids: ids.join("/"), context } }
            : { key: "threadNote.variantGenerated", params: { ids: ids.join("/") } },
        );
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [ref, action, selectedAgent, root, issue, launchAgent, logEvent, workDir],
  );

  // Revise a Design wireframe from annotations (DEC-056). Same launch shape as
  // generation (cwd = worktree if building, else the issue folder; resume only
  // when there's a build session). The prompt (built by the AnnotationLayer's
  // design surface) already names design/NN.html and forbids touching code.
  const reviseDesignPattern = React.useCallback(
    async (promptText: string, note: string) => {
      if (!selectedAgent?.available) {
        throw new Error(tt("session.noAgent"));
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
      setError(tt("session.noAgent"));
      return;
    }
    setError(null);
    setInfo(null);
    // DEC-132: resume only if the agent supports it (claude --continue); otherwise
    // re-seed from the spec (no cross-turn continuation semantics).
    if (adapterForId(selectedAgent.id, getSettings().customAgents).resume) {
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

  // (DEC-088) The explicit "Commit" was removed: checkpoints are automatic per
  // turn (DEC-087), "いまを保存" covers a manual snapshot, and Merge/Sync/PR all
  // commit any uncommitted work first — so a separate commit step was redundant.

  // Make a checkpoint: commit the current worktree state on the branch (§D /
  // DEC-080). `label` becomes the commit subject (defaults to a timestamp). A
  // clean tree surfaces a friendly "nothing to save".
  const makeCheckpoint = React.useCallback(
    async (label?: string) => {
      if (!ref || action) return;
      const msg =
        label?.trim() ||
        `checkpoint ${new Date(Date.now()).toLocaleString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      setAction("checkpoint");
      setError(null);
      setInfo(null);
      try {
        const sha = await gitCommitAll(ref.path, msg);
        setInfo(tt("session.checkpointCreated", { sha: sha.slice(0, 9) }));
        void logEvent("checkpoint", msg);
        await refreshDiff(ref.path);
        await loadBehind(ref.path);
        await loadCheckpoints(ref.path);
      } catch (e) {
        const m = String(e);
        setError(/nothing to commit/.test(m) ? tt("session.nothingToSave") : errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [ref, action, refreshDiff, loadBehind, loadCheckpoints, logEvent],
  );

  // Auto-checkpoint (DEC-087): on each agent turn START, snapshot the PRIOR turn's
  // result (commit iff the worktree is dirty) so a turn is always undoable without
  // remembering. QUIET — no UI action/error noise; the CURRENT turn stays
  // uncommitted, so Diff / Commit / the turn-end evidence collection are
  // unaffected. Skips when clean (the very first turn, or no new work).
  const autoCheckpoint = React.useCallback(async () => {
    const r = refRef.current;
    if (!r || !getSettings().autoCheckpoint) return;
    try {
      const dirty = changedPathsFromStatus(await gitStatus(r.path)).length > 0;
      if (!dirty) return;
      await gitCommitAll(
        r.path,
        `checkpoint (auto) ${new Date(Date.now()).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
      await loadCheckpoints(r.path);
      await loadBehind(r.path);
    } catch {
      /* nothing to commit / race with the agent — ignore */
    }
  }, [loadCheckpoints, loadBehind]);

  // Detect a turn START (idle/waiting → running) and snapshot the prior state.
  const prevAgentForCp = React.useRef<AgentState | null>(agentState);
  React.useEffect(() => {
    const was = prevAgentForCp.current;
    prevAgentForCp.current = agentState;
    if (was !== "running" && agentState === "running") {
      void autoCheckpoint();
    }
  }, [agentState, autoCheckpoint]);

  // Notification title (DEC-141): the real title once the spec H1 / persisted name
  // lands; otherwise the provisional from the first message; otherwise "Bezier".
  const notifyTitle = !isUntitled(issue.title) ? issue.title : provisionalTitle || "Bezier";

  // Ping the maker when a turn FINISHES (running → not-running) and Bezier isn't
  // focused, so they don't have to stare at the terminal to know it's done or
  // awaiting them (heuristic #4). The in-app inbox/dot already covers the focused
  // case; this is for "I tabbed away to do something else".
  const prevAgentForNotify = React.useRef<AgentState | null>(agentState);
  React.useEffect(() => {
    const was = prevAgentForNotify.current;
    prevAgentForNotify.current = agentState;
    if (was !== "running" || agentState === "running" || agentState === null) return;
    if (typeof document !== "undefined" && document.hasFocus()) return;
    const body =
      agentState === "waiting"
        ? tt("session.notifyWaiting")
        : agentState === "error"
          ? tt("session.notifyError")
          : tt("session.notifyDone");
    void notify({
      title: notifyTitle,
      body,
      target: { root, id: issue.id },
    }).catch(() => {});
  }, [agentState, notifyTitle, issue.id, root]);

  // Ping when the dev server finishes booting (it can take up to 150s) or fails —
  // again only when Bezier isn't focused (DEC-137). The in-app status covers the
  // case where you're watching; this is for "I tabbed away while it started".
  const prevPreviewStatus = React.useRef(preview.status);
  React.useEffect(() => {
    const was = prevPreviewStatus.current;
    prevPreviewStatus.current = preview.status;
    if (was !== "starting") return;
    if (typeof document !== "undefined" && document.hasFocus()) return;
    if (preview.status === "ready") {
      void notify({
        title: notifyTitle,
        body: tt("session.notifyPreviewReady"),
        target: { root, id: issue.id },
      }).catch(() => {});
    } else if (preview.status === "error") {
      void notify({
        title: notifyTitle,
        body: tt("session.notifyPreviewError"),
        target: { root, id: issue.id },
      }).catch(() => {});
    }
  }, [preview.status, notifyTitle, issue.id, root]);

  // Roll the worktree back to a checkpoint (§D / DEC-080). reset --hard discards
  // later commits + uncommitted changes (reflog-recoverable); main is untouched.
  const rollbackTo = React.useCallback(
    async (sha: string) => {
      if (!ref || action) return;
      const ok = await confirmDialog(
        tt("session.rollbackConfirm.message"),
        {
          title: tt("session.rollbackConfirm.title"),
          okLabel: tt("session.rollbackConfirm.ok"),
          cancelLabel: tt("session.cancelStop"),
        },
      );
      if (!ok) return;
      setAction("rollback");
      setError(null);
      setInfo(null);
      try {
        await gitResetHard(ref.path, sha);
        setInfo(tt("session.rolledBack", { sha: sha.slice(0, 9) }));
        void logEvent("rollback", sha.slice(0, 9));
        await refreshDiff(ref.path);
        await loadBehind(ref.path);
        await loadCheckpoints(ref.path);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setAction(null);
      }
    },
    [ref, action, refreshDiff, loadBehind, loadCheckpoints, logEvent],
  );

  const handleDiscard = React.useCallback(async () => {
    if (!ref || action) return;
    const ok = await confirmDialog(
      tt("session.discardConfirm.message"),
      {
        title: tt("session.discardConfirm.title"),
        okLabel: tt("session.discardConfirm.ok"),
        cancelLabel: tt("common.cancel"),
      },
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
      // Also kill the publish deploy (keyed `publish:<id>`, NOT `<id>`) and wipe
      // its saved URL — else re-implementing the same issue shows a stale
      // "shared" URL from the discarded work (review MF).
      await publish.clear().catch(() => {});
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
  }, [ref, action, preview, publish, teardownTerminal, root, issue, onStatusChange, logEvent]);

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
      const res = await gitSyncMain(ref.path, baseBranchRef.current);
      await refreshDiff(ref.path);
      await loadBehind(ref.path);
      if (res.ok) {
        setInfo(tt("session.syncDone"));
        void logEvent("sync");
      } else {
        setSyncConflicts(res.conflicts);
        setError(tt("session.syncConflict", { count: res.conflicts.length }));
        void logEvent("sync", { key: "threadNote.conflicts", params: { n: res.conflicts.length } });
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
    const files = syncConflicts.join(", ") || null;
    const prompt = conflictResolvePrompt(ref.path, baseBranchRef.current, files);
    launchAgent(selectedAgent, workDir(ref.path), { prompt });
  }, [ref, action, selectedAgent, syncConflicts, launchAgent, workDir]);

  // Guarded merge of the branch INTO main (the explicit final step on top of
  // Commit). The Rust guard rejects if main is dirty / the branch is behind or
  // conflicts; the UI also gates the button on behind===0 && mergeClean. This —
  // not Commit — is what actually lands on main, so it sets status "merged".
  const mergeToMain = React.useCallback(async () => {
    if (!ref || action) return;
    // Merging straight into the base branch is hard to undo (and may be pushed),
    // so always confirm first (DEC-099) — the riskiest finalize action.
    const countTxt =
      ahead != null && ahead > 0
        ? tt("session.mergeConfirm.countCommits", { count: ahead })
        : tt("session.mergeConfirm.countChanges");
    const ok = await confirmDialog(
      tt("session.mergeConfirm.message", { what: countTxt, base: baseBranch }),
      {
        title: tt("session.mergeConfirm.title", { base: baseBranch }),
        okLabel: tt("session.mergeConfirm.ok"),
        cancelLabel: tt("session.cancelStop"),
      },
    );
    if (!ok) return;
    setAction("merge");
    setError(null);
    setInfo(null);
    try {
      // Commit any uncommitted worktree work first — like Sync / Open PR do — so
      // the final (uncommitted) turn isn't silently left behind by the branch-only
      // merge. Auto-checkpoints (DEC-087) make "all saved" feel true, but the
      // current turn is still uncommitted; this closes that gap (DEC-088).
      const dirty = changedPathsFromStatus(await gitStatus(ref.path)).length > 0;
      if (dirty) await gitCommitAll(ref.path, issue.title || "checkpoint");
      const out = await gitMergeToMain(root, ref.branch);
      const first = out.split("\n").find((l) => l.trim().length > 0) ?? "merged";
      await updateIssueMeta(root, issue, { status: "merged" });
      onStatusChange("merged");
      setInfo(tt("session.mergedToMain", { first }));
      void logEvent("merge");
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, root, issue, onStatusChange, loadBehind, logEvent, ahead, baseBranch]);

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
      // Push the branch, then create a DRAFT PR via `gh` with the handoff as the body
      // passed via a FILE (`--body-file`). This puts the full handoff (spec + acceptance
      // + decisions + QA + preview env + review link) in the PR BODY with NO URL-length
      // limit (the compare-URL prefill hit GitHub's "URL too long") and NO committed
      // file (a reviewer flagged docs/handoff/<id>.md as repo noise). The maker reviews
      // the draft in the browser and clicks "Ready for review" — the human's final call.
      // gh is required (canOpenPR gates on it). The REAL PR URL is persisted (so the
      // auto-merge-detection + the "Open PR" link work, and point at the real PR).
      await gitPush(ref.path, ref.branch);
      const bodyPath = await writeHandoffPrBody(root, issue);
      const prUrl = await ghPrCreate(
        root,
        ref.branch,
        issue.title || issue.id,
        bodyPath,
        baseBranch,
        true, // draft
      );
      await openExternal(prUrl).catch(() => {});
      const opened: WorktreeRef = { ...ref, prUrl };
      await writeWorktreeRef(issue, opened).catch(() => {});
      setRef(opened);
      setPrUrl(prUrl);
      setInfo(tt("session.prCreatedDraft"));
      void logEvent("pr_opened", prUrl);
      // The branch was pushed; refresh the local view.
      await refreshDiff(ref.path);
      await loadBehind(ref.path);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAction(null);
    }
  }, [ref, action, root, issue, baseBranch, logEvent, refreshDiff, loadBehind]);

  // Design feedback (DEC-045): continue the issue's conversation with a fix turn
  // built from the reviewed annotations + an annotated screenshot. Mirrors
  // handleRerun's launch semantics (kill any live agent for the issue, relaunch
  // with `--continue` + the prompt as a positional arg — reliable arg-passing).
  // The screenshot lives under issue.dir, already readable via `--add-dir`.
  const sendDesignFeedback = React.useCallback(
    async (promptText: string, note?: string): Promise<boolean> => {
      if (!ref) throw new Error(tt("session.noWorktree"));
      if (!selectedAgent?.available) {
        throw new Error(tt("session.noAgent"));
      }
      // Sending feedback KILLS the issue's live agent to relaunch it with the note.
      // If a turn is mid-flight or awaiting the maker, that thread is lost — confirm
      // first (heuristic #6). Returning false (cancel) lets the caller leave the
      // annotations as unsent drafts instead of marking them "running".
      if (agentState === "running" || agentState === "waiting") {
        const ok = await confirmDialog(tt("session.feedbackInterruptConfirm"), {
          title: tt("session.feedbackInterruptTitle"),
          okLabel: tt("session.feedbackInterruptOk"),
          cancelLabel: tt("common.cancel"),
        });
        if (!ok) return false;
      }
      await ptyKillKey(issue.id).catch(() => {});
      launchAgent(selectedAgent, workDir(ref.path), {
        prompt: promptText,
        resume: true,
      });
      void logEvent("design_feedback", note);
      return true;
    },
    [ref, selectedAgent, issue.id, launchAgent, workDir, logEvent, agentState],
  );

  // Paste into the RUNNING agent's chat without restarting it (the CEO's ask: batched
  // comments should land in the ongoing conversation, not kill + relaunch the thread).
  const injectToAgent = React.useCallback(
    async (text: string): Promise<boolean> => {
      const pid = await ptyLookup(issue.id).catch(() => null);
      if (!pid) return false; // no live agent to inject into — caller can fall back
      // Bracketed paste = content (incl. newlines) is inserted literally, not submitted
      // per-line; the trailing CR submits. Mirrors the terminal's own paste path.
      await ptyWrite(pid, `[200~${text}[201~`).catch(() => {});
      await ptyWrite(pid, "\r").catch(() => {});
      void logEvent("design_feedback", "inject");
      return true;
    },
    [issue.id, logEvent],
  );

  // Inject into the running agent's chat; if none is live, fall back to a fresh
  // feedback turn. The single seam for all annotation/comment sends (the no-restart
  // path the CEO asked for) — annotation surfaces + the batch-comment handlers route
  // through this instead of each hand-rolling the inject-first || feedback pattern.
  const injectOrFeedback = React.useCallback(
    async (text: string, note?: string): Promise<boolean> =>
      (await injectToAgent(text)) || sendDesignFeedback(text, note),
    [injectToAgent, sendDesignFeedback],
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
    redetectAgents,
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
    publish,
    journey,
    baseBranch,
    behind,
    ahead,
    mergeClean,
    syncConflicts,
    checkpoints,
    makeCheckpoint,
    rollbackTo,
    syncMain,
    mergeToMain,
    resolveConflictsWithAI,
    canOpenPR,
    prUrl,
    openPR,
    sendDesignFeedback,
    injectToAgent,
    injectOrFeedback,
    canImplement,
    handleImplement,
    handleStart,
    handleRerun,
    canGenerateVariant,
    handleGenerateVariant,
    reviseDesignPattern,
    handleDiscard,
  };
}
