// Agent-agnostic adapter layer (DEC-132). Bezier delegates work to whatever local
// coding-agent CLI the user has — Claude Code, Codex, or any command via a custom
// adapter. Behavioral differences (how the prompt is delivered, resume, context
// dirs, settings/hooks, headless, how "waiting" is detected, slash-command home,
// which repo-convention files it natively reads) are DECLARED here as data, instead
// of `if (agent.id === "claude")` branches scattered across the app. `buildLaunch()`
// turns an adapter + a launch context into a concrete { cmd, args, initialInput, … }.

import { agentHookSettings } from "@/lib/pty";

export type NotifyStrategy = "hooks" | "idle" | "exit-only";

/** How the prompt is handed to the agent. */
export type PromptDelivery =
  | { kind: "positional" } // prompt is argv[0] (claude/codex start a session seeded with it)
  | { kind: "flag"; flag: string } // e.g. aider: --message "<prompt>"
  | { kind: "stdin" }; // typed into the pty after it's ready (safest for unknown CLIs)

/** A coding-agent the app can launch, described by capability rather than id. */
export interface AgentAdapter {
  id: string;
  name: string;
  /** Default executable name probed on PATH (resolved to an absolute path at detect). */
  bin: string;
  prompt: PromptDelivery;
  /** Resume the prior conversation, or null (re-seed from the spec each turn). */
  resume: { flag: string } | null;
  /** Grant read/write to a dir outside the worktree (the issue's spec dir): a flag
   *  (`--add-dir`), "fold" (mention the dir in the prompt), or null (ignore). */
  contextDirs: { flag: string } | "fold" | null;
  /** Inject settings/hooks (the deterministic "waiting" signal), or null. */
  settings: { flag: string; build: (eventsPath: string, theme: "light" | "dark") => string } | null;
  /** Headless one-shot mode (must pair with a hard deny of secrets), or null. */
  headless: { flag: string } | null;
  /** How agent state is detected (see Rust pty_statuses). */
  notify: NotifyStrategy;
  /** For notify="idle": quiet duration ⇒ "waiting" (ms). Rust default applies if omitted. */
  idleWaitingMs?: number;
  /** Slash-command pack home for this agent, or null (skip — baseline is inline prose). */
  commandsDir: ((home: string) => string) | null;
  /** Repo-convention files this agent natively reads (shown as "Inherits:"). */
  conventionFiles: string[];
  /** Shift+Enter key sequence in the embedded terminal (claude reads ESC+CR as newline). */
  newlineKeySeq: string;
  /** True for built-in adapters; false for user-defined custom agents. */
  builtin: boolean;
  /** Custom adapter only: argv template; "{prompt}"/"{cwd}" substitute as whole tokens. */
  template?: string[];
}

/** A user-defined agent (Settings → "Add custom agent") — any local CLI. */
export interface CustomAgentConfig {
  id: string;
  name: string;
  bin: string;
  /** argv template; tokens "{prompt}" and "{cwd}" are substituted whole. If it has
   *  no "{prompt}", the prompt is typed into the pty (stdin) after launch. */
  argv: string[];
  notify?: NotifyStrategy;
  conventionFiles?: string[];
}

export const CLAUDE_ADAPTER: AgentAdapter = {
  id: "claude",
  name: "Claude Code",
  bin: "claude",
  prompt: { kind: "positional" },
  resume: { flag: "--continue" },
  contextDirs: { flag: "--add-dir" },
  settings: { flag: "--settings", build: agentHookSettings },
  headless: { flag: "-p" },
  notify: "hooks",
  commandsDir: (home) => `${home.replace(/\/+$/, "")}/.claude/commands/bezier`,
  conventionFiles: ["CLAUDE.md"],
  newlineKeySeq: "\x1b\r",
  builtin: true,
};

export const CODEX_ADAPTER: AgentAdapter = {
  id: "codex",
  name: "Codex",
  bin: "codex",
  prompt: { kind: "positional" },
  resume: null, // v1: no resume — re-seed from the spec
  contextDirs: "fold", // no --add-dir → mention the spec dir in the prompt
  settings: null,
  headless: null, // no hard deny-rule guarantee → not used for secret-sensitive headless
  notify: "idle",
  idleWaitingMs: 8000,
  commandsDir: null,
  conventionFiles: ["AGENTS.md"],
  newlineKeySeq: "\n",
  builtin: true,
};

export const BUILTIN_ADAPTERS: readonly AgentAdapter[] = [CLAUDE_ADAPTER, CODEX_ADAPTER];

/** Build an adapter for a user-defined custom agent (any local CLI). */
export function customAdapter(c: CustomAgentConfig): AgentAdapter {
  return {
    id: c.id,
    name: c.name,
    bin: c.bin,
    prompt: { kind: "stdin" },
    resume: null,
    contextDirs: "fold",
    settings: null,
    headless: null,
    notify: c.notify ?? "idle",
    idleWaitingMs: 8000,
    commandsDir: null,
    conventionFiles: c.conventionFiles ?? [],
    newlineKeySeq: "\n",
    builtin: false,
    template: c.argv,
  };
}

/** All adapters = built-ins + the user's custom agents. */
export function allAdapters(customs: CustomAgentConfig[] = []): AgentAdapter[] {
  return [...BUILTIN_ADAPTERS, ...customs.map(customAdapter)];
}

/** Resolve an adapter by id (falls back to a generic positional adapter so an
 *  unknown id still launches rather than crashing). */
export function adapterForId(id: string, customs: CustomAgentConfig[] = []): AgentAdapter {
  return (
    allAdapters(customs).find((a) => a.id === id) ?? {
      ...CODEX_ADAPTER,
      id,
      name: id,
      bin: id,
      conventionFiles: [],
    }
  );
}

export interface LaunchContext {
  prompt?: string;
  resume?: boolean;
  /** The issue's spec dir (outside the worktree). */
  contextDir?: string;
  /** The hook-events file path (only used by hook agents). */
  eventsPath?: string;
  theme: "light" | "dark";
  /** The working directory (for custom {cwd} substitution). */
  cwd?: string;
}

export interface BuiltLaunch {
  cmd: string;
  args: string[];
  /** Typed into the pty once ready (stdin/flag-less custom prompt delivery). */
  initialInput?: string;
  notify: NotifyStrategy;
  idleWaitingMs?: number;
  /** Set only when settings/hooks were injected (so the pty wires the events file). */
  eventsPath?: string;
}

/** Fold the spec dir into the prompt for agents without a context-dir flag. */
function effectivePrompt(a: AgentAdapter, ctx: LaunchContext): string {
  let p = ctx.prompt ?? "";
  if (a.contextDirs === "fold" && ctx.contextDir && p) {
    p += `\n\n(You may also read files under: ${ctx.contextDir})`;
  }
  return p;
}

/**
 * Translate an adapter + context into a concrete launch. Encapsulates the ordering
 * rule that was a comment in launchAgent: positional prompt FIRST, then resume flag,
 * then settings flag, then the variadic context-dir LAST.
 */
export function buildLaunch(a: AgentAdapter, bin: string, ctx: LaunchContext): BuiltLaunch {
  const eff = effectivePrompt(a, ctx);
  const args: string[] = [];
  let initialInput: string | undefined;
  let eventsPath: string | undefined;

  if (a.template) {
    // Custom agent: substitute whole tokens (never shell-concatenated).
    const hasPrompt = a.template.includes("{prompt}");
    for (const tok of a.template) {
      args.push(tok === "{prompt}" ? eff : tok === "{cwd}" ? (ctx.cwd ?? "") : tok);
    }
    if (!hasPrompt && eff) initialInput = eff;
  } else {
    if (a.prompt.kind === "positional" && eff) args.push(eff);
    if (a.resume && ctx.resume) args.push(a.resume.flag);
    if (a.settings && ctx.eventsPath) {
      args.push(a.settings.flag, a.settings.build(ctx.eventsPath, ctx.theme));
      eventsPath = ctx.eventsPath;
    }
    if (a.contextDirs && typeof a.contextDirs === "object" && ctx.contextDir) {
      args.push(a.contextDirs.flag, ctx.contextDir);
    }
    if (a.prompt.kind === "flag" && eff) args.push(a.prompt.flag, eff);
    if (a.prompt.kind === "stdin" && eff) initialInput = eff;
  }

  return { cmd: bin, args, initialInput, notify: a.notify, idleWaitingMs: a.idleWaitingMs, eventsPath };
}
