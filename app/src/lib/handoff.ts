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
import { readShareUrl } from "@/lib/share-urls";

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
  // the app/share show, so the engineer gets the same cases). Track whether it was
  // SEEDED (auto, never run) vs SAVED (human-curated) so the receiving engineer can
  // tell them apart — otherwise auto-rows read as if someone verified them (Daniel).
  let qa = await readQa(issue).catch(() => null);
  const qaSeeded = !qa;
  if (!qa) qa = await seedQaFromSpec(issue).catch(() => []);

  const env = await readPreviewEnv(root);
  const reviewUrl = await readShareUrl(root, issue.id);

  return [
    `# ${title}`,
    "",
    "> この PR の「意図・受入基準・QA」です（Bezier 生成）。実装を引き継ぐエンジニア向けのコンテキストで、PR 本文として渡されます（リポジトリにファイルは追加されません）。",
    `> Issue: \`${issue.id}\``,
    ...(reviewUrl
      ? [
          "",
          `> 🔗 **動くものを見る（レビューページ）**: ${reviewUrl}`,
          "> 実装済みアプリ＋Spec＋QA を1ページで確認できます（作り手のローカル localhost と違い、このリンクはそのまま開けます）。",
        ]
      : [
          "",
          "> ℹ️ **共有レビューページは未発行です。** 動作を見るには、この branch を checkout して dev サーバを起動してください（接続先 env は下記「プレビューが叩いた環境」を参照）。",
        ]),
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
    qa.length
      ? qaSeeded
        ? `> ⚠️ **以下は Spec の受入基準から自動生成した QA で、まだ実行・検証されていません**（人が確認したものではありません）。引き継ぎ前に作り手と実行可否を確認してください。\n\n${qaToMarkdown(qa)}`
        : qaToMarkdown(qa)
      : "_（QA 未作成）_",
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

/** Write the handoff markdown to the gitignored `.bezier` PR-body file (NOT committed
 *  to the repo — a reviewer flagged a committed docs/handoff file as noise) and return
 *  its path, for `gh pr create --body-file`. The handoff rides in the PR BODY. */
export async function writeHandoffPrBody(root: string, issue: Issue): Promise<string> {
  const content = await buildHandoffMarkdown(root, issue);
  const path = `${trimSlash(root)}/.bezier/issues/${issue.id}/pr-body.md`;
  await writeFile(path, content);
  return path;
}
