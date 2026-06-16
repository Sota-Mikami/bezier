// Agent-facing prompt text (DEC-108) — follows the maker's UI locale.
//
// Kept SEPARATE from the UI catalog (src/lib/i18n): these are long, structured
// instructions sent to the user's own `claude` agent (and visible in the chat),
// assembled from per-locale phrases. The English must preserve the BEHAVIOR of
// the Japanese original — e.g. Clarify-first, acceptance criteria = Definition
// of Done, "commits are made by a human from Bezier's UI", the design-variant
// conventions. Assembly lives here so each call site is a one-liner.
//
// Scope (this slice): the inline annotation-feedback prompts (preview / doc /
// Map / QA / design-revise), the adopt-variant prompt, and the merge-conflict
// prompt. The big implement/variant HANDOFF builders + BEZIER.md guide
// (issues.ts) are a separate, reviewed slice.

import { getSettings } from "@/lib/settings";
import type { Locale } from "@/lib/i18n/locales";

interface PromptPhrases {
  /** Shared trailer: how the agent should wrap up (commits are human-driven). */
  summarizeViaUi: string;
  /** Annotated-screenshot reference (check the numbered spots). */
  shotRef: (shot: string) => string;
  /** Shown when no screenshot could be captured (use the % positions). */
  shotNone: string;
  /** Prefix for a batch-wide instruction line. */
  overall: (note: string) => string;
  /** Fallback when a mark has no text (refer to the drawing / target). */
  markFallback: string;

  // --- annotation "where" descriptors (design-annotations describe()) ---
  describePen: (pos: string) => string;
  describeRect: (topLeft: string, w: string, h: string) => string;
  describeElement: (tag: string, selector: string, pos: string) => string;
  describeSelector: (selector: string) => string;
  describeElementWord: string;
  describePin: (pos: string) => string;

  // --- preview "build" surface ---
  previewHeader: string;
  previewIntro: string;

  // --- md doc / Map / QA surfaces ---
  docHeader: (label: string) => string;
  docIntro: (docPath: string) => string;
  mapHeader: string;
  mapIntro: (routes: string) => string;
  routesUnset: string;
  qaHeader: string;
  qaIntro: string;

  // --- design wireframe revise ---
  reviseHeader: (id: string) => string;
  reviseIntro: (filePath: string) => string;
  reviseKeepConvention: string;
  reviseSummarize: string;

  // --- adopt a design direction (build it in the worktree) ---
  adopt: (id: string, designDir: string) => string[];

  // --- AI conflict resolution ---
  conflict: (worktree: string, base: string, files: string | null) => string[];
}

const JA: PromptPhrases = {
  summarizeViaUi:
    "対応したら変更点を簡潔に要約してください（commit は人間が Bezier の UI から行います）。",
  shotRef: (shot) =>
    `注釈つきスクリーンショット: \`${shot}\`（同じ番号の付いた箇所を確認してください）`,
  shotNone: "(スクリーンショットは取得できませんでした。位置％を参考にしてください)",
  overall: (note) => `（全体の指示）${note}`,
  markFallback: "(描画/指定を参照)",

  describePen: (pos) => `ペン注釈 位置 ${pos}`,
  describeRect: (tl, w, h) => `領域 左上 ${tl} / 幅${w} 高${h}`,
  describeElement: (tag, sel, pos) => `${tag}${sel} 位置 ${pos}`,
  describeSelector: (sel) => ` セレクタ \`${sel}\``,
  describeElementWord: "要素",
  describePin: (pos) => `ピン 位置 ${pos}`,

  previewHeader: "## デザインフィードバック",
  previewIntro:
    "プレビュー上の注釈への修正依頼です。下記の番号付き指示に従い、この worktree 内の UI を修正してください。",

  docHeader: (label) => `## ドキュメント「${label}」への注釈`,
  docIntro: (docPath) =>
    `\`${docPath}\` の下記の番号付き注釈を反映してください（文書の更新、または実装への反映）。`,
  mapHeader: "## Map（俯瞰）への注釈",
  mapIntro: (routes) =>
    `対象範囲: ${routes}。下記の注釈に従い、該当画面を worktree 内で修正してください。`,
  routesUnset: "(未指定)",
  qaHeader: "## QA への注釈",
  qaIntro:
    "下記は QA 項目・観点への指摘です。spec.md の受入基準や実装に反映してください。",

  reviseHeader: (id) => `## デザイン別案の改訂 — 案 ${id}`,
  reviseIntro: (filePath) =>
    `\`${filePath}\` を、下記の番号付き注釈に従って改訂してください。`,
  reviseKeepConvention:
    "**ワイヤーの規約は維持**：スタック非依存・プレーンなインライン CSS のみ・グレースケール。**実装コードは書かない**（これは Design）。",
  reviseSummarize: "改訂したらチャットで一言だけ要約してください。",

  adopt: (id, designDir) => [
    `デザインの方向として **案 ${id}（design/${id}-*.html）を採用** します。`,
    `\`${designDir}\` の案 ${id} を読み、その方向に沿って **この worktree 内の実コード（実物の DS）で実装/調整** してください（受入基準を満たすことをゴールに）。`,
    "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
  ],

  conflict: (worktree, base, files) =>
    [
      `git worktree \`${worktree}\` でベースブランチ \`${base}\` を取り込んだ際にマージ衝突が発生しました。`,
      files ? `衝突ファイル: ${files}。` : "",
      "各ファイルの衝突マーカー (<<<<<<< / ======= / >>>>>>>) を解決し、解決後に `git add` してください（commit は人間が UI の Commit から行います）。",
    ].filter(Boolean),
};

const EN: PromptPhrases = {
  summarizeViaUi:
    "When you're done, summarize the changes briefly (commits are made by a human from Bezier's UI).",
  shotRef: (shot) =>
    `Annotated screenshot: \`${shot}\` (open it and check the spots with matching numbers).`,
  shotNone:
    "(No screenshot could be captured — use the % positions as a reference.)",
  overall: (note) => `(Overall instruction) ${note}`,
  markFallback: "(refer to the drawing / target)",

  describePen: (pos) => `Pen annotation at ${pos}`,
  describeRect: (tl, w, h) => `Region, top-left ${tl} / width ${w}, height ${h}`,
  describeElement: (tag, sel, pos) => `${tag}${sel} at ${pos}`,
  describeSelector: (sel) => ` selector \`${sel}\``,
  describeElementWord: "element",
  describePin: (pos) => `Pin at ${pos}`,

  previewHeader: "## Design feedback",
  previewIntro:
    "These are fix requests for the annotations on the preview. Follow the numbered instructions below and fix the UI inside this worktree.",

  docHeader: (label) => `## Annotations on the “${label}” document`,
  docIntro: (docPath) =>
    `Reflect the numbered annotations below into \`${docPath}\` (update the document, or carry them into the implementation).`,
  mapHeader: "## Annotations on the Map (bird's-eye)",
  mapIntro: (routes) =>
    `Scope: ${routes}. Following the annotations below, fix the corresponding screens inside the worktree.`,
  routesUnset: "(unspecified)",
  qaHeader: "## Annotations on QA",
  qaIntro:
    "The following are remarks on QA cases / coverage. Reflect them into the acceptance criteria in spec.md and the implementation.",

  reviseHeader: (id) => `## Revise design variant — variant ${id}`,
  reviseIntro: (filePath) =>
    `Revise \`${filePath}\` according to the numbered annotations below.`,
  reviseKeepConvention:
    "**Keep the wireframe conventions**: stack-independent, plain inline CSS only, grayscale. **Do not write implementation code** (this is Design).",
  reviseSummarize: "Once revised, give a one-line summary in the chat.",

  adopt: (id, designDir) => [
    `Adopting **variant ${id} (design/${id}-*.html)** as the design direction.`,
    `Read variant ${id} in \`${designDir}\` and, following that direction, **implement/adjust it in the real code inside this worktree (the real design system)** — with the goal of meeting the acceptance criteria.`,
    "When you're done, summarize the changes briefly (commits are made by a human from the UI).",
  ],

  conflict: (worktree, base, files) =>
    [
      `A merge conflict occurred while bringing the base branch \`${base}\` into the git worktree \`${worktree}\`.`,
      files ? `Conflicting files: ${files}.` : "",
      "Resolve the conflict markers (<<<<<<< / ======= / >>>>>>>) in each file and run `git add` once resolved (commits are made by a human from the UI's Commit).",
    ].filter(Boolean),
};

/** The active prompt phrase set (the maker's UI locale, DEC-108). */
export function promptPhrases(locale: Locale = getSettings().locale): PromptPhrases {
  return locale === "ja" ? JA : EN;
}

// --- assembled prompts (each call site is a one-liner) --------------------

/** Shared body: header lines + screenshot ref + the numbered lines + trailer. */
function feedbackBody(p: PromptPhrases, header: string[], lines: string[], shot: string | null): string {
  return [
    ...header,
    shot ? p.shotRef(shot) : p.shotNone,
    "",
    ...lines,
    "",
    p.summarizeViaUi,
  ].join("\n");
}

export function previewFeedbackPrompt(lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return feedbackBody(p, [p.previewHeader, p.previewIntro], lines, shot);
}

export function docFeedbackPrompt(label: string, docPath: string, lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return feedbackBody(p, [p.docHeader(label), p.docIntro(docPath)], lines, shot);
}

export function mapFeedbackPrompt(routes: string[], lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return feedbackBody(p, [p.mapHeader, p.mapIntro(routes.join(", ") || p.routesUnset)], lines, shot);
}

export function qaFeedbackPrompt(lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return feedbackBody(p, [p.qaHeader, p.qaIntro], lines, shot);
}

export function designRevisePrompt(id: string, filePath: string, lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return [
    p.reviseHeader(id),
    p.reviseIntro(filePath),
    p.reviseKeepConvention,
    shot ? p.shotRef(shot) : p.shotNone,
    "",
    ...lines,
    "",
    p.reviseSummarize,
  ].join("\n");
}

export function adoptVariantPrompt(id: string, designDir: string): string {
  return promptPhrases().adopt(id, designDir).join("\n");
}

export function conflictResolvePrompt(worktree: string, base: string, files: string | null): string {
  return promptPhrases().conflict(worktree, base, files).join("\n");
}
