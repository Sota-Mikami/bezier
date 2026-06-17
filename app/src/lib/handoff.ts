// Handoff bundle (DEC-117 / team-loop seam ②) — the maker's INTENT (spec +
// acceptance criteria + decisions/notes + QA + the env the preview ran against)
// written as a COMMITTED Markdown file in the worktree tree, so it travels with the
// code in the PR diff. Today spec/decisions/QA live under gitignored `.bezier/` and
// only render into the read-only share HTML — so an engineer who clones the branch
// gets code with zero intent. This file fixes that seam: clone the branch / open the
// PR and you get `docs/handoff/<id>.md` with everything needed to finish the build.
//
// This is the "process is a System of Record" thesis made concrete: the why/what/
// acceptance/QA ride INSIDE the diff, not in an ephemeral side-channel.

import { readFile, writeFile } from "@/lib/ipc";
import { slotPath, listDocuments, type Issue } from "@/lib/issues";
import { readQa, seedQaFromSpec, parseSpecCriteria, qaToMarkdown } from "@/lib/qa";

const trimSlash = (p: string) => p.replace(/\/+$/, "");

/** The agent-decided public env the share/preview built against (e.g.
 *  VITE_APP_ENV=development) — read from `.bezier/publish-env.json`. Tells the
 *  engineer which backend the preview targeted (so they know real-data / RLS /
 *  error-path verification is still owed). Empty if never published. */
async function readPreviewEnv(root: string): Promise<Record<string, string>> {
  const txt = await readFile(`${trimSlash(root)}/.bezier/publish-env.json`).catch(() => "");
  if (!txt.trim()) return {};
  try {
    const o = JSON.parse(txt) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = String(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Build the handoff Markdown for an issue: why/what (spec), acceptance criteria
 *  (flagged when empty — the seam Daniel hit), decisions/notes, QA (real table),
 *  and the preview env. All sources are read locally; the result is meant to be
 *  COMMITTED so it travels with the code. */
export async function buildHandoffMarkdown(root: string, issue: Issue): Promise<string> {
  const title = issue.title || "Untitled";
  const spec = await readFile(slotPath(issue, "spec")).catch(() => "");
  const criteria = parseSpecCriteria(spec);

  // Decisions / durable notes = everything under the issue's docs/ except the spec.
  const docs = await listDocuments(issue).catch(() => []);
  const notes: string[] = [];
  for (const d of docs) {
    if (d.type === "spec") continue;
    const md = await readFile(d.path).catch(() => "");
    if (md.trim()) notes.push(`### ${d.label}\n\n${md.trim()}`);
  }

  // QA: saved table, else seeded from the spec's acceptance criteria (mirrors what
  // the app/share show, so the engineer gets the same cases).
  let qa = await readQa(issue).catch(() => null);
  if (!qa) qa = await seedQaFromSpec(issue).catch(() => []);

  const env = await readPreviewEnv(root);

  return [
    `# Handoff — ${title}`,
    "",
    "> Bezier がこの変更の「意図・受入基準・QA」をコードと一緒に届けるために生成したファイルです。",
    "> レビュー用の共有ページとは別に、実装を引き継ぐエンジニアが **git だけで** 全てを受け取れるようにするためのもの。",
    `> Issue: \`${issue.id}\``,
    "",
    "## なぜ / 何を（Spec）",
    "",
    spec.trim() || "_（spec 未記入）_",
    "",
    "## 受入基準（Acceptance criteria）",
    "",
    criteria.length
      ? criteria
          .map((c) => `- [${c.status === "pass" ? "x" : " "}] ${c.scenario}`)
          .join("\n")
      : "> ⚠️ **受入基準が未記入のままハンドオフされています。** 実装に入る前に作り手と合意してください。",
    "",
    "## 決定 / 設計メモ（Decisions & notes）",
    "",
    notes.length ? notes.join("\n\n") : "_（記録なし）_",
    "",
    "## QA",
    "",
    qa.length ? qaToMarkdown(qa) : "_（QA 未作成）_",
    "",
    "## プレビューが叩いた環境（Preview env）",
    "",
    Object.keys(env).length
      ? [
          ...Object.entries(env).map(([k, v]) => `- \`${k}=${v}\``),
          "",
          "> ⚠️ プレビューはこの env で動作確認されています。**実データ・権限(RLS)・実 API のエラー/エッジケースは本番実装側で要検証。**",
        ].join("\n")
      : "_（記録なし — プレビューの接続先が不明。実データ/権限の検証は本番実装側で要確認）_",
    "",
  ].join("\n");
}

/** The committed, in-tree path for an issue's handoff bundle (ULID = unique + safe
 *  as a filename; the title lives inside). */
export function handoffRelPath(issue: Pick<Issue, "id">): string {
  return `docs/handoff/${issue.id}.md`;
}

/** Write the handoff bundle into the WORKTREE tree (a committed path), so the caller
 *  can `git add`/commit it into the branch that gets pushed + PR'd. Returns the
 *  repo-relative path written. */
export async function writeHandoffBundle(
  root: string,
  issue: Issue,
  worktreePath: string,
): Promise<string> {
  const content = await buildHandoffMarkdown(root, issue);
  const rel = handoffRelPath(issue);
  await writeFile(`${trimSlash(worktreePath)}/${rel}`, content);
  return rel;
}
