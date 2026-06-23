// LOOP TERRAIN (E-4 backbone) — what an issue HAS right now, as reversible FACTS, not
// a waterfall with completion gates (CEO: "there is no 'Spec done' state — you make
// and refine, and step backward when needed"). Bezier is a making loop:
// requirements ⇄ design ⇄ prototype ⇄ share/handoff.
//
// Two consumers (persona-review convergence: the loop doctrine is "Clippy" unless it's
// grounded in real terrain):
//   1. the AGENT — `terrainForAgent` is injected into the per-turn seed so next-move
//      suggestions are grounded in what EXISTS (not guessed).
//   2. the MAKER — `describeTerrain` renders a compact "今ここ" orientation chip.
//
// Pure `deriveTerrain`/`describeTerrain`/`terrainForAgent` are unit-tested; the thin
// async `gatherTerrain` does the fs reads (not pure, not unit-tested).

import { getSettings } from "@/lib/settings";
import type { Locale } from "@/lib/i18n/locales";
import { parseSpecCriteria } from "@/lib/qa";
import { listVariants } from "@/lib/variants";
import { readWorktreeRef, slotPath, type Issue } from "@/lib/issues";
import { readFile } from "@/lib/ipc";
import { readShareUrl } from "@/lib/share-urls";

/** Raw, source-agnostic facts (so derive/describe stay pure + testable). */
export interface TerrainFacts {
  /** spec.md length with whitespace stripped (a stub vs a real spec). */
  specChars: number;
  /** acceptance criteria parsed from the spec. */
  criteriaCount: number;
  /** design/*.html explorations present. */
  designCount: number;
  /** a worktree exists = implementation has started. */
  hasImplementation: boolean;
  /** a published review/share URL exists. */
  isShared: boolean;
  /** Open-PR has been used (PR-opened marker). */
  prOpened: boolean;
}

export interface LoopTerrain {
  hasSpec: boolean;
  hasCriteria: boolean;
  designCount: number;
  hasImplementation: boolean;
  isShared: boolean;
  prOpened: boolean;
  /** true only when nothing exists yet (fresh issue). */
  isEmpty: boolean;
}

const SPEC_MIN_CHARS = 40; // more than the auto-created spec stub

/** Normalize raw facts → terrain. Reversible facts only; NO "stage/completion". */
export function deriveTerrain(f: TerrainFacts): LoopTerrain {
  const hasSpec = f.specChars >= SPEC_MIN_CHARS;
  const designCount = Math.max(0, Math.floor(f.designCount));
  const t = {
    hasSpec,
    hasCriteria: f.criteriaCount > 0,
    designCount,
    hasImplementation: f.hasImplementation,
    isShared: f.isShared,
    prOpened: f.prOpened,
  };
  return {
    ...t,
    isEmpty:
      !t.hasSpec && designCount === 0 && !t.hasImplementation && !t.isShared && !t.prOpened,
  };
}

/** Compact one-line summary for the maker's "今ここ" chip (e.g. "Spec · 2 designs ·
 *  implementing · shared"). Order follows the loop but carries NO completion meaning. */
export function describeTerrain(t: LoopTerrain, locale: Locale = getSettings().locale): string {
  const ja = locale === "ja";
  if (t.isEmpty) return ja ? "これから" : "starting";
  const parts: string[] = [];
  if (t.hasSpec) parts.push("Spec");
  if (t.designCount > 0)
    parts.push(ja ? `デザイン${t.designCount}案` : `${t.designCount} design${t.designCount > 1 ? "s" : ""}`);
  if (t.hasImplementation) parts.push(ja ? "実装" : "implementing");
  if (t.isShared) parts.push(ja ? "共有済" : "shared");
  if (t.prOpened) parts.push("PR");
  return parts.join(ja ? " ・ " : " · ");
}

/** A short factual snapshot injected into the agent's per-turn seed, so its ONE
 *  next-move suggestion is grounded in what EXISTS (forward or backward) rather than
 *  guessed. Returns lines (the caller joins). */
export function terrainForAgent(t: LoopTerrain, locale: Locale = getSettings().locale): string[] {
  const ja = locale === "ja";
  const spec = t.hasSpec
    ? ja
      ? `あり（受入基準${t.hasCriteria ? "あり" : "まだ"}）`
      : `present (acceptance criteria ${t.hasCriteria ? "present" : "not yet"})`
    : ja
      ? "まだ"
      : "not yet";
  return [
    ja
      ? "## 現在地（terrain — 事実。完了の意味ではない）"
      : "## Where things stand (terrain — facts, not 'done')",
    "",
    ja ? `- Spec: ${spec}` : `- Spec: ${spec}`,
    ja ? `- デザイン案(html): ${t.designCount}` : `- Design explorations (html): ${t.designCount}`,
    ja
      ? `- 実装(worktree): ${t.hasImplementation ? "あり" : "まだ"}`
      : `- Implementation (worktree): ${t.hasImplementation ? "yes" : "not yet"}`,
    ja
      ? `- 共有: ${t.isShared ? "済" : "まだ"} ／ PR: ${t.prOpened ? "あり" : "まだ"}`
      : `- Shared: ${t.isShared ? "yes" : "no"} / PR: ${t.prOpened ? "opened" : "no"}`,
    "",
    ja
      ? "これを踏まえ、返信の最後（作業が一区切りした時）に、最も価値のある next move を1つだけ提案（前へでも後ろへでも）。"
      : "Use this to ground ONE next-move suggestion at the end of your reply (when the step is complete) — forward or backward.",
    "",
  ];
}

/** Read the issue's terrain from disk (fs; not pure). Best-effort — any read that
 *  fails contributes a "not yet" fact rather than throwing. */
export async function gatherTerrain(root: string, issue: Issue): Promise<LoopTerrain> {
  const [spec, variants, ref, shareUrl] = await Promise.all([
    readFile(slotPath(issue, "spec")).catch(() => ""),
    listVariants(issue).catch(() => []),
    readWorktreeRef(issue).catch(() => null),
    readShareUrl(root, issue.id).catch(() => null),
  ]);
  return deriveTerrain({
    specChars: spec.replace(/\s+/g, "").length,
    criteriaCount: parseSpecCriteria(spec).length,
    designCount: variants.length,
    hasImplementation: !!ref,
    isShared: !!shareUrl,
    prOpened: !!ref?.prUrl,
  });
}
