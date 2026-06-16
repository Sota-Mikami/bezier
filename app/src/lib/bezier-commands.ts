// Bezier's agent-native slash-command pack (DEC-076).
//
// Why this exists: the live agent (claude) runs in a real pty whose own prompt
// already has native `@` file refs and `/` slash commands. Stacking a React
// composer on top (DEC-075) read as two competing inputs. So instead of building
// chat chrome, Bezier offers its shortcuts as *real* agent-native slash commands —
// the maker types `/bezier:verify` into the agent's own prompt (one input), and
// the same commands keep working in the user's own terminal.
//
// Install policy (DEC-076, revised): EXPLICIT + NON-CLOBBERING. We do NOT write
// these silently on launch — installing is a deliberate action from Settings.
// Target is the user's GLOBAL `~/.claude/commands/bezier/` (claude exposes a file
// there as `/bezier:<name>`), so they also work in the user's own terminal. The
// install never overwrites files that already exist (the maker can edit them and
// keep their edits); "更新" is a separate, explicit overwrite. Uninstall removes
// the whole `bezier/` pack dir.
//
// Why not repo-local: a Bezier worktree lives OUTSIDE the repo (app_data_dir), so
// the main repo's `.claude/commands` isn't on claude's discovery path from the
// worktree cwd; and anything dropped INSIDE a worktree gets swept into the user's
// commit by `git add -A`. Global is the clean, discoverable, non-polluting home.
//
// claude-only: codex doesn't read `~/.claude/commands`. The cross-agent baseline
// stays the prose conventions in BEZIER.md (bezierGuide); these are a claude
// ergonomics layer on top, degrading gracefully when absent.

import {
  writeFile,
  readFile,
  listDir,
  uninstallBezierCommands as ipcUninstall,
  removeBezierCommand as ipcRemoveCommand,
} from "@/lib/ipc";
import { tt } from "@/lib/i18n";
import { commandPack } from "@/lib/prompts";

interface BezierCommand {
  /** file stem → invoked as `/bezier:<name>` */
  name: string;
  /** shown in claude's `/` menu */
  description: string;
  /** the command body (the prompt claude runs) */
  body: string;
}

/** The built-in pack, in the maker's UI locale (DEC-108 · @/lib/prompts). The
 * command NAMES/order are locale-independent; only description/body translate. */
export function bezierCommands(): BezierCommand[] {
  return commandPack();
}

/** `~/.claude/commands/bezier` — where the pack lives (claude's user command dir). */
export function bezierCommandsDir(home: string): string {
  return `${home.replace(/\/+$/, "")}/.claude/commands/bezier`;
}

function renderCommandFile(c: { description: string; body: string }): string {
  return [`---`, `description: ${c.description}`, `---`, ``, c.body, ``].join("\n");
}

/** The built-in command names (vs. the maker's own custom ones). Names are
 * locale-independent, so read them from any locale (en). */
export const BUILTIN_NAMES: Set<string> = new Set(commandPack("en").map((c) => c.name));

/** The Bezier default for a built-in (for "reset to default"); undefined if
 * custom. Returns the current-locale default (DEC-108). */
export function builtinDefault(name: string): BezierCommand | undefined {
  return bezierCommands().find((c) => c.name === name);
}

/** A valid command name: a bare slug. Invoked as `/bezier:<name>`. */
export function isValidCommandName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

/** One command as it exists on disk (the marketplace manager's row). */
export interface InstalledCommand {
  name: string;
  description: string;
  body: string;
  /** true = one of Bezier's built-ins (offers "reset to default"). */
  isBuiltin: boolean;
}

/** Parse a `---\ndescription: …\n---\n\n<body>` command file. */
function parseCommandFile(text: string): { description: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { description: "", body: text.trimEnd() };
  const dm = /^description:\s*(.*)$/m.exec(m[1]);
  const body = text.slice(m[0].length).replace(/^\r?\n/, "");
  return { description: dm ? dm[1].trim() : "", body: body.trimEnd() };
}

/**
 * List the commands currently on disk (disk = the source of truth). Built-ins
 * come first in their canonical order, then custom commands alphabetically.
 */
export async function listInstalledCommands(home: string): Promise<InstalledCommand[]> {
  const dir = bezierCommandsDir(home);
  let files: string[];
  try {
    const entries = await listDir(dir);
    files = entries.filter((e) => !e.isDir && e.name.endsWith(".md")).map((e) => e.name);
  } catch {
    return [];
  }
  const out: InstalledCommand[] = [];
  for (const f of files) {
    const name = f.replace(/\.md$/, "");
    try {
      const { description, body } = parseCommandFile(await readFile(`${dir}/${f}`));
      out.push({ name, description, body, isBuiltin: BUILTIN_NAMES.has(name) });
    } catch {
      /* skip unreadable */
    }
  }
  const order = commandPack("en");
  const rank = (c: InstalledCommand) => {
    const i = order.findIndex((b) => b.name === c.name);
    return i < 0 ? 1000 : i;
  };
  out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return out;
}

/** Write a single command file (create or overwrite). */
export async function writeCommand(
  home: string,
  name: string,
  description: string,
  body: string,
): Promise<void> {
  await writeFile(`${bezierCommandsDir(home)}/${name}.md`, renderCommandFile({ description, body }));
}

/** Remove a single command (scoped, validated on the Rust side). */
export async function removeCommand(name: string): Promise<void> {
  await ipcRemoveCommand(name);
}

// --- Command-pack export / import (DEC-081, the marketplace primitive) --------
// A "pack" is a shareable JSON file of commands — copy it to another machine,
// commit it to a repo, hand it to a teammate, then import it. The portable unit
// behind the [[skills-agents-marketplace-idea]].

export interface PackCommand {
  name: string;
  description: string;
  body: string;
}

export interface ImportSummary {
  added: number;
  overwritten: number;
  skipped: number;
}

const PACK_VERSION = 1;

/** Build a shareable JSON pack of the currently-installed commands. */
export async function buildPack(home: string): Promise<string> {
  const list = await listInstalledCommands(home);
  const pack = {
    bezierCommandPack: PACK_VERSION,
    commands: list.map((c) => ({
      name: c.name,
      description: c.description,
      body: c.body,
    })),
  };
  return `${JSON.stringify(pack, null, 2)}\n`;
}

/** Parse a pack JSON → valid commands. Throws on malformed JSON / wrong shape;
 * silently drops individual entries that fail validation. */
export function readPack(json: string): PackCommand[] {
  const parsed: unknown = JSON.parse(json);
  const raw = (parsed as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(raw)) throw new Error(tt("commands.packInvalid"));
  const out: PackCommand[] = [];
  for (const entry of raw) {
    const c = entry as Partial<PackCommand>;
    if (typeof c?.name !== "string" || !isValidCommandName(c.name)) continue;
    if (typeof c?.body !== "string") continue;
    out.push({
      name: c.name,
      description: typeof c.description === "string" ? c.description : "",
      body: c.body,
    });
  }
  return out;
}

/** Write imported commands. Non-overwrite by default: existing commands are
 * skipped unless `overwrite` is set (so an import never clobbers the maker's
 * edits without consent). */
export async function writePack(
  home: string,
  cmds: PackCommand[],
  opts: { overwrite: boolean },
): Promise<ImportSummary> {
  const existing = new Set((await listInstalledCommands(home)).map((c) => c.name));
  let added = 0;
  let overwritten = 0;
  let skipped = 0;
  for (const c of cmds) {
    const exists = existing.has(c.name);
    if (exists && !opts.overwrite) {
      skipped++;
      continue;
    }
    await writeCommand(home, c.name, c.description, c.body);
    if (exists) overwritten++;
    else added++;
  }
  return { added, overwritten, skipped };
}

export type BezierCommandsState = "none" | "partial" | "all";

export interface BezierCommandsStatus {
  state: BezierCommandsState;
  present: number;
  total: number;
}

/** How many of the pack's commands currently exist on disk. */
export async function bezierCommandsStatus(home: string): Promise<BezierCommandsStatus> {
  const dir = bezierCommandsDir(home);
  let names = new Set<string>();
  try {
    const entries = await listDir(dir);
    names = new Set(entries.map((e) => e.name));
  } catch {
    // dir missing → nothing installed
  }
  const pack = bezierCommands();
  const present = pack.filter((c) => names.has(`${c.name}.md`)).length;
  const total = pack.length;
  const state: BezierCommandsState =
    present === 0 ? "none" : present === total ? "all" : "partial";
  return { state, present, total };
}

/**
 * Install the `/bezier:*` pack into `~/.claude/commands/bezier/`. EXPLICIT only
 * (called from Settings, never on launch). By default writes only the files that
 * are MISSING — existing files (incl. the maker's edits) are left untouched. Pass
 * `{ overwrite: true }` for an explicit "update to latest" that restamps all.
 * Returns the number of files actually written.
 */
export async function installBezierCommands(
  home: string,
  opts?: { overwrite?: boolean },
): Promise<number> {
  const dir = bezierCommandsDir(home);
  let present = new Set<string>();
  if (!opts?.overwrite) {
    try {
      const entries = await listDir(dir);
      present = new Set(entries.map((e) => e.name));
    } catch {
      // dir missing → write all
    }
  }
  const toWrite = bezierCommands().filter(
    (c) => opts?.overwrite || !present.has(`${c.name}.md`),
  );
  await Promise.all(
    toWrite.map((c) => writeFile(`${dir}/${c.name}.md`, renderCommandFile(c))),
  );
  return toWrite.length;
}

/** Remove the whole `bezier/` pack dir (explicit uninstall from Settings). */
export async function uninstallBezierCommands(): Promise<void> {
  await ipcUninstall();
}
