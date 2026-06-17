// QA data layer (per-issue). Stored at <issue.dir>/qa.json — under `.bezier`
// (gitignored, OUTSIDE the worktree), so the PR stays clean (the moat principle:
// Bezier's metadata never lands in the committed code). Seeded from the Spec's
// acceptance criteria; the table itself is structured so it stays TSV/MD-portable
// (see qa-proposal.tsx) for teams that manage QA in a spreadsheet.

import { readFile, writeFile } from "@/lib/ipc";
import { slotPath, type Issue } from "@/lib/issues";

export type QaStatus = "todo" | "pass" | "fail";
export type QaPriority = "P0" | "P1" | "P2";

export interface QaItem {
  id: string;
  status: QaStatus;
  priority: QaPriority;
  area: string;
  scenario: string;
  expected: string;
  note: string;
}

export function qaPath(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/qa.json`;
}

/** Load the issue's QA, or null if it hasn't been created yet. */
export async function readQa(issue: Pick<Issue, "dir">): Promise<QaItem[] | null> {
  try {
    const raw = await readFile(qaPath(issue));
    const data = JSON.parse(raw) as { items?: unknown };
    return Array.isArray(data.items) ? (data.items as QaItem[]) : null;
  } catch {
    return null;
  }
}

/** Persist the issue's QA (PR-safe: under .bezier, never committed). */
export async function writeQa(issue: Pick<Issue, "dir">, items: QaItem[]): Promise<void> {
  await writeFile(qaPath(issue), `${JSON.stringify({ version: 1, items }, null, 2)}\n`);
}

/** Parse `- [ ] …` acceptance criteria (+ their `- 根拠: …` line) into QA rows. */
export function parseSpecCriteria(specMd: string): QaItem[] {
  const lines = specMd.split("\n");
  const out: QaItem[] = [];
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*-\s*\[([ xX])\]\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const scenario = m[2].trim();
    let note = "";
    const next = lines[i + 1] ?? "";
    // The agent's evidence line follows its locale (DEC-108): "根拠:" (ja) or
    // "evidence:" (en). Match either so parsing is resilient to either language.
    const g = /^\s+-\s*(?:根拠|evidence)[:：]\s*(.*)$/i.exec(next);
    if (g) note = g[1].trim();
    out.push({
      id: String(++n),
      status: checked ? "pass" : "todo",
      priority: "P1",
      area: "",
      scenario,
      expected: "",
      note,
    });
  }
  return out;
}

/** Render QA rows as a committed-friendly Markdown table (fixed English headers so
 *  it reads in a PR diff regardless of locale). Used by the handoff bundle so the
 *  implementing engineer gets the QA as a real file, not a read-only HTML grid. */
export function qaToMarkdown(items: QaItem[]): string {
  const cols = ["Status", "Priority", "Area", "Case", "Expected", "Basis"];
  const statusLabel: Record<QaStatus, string> = { todo: "TODO", pass: "PASS", fail: "FAIL" };
  const cell = (s: string) => (s || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = items.map(
    (i) =>
      `| ${[statusLabel[i.status], i.priority, i.area, i.scenario, i.expected, i.note]
        .map(cell)
        .join(" | ")} |`,
  );
  return [head, sep, ...body].join("\n");
}

/** Seed QA rows from the Spec's acceptance criteria (empty if none / no spec). */
export async function seedQaFromSpec(issue: Issue): Promise<QaItem[]> {
  try {
    const spec = await readFile(slotPath(issue, "spec"));
    return parseSpecCriteria(spec);
  } catch {
    return [];
  }
}
