// FROZEN CONTRACT (v0.2) — doc-context delegation to CLI coding agents.
//
// Detect locally installed CLI agents (claude / codex) and build a plain
// markdown "handoff" file from the currently-open doc(s) that the agent is told
// to read and implement. Signatures are frozen.

import { commandExists } from "@/lib/pty";
import { readFile, writeFile } from "@/lib/ipc";

/** A detectable CLI coding agent. */
export interface AgentTool {
  /** Stable id used by the picker (e.g. "claude"). */
  id: string;
  /** Human label (e.g. "Claude Code"). */
  name: string;
  /** Executable name probed on PATH (e.g. "claude"). */
  bin: string;
  /** Whether `bin` resolved on PATH at detection time. */
  available: boolean;
}

/** The agents we know how to launch, in display order. */
const KNOWN_AGENTS: ReadonlyArray<Omit<AgentTool, "available">> = [
  { id: "claude", name: "Claude Code", bin: "claude" },
  { id: "codex", name: "Codex", bin: "codex" },
];

/**
 * Probe each known agent via `commandExists` and report availability.
 * The picker should show only entries with `available === true`.
 */
export async function detectAgents(): Promise<AgentTool[]> {
  return Promise.all(
    KNOWN_AGENTS.map(async (a) => ({
      ...a,
      available: await commandExists(a.bin).catch(() => false),
    })),
  );
}

/**
 * Assemble a markdown handoff context from the given docs and write it to
 * `<root>/.continuum/handoff/<stamp>.md`. Each doc is read via `readFile` and
 * concatenated under a header; a final instruction line tells the agent to read
 * this file and implement. Returns the written file's absolute path.
 *
 * NOTE: the Rust `write_file` command canonicalizes the parent directory, so the
 * `<root>/.continuum/handoff/` directory must already exist. Callers that may
 * write into a fresh workspace should ensure that directory exists first (a
 * dedicated ensure-dir command is out of scope for the v0.2 contract).
 */
export async function buildHandoff(
  root: string,
  docPaths: string[],
  stamp: string,
): Promise<string> {
  const sep = root.includes("\\") ? "\\" : "/";
  const trimmedRoot = root.replace(/[/\\]+$/, "");
  const outPath = [trimmedRoot, ".continuum", "handoff", `${stamp}.md`].join(sep);

  const sections: string[] = [
    `# Continuum handoff — ${stamp}`,
    "",
    `Workspace root: \`${trimmedRoot}\``,
    "",
  ];

  for (const p of docPaths) {
    let body: string;
    try {
      body = await readFile(p);
    } catch (err) {
      body = `_(could not read this file: ${
        err instanceof Error ? err.message : String(err)
      })_`;
    }
    sections.push(`## ${p}`, "", body, "");
  }

  sections.push(
    "---",
    "",
    `Read this handoff file (\`${outPath}\`) and implement the changes it describes in this workspace.`,
    "",
  );

  const content = sections.join("\n");
  await writeFile(outPath, content);
  return outPath;
}

/** A concrete spec for spawning a terminal that runs a CLI agent. */
export interface AgentLaunchSpec {
  /** Executable to run in the pty (e.g. "claude"). */
  cmd: string;
  /** Arguments passed to `cmd`. */
  args: string[];
  /** A line to write into the pty telling the agent to read the handoff file. */
  initialInput: string;
}

/**
 * Translate a detected agent + handoff path into a concrete launch spec the
 * terminal layer can act on. The caller spawns a pty with `{ cmd, args }` in the
 * workspace root, then writes `initialInput` to it so the agent reads the
 * handoff file. Both known agents take no args; only the prompt differs.
 */
export function launchSpecForAgent(
  tool: AgentTool,
  handoffPath: string,
): AgentLaunchSpec {
  return {
    cmd: tool.bin,
    args: [],
    initialInput: `Please read ${handoffPath} and implement.\n`,
  };
}
