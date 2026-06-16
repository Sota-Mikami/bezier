// Verify → Spec (DEC-071/072). The old Verify sub-tab asked the AI to PASS/FAIL
// its own work — which every persona distrusted (self-review). No bespoke UI now
// (DEC-072): verification lives IN the Spec. Two evidence sources, both written
// into spec.md so the maker reads them in the editor and ticks the criteria:
//   1. per-criterion GROUNDS — the agent writes them under each 受入基準 at the
//      end of an Implement turn (Implement handoff), and
//   2. this module's OBJECTIVE machine evidence — change scope + sensitive-area
//      flags from git (the part the agent can't fudge) → a managed "## 検証ログ"
//      block, collected when the turn settles.
// The AI never scores; the maker does. No verify.md.

import { readFile, writeFile } from "@/lib/ipc";
import { gitDiff, gitStatus, parseDiff, changedPathsFromStatus } from "@/lib/git";
import { slotPath } from "@/lib/issues";
import type { Issue } from "@/lib/issues";
import { verifyPhrases, type SensitiveKey } from "@/lib/prompts";

export const VERIFY_MARK_START = "<!-- bezier:verify:start -->";
export const VERIFY_MARK_END = "<!-- bezier:verify:end -->";

// File-path patterns that mean "you should eyeball this yourself" (Mai: auth /
// DB schema / env are the things she won't trust a machine—or an agent—on). The
// labels follow the UI locale (DEC-108) — resolved from the key at render time.
const SENSITIVE: { re: RegExp; key: SensitiveKey }[] = [
  { re: /(^|\/)\.?env(\.|$)|(^|\/)\.env/i, key: "env" },
  { re: /auth|login|session|oauth|password|credential|token|secret|jwt/i, key: "auth" },
  { re: /migrat|schema|drizzle|prisma|\.sql$|database|(^|\/)db(\/|\.)/i, key: "db" },
  { re: /(^|\/)(rls|policy|policies)(\/|\.|$)/i, key: "rls" },
];

export interface VerifyEvidence {
  files: string[];
  added: number;
  removed: number;
  sensitive: SensitiveKey[]; // distinct sensitive-area keys touched
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
  const sensitive: SensitiveKey[] = [];
  for (const f of files) {
    for (const s of SENSITIVE) {
      if (s.re.test(f) && !sensitive.includes(s.key)) sensitive.push(s.key);
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

/** Render the evidence as the body of the managed block (plain markdown). The
 * copy follows the maker's UI locale (DEC-108). */
export function renderEvidenceBlock(e: VerifyEvidence): string {
  const p = verifyPhrases();
  const scope =
    e.files.length === 0 ? p.noChanges : p.scope(e.files.length, e.added, e.removed);
  const sens =
    e.sensitive.length > 0
      ? p.sensChanged(e.sensitive.map((k) => p.sens[k]).join(" / "))
      : p.sensNone;
  const fileList =
    e.files.length === 0
      ? []
      : [
          "",
          `<details><summary>${p.changedFiles}</summary>`,
          "",
          ...e.files.slice(0, 40).map((f) => `- \`${f}\``),
          ...(e.files.length > 40 ? [`- ${p.moreFiles(e.files.length - 40)}`] : []),
          "",
          "</details>",
        ];
  return [
    VERIFY_MARK_START,
    p.blockHeader,
    p.lastUpdated(fmtTime(e.at)),
    "",
    `- ${p.scopeLabel}: ${scope}`,
    `- ${p.sensLabel}: ${sens}`,
    ...fileList,
    "",
    p.makerChecks,
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

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
