// Verify → Spec (DEC-071). The old Verify sub-tab asked the AI to PASS/FAIL its
// own work — which every persona distrusted (self-review). This replaces the
// VERDICT with EVIDENCE collected into the Spec: when an Implement turn settles
// we gather what's machine-knowable (change scope, sensitive-area flags, the
// changed files) and write it into a managed "## 検証ログ" block in spec.md. The
// maker self-scores the acceptance-criteria checkboxes with that evidence in
// front of them. No verify.md.

import { readFile, writeFile } from "@/lib/ipc";
import { gitDiff, gitStatus, parseDiff, changedPathsFromStatus } from "@/lib/git";
import { slotPath } from "@/lib/issues";
import type { Issue } from "@/lib/issues";

export const VERIFY_MARK_START = "<!-- bezier:verify:start -->";
export const VERIFY_MARK_END = "<!-- bezier:verify:end -->";

// File-path patterns that mean "you should eyeball this yourself" (Mai: auth /
// DB schema / env are the things she won't trust a machine—or an agent—on).
const SENSITIVE = [
  { re: /(^|\/)\.?env(\.|$)|(^|\/)\.env/i, label: "env" },
  { re: /auth|login|session|oauth|password|credential|token|secret|jwt/i, label: "認証" },
  { re: /migrat|schema|drizzle|prisma|\.sql$|database|(^|\/)db(\/|\.)/i, label: "DB/スキーマ" },
  { re: /(^|\/)(rls|policy|policies)(\/|\.|$)/i, label: "RLS/権限" },
] as const;

export interface VerifyEvidence {
  files: string[];
  added: number;
  removed: number;
  sensitive: string[]; // distinct labels touched
  at: number; // epoch ms (stamped by the caller — Date.now is unavailable here)
}

/** Gather machine-knowable evidence from the worktree's uncommitted changes. */
export async function collectEvidence(
  worktreePath: string,
  at: number,
): Promise<VerifyEvidence> {
  const [diff, status] = await Promise.all([
    gitDiff(worktreePath).catch(() => ""),
    gitStatus(worktreePath).catch(() => ""),
  ]);
  const files = changedPathsFromStatus(status);
  let added = 0;
  let removed = 0;
  for (const ln of parseDiff(diff)) {
    if (ln.kind === "add") added++;
    else if (ln.kind === "del") removed++;
  }
  const sensitive: string[] = [];
  for (const f of files) {
    for (const s of SENSITIVE) {
      if (s.re.test(f) && !sensitive.includes(s.label)) sensitive.push(s.label);
    }
  }
  return { files, added, removed, sensitive, at };
}

function fmtTime(ms: number): string {
  // Local YYYY-MM-DD HH:mm (caller passes Date.now()).
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Render the evidence as the body of the managed block (plain markdown). */
export function renderEvidenceBlock(e: VerifyEvidence): string {
  const scope =
    e.files.length === 0
      ? "変更なし"
      : `${e.files.length} files ・ +${e.added} / -${e.removed}`;
  const sens =
    e.sensitive.length > 0
      ? `⚠️ **${e.sensitive.join(" / ")}** を変更 — ここはあなたの目で確認`
      : "なし（auth/DB/env/権限への変更は検出されず）";
  const fileList =
    e.files.length === 0
      ? []
      : [
          "",
          "<details><summary>変更ファイル</summary>",
          "",
          ...e.files.slice(0, 40).map((f) => `- \`${f}\``),
          ...(e.files.length > 40 ? [`- …他 ${e.files.length - 40} 件`] : []),
          "",
          "</details>",
        ];
  return [
    VERIFY_MARK_START,
    "## 検証ログ（Bezier が自動収集）",
    `_最終更新: ${fmtTime(e.at)} ・ Implement ターン終了時に自動収集_`,
    "",
    `- **変更スコープ**: ${scope}`,
    `- **機微領域**: ${sens}`,
    ...fileList,
    "",
    "> 受入基準のチェックは、上の証拠を見て **あなた（maker）が** 付けてください（AI は採点しません）。",
    VERIFY_MARK_END,
  ].join("\n");
}

/** Write/replace the managed 検証ログ block in spec.md (idempotent). */
export async function syncVerifyBlock(
  issue: Pick<Issue, "dir">,
  e: VerifyEvidence,
): Promise<void> {
  const path = slotPath(issue, "spec");
  let text: string;
  try {
    text = await readFile(path);
  } catch {
    return;
  }
  const re = new RegExp(
    `\\n*${escapeReg(VERIFY_MARK_START)}[\\s\\S]*?${escapeReg(VERIFY_MARK_END)}\\n*`,
    "g",
  );
  const without = text.replace(re, "\n");
  const block = renderEvidenceBlock(e);
  const next = `${without.replace(/\s*$/, "")}\n\n${block}\n`;
  if (next !== text) await writeFile(path, next);
}

// ---------------------------------------------------------------------------
// Acceptance-criteria parsing (the "受入基準" checkboxes the maker self-scores)
// ---------------------------------------------------------------------------

export interface Criterion {
  /** 0-based line index in spec.md. */
  line: number;
  text: string;
  checked: boolean;
}

const CRIT_RE = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

/** Pull the checkbox items under the "## 受入基準" heading. */
export function parseCriteria(specMd: string): Criterion[] {
  const lines = specMd.split("\n");
  const out: Criterion[] = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l)) {
      inSection = /受入基準/.test(l);
      continue;
    }
    if (!inSection) continue;
    const m = CRIT_RE.exec(l);
    if (m) out.push({ line: i, text: m[2].trim(), checked: m[1].toLowerCase() === "x" });
  }
  return out;
}

/** Flip a single criterion's checkbox in spec.md text and return the new text. */
export function toggleCriterionText(specMd: string, line: number): string {
  const lines = specMd.split("\n");
  const l = lines[line];
  if (l == null) return specMd;
  const m = CRIT_RE.exec(l);
  if (!m) return specMd;
  const next = m[1].toLowerCase() === "x" ? " " : "x";
  lines[line] = l.replace(/\[([ xX])\]/, `[${next}]`);
  return lines.join("\n");
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
