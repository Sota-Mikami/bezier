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

interface BezierCommand {
  /** file stem → invoked as `/bezier:<name>` */
  name: string;
  /** shown in claude's `/` menu */
  description: string;
  /** the command body (the prompt claude runs) */
  body: string;
}

export const BEZIER_COMMANDS: BezierCommand[] = [
  {
    name: "verify",
    description: "受入基準の直下に「根拠」を1行ずつ付す（採点はしない）",
    body: [
      "spec.md（worktree の外。`--add-dir` 済み）の受入基準を上から順に確認し、実装が済んでいる各基準の**直下に「根拠」を1行**付けてください。",
      "",
      "- 根拠 ＝ **どこに / どう実装したか・関連ファイル**。例: `  - 根拠: \\`src/auth/login.tsx\\` に実装。`",
      "- **auth / DB・スキーマ / env / 権限** に触れた基準には ⚠️ を付けて明記する（要目視）。",
      "- **PASS/FAIL の採点はしない**。採点は maker が根拠を見て行う。",
      "",
      "最後に変更点を簡潔に要約してください（commit は人間が Bezier の UI から行います）。",
    ].join("\n"),
  },
  {
    name: "spec",
    description: "spec.md を読み直して実装と同期する",
    body: [
      "spec.md（`--add-dir` 済み）を読み直し、いまの会話・実装と**食い違う点**を洗い出してください。",
      "",
      "- 要件や意図が変わっていれば、**まず spec.md を更新**してから、その差分に合わせて実装を調整する（Spec⇆実装を常に同期）。",
      "- 「受入基準」は**観察可能・チェック可能な文**に保つ。曖昧なものは具体化する。",
      "- 「やらないこと」で境界も引く。",
    ].join("\n"),
  },
  {
    name: "states",
    description: "画面のエッジ状態を洗い出し、受入基準に落とす（Empty/Error/Focus…）",
    body: [
      "$ARGUMENTS の画面/コンポーネントについて、**エッジ状態を洗い出し → 決定し → spec.md の受入基準として書く**（引数が無ければ、いま検討中の画面について）。デザイナー↔エンジニアの「Empty どうする？Focus は？」を、レビューでなく **いま spec で** 潰すのが目的。",
      "",
      "1. 画面を **アーキタイプ** に分類し、聞くべき状態を選ぶ:",
      "   - リスト/テーブル: 空 / 読み込み中 / エラー / 1件のみ / 大量(ページング) / 長文省略 / 権限なし",
      "   - フォーム: 初期 / 検証エラー / 送信中 / 成功 / サーバエラー / 未保存離脱",
      "   - 詳細: 読み込み中 / 不在(404) / 権限なし / 編集中",
      "   - ダッシュボード: 空 / 読み込み中 / 一部失敗 / 更新中",
      "   - 認証/オンボーディング: 初期 / エラー / 処理中 / 成功遷移",
      "   - 横断(操作状態): hover / focus / active / disabled / selected",
      "2. 各状態に **既定の振る舞い案を1行** 添えて提示し、maker に「いる/いらない・内容」を確認する（勝手に確定しない）。",
      "3. 合意した状態を **spec.md の「受入基準」に観察可能な文で追記** する。例: 「- Empty: 一覧が0件のとき、イラスト＋『最初のXを作成』CTAを表示」。",
      "4. **アクセシビリティ最低線** は既定で含める: キーボード focus の可視リング / 主要操作のラベル / コントラスト。",
      "",
      "ここでは **実装しない** — 状態を決めて spec に書くところまで。実装後は /bezier:verify で各状態の根拠を確認する。",
      "",
      "（これは Bezier 既定の states チェックリスト。a11y厳格・モバイル優先・業種コンプラ等、チームの基準に合わせて編集／差し替え可能。）",
    ].join("\n"),
  },
  {
    name: "alt3",
    description: "デザイン別案を3つ（グレースケールのワイヤー）",
    body: [
      "$ARGUMENTS の UI について、**方向性の異なるデザイン別案を3つ**、グレースケールのワイヤーで作ってください（引数が無ければ、いま検討中の画面について）。",
      "",
      "- Bezier の `design/` 規約に従い、**Design ボードに並ぶ形**で出力する。",
      "- 各案に**トレードオフを1行**添える（何を取り、何を捨てたか）。",
      "- まだ実装はしない。方向が選ばれてから実装に入る。",
    ].join("\n"),
  },
  {
    name: "precommit",
    description: "型・lint・動作を事前チェックして結果を報告",
    body: [
      "コミット前チェックをしてください:",
      "",
      "1. 型チェック・lint を実行する。",
      "2. 主要な変更が**実際に動く**かを確認する。",
      "3. 結果（PASS/FAIL と、直したもの）を簡潔に報告する。",
      "",
      "**commit はしない** — 人間が Bezier の UI（Commit / Ship）から行います。",
    ].join("\n"),
  },
];

/** `~/.claude/commands/bezier` — where the pack lives (claude's user command dir). */
export function bezierCommandsDir(home: string): string {
  return `${home.replace(/\/+$/, "")}/.claude/commands/bezier`;
}

function renderCommandFile(c: { description: string; body: string }): string {
  return [`---`, `description: ${c.description}`, `---`, ``, c.body, ``].join("\n");
}

/** The built-in command names (vs. the maker's own custom ones). */
export const BUILTIN_NAMES: Set<string> = new Set(BEZIER_COMMANDS.map((c) => c.name));

/** The Bezier default for a built-in (for "reset to default"); undefined if custom. */
export function builtinDefault(name: string): BezierCommand | undefined {
  return BEZIER_COMMANDS.find((c) => c.name === name);
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
  const rank = (c: InstalledCommand) => {
    const i = BEZIER_COMMANDS.findIndex((b) => b.name === c.name);
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
  if (!Array.isArray(raw)) throw new Error("コマンドパックの形式ではありません。");
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
  const present = BEZIER_COMMANDS.filter((c) => names.has(`${c.name}.md`)).length;
  const total = BEZIER_COMMANDS.length;
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
  const toWrite = BEZIER_COMMANDS.filter(
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
