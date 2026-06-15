// AnnotationSurface builders for the surfaces that don't already have one.
// Preview keeps its "build" surface (preview-pane) and design html keeps
// `designSurface` (design-variants); these add md docs / Map / QA. Each surface
// only declares WHAT the annotations instruct — the AnnotationLayer (Pin / Area /
// Pen + screenshot) is fully shared. Sending routes through sendDesignFeedback.

import type { ImplementSession } from "./implement-session-types";
import type { AnnotationSurface } from "./design-annotations";

function feedbackSurface(
  session: ImplementSession,
  key: string,
  canSend: boolean,
  cannotSendMessage: string,
  header: string[],
): AnnotationSurface {
  return {
    key,
    canSend,
    cannotSendMessage,
    buildPrompt: (lines, shot) =>
      [
        ...header,
        shot
          ? `注釈つきスクリーンショット: \`${shot}\`（同じ番号の付いた箇所を確認してください）`
          : "(スクリーンショットは取得できませんでした。位置％を参考にしてください)",
        "",
        ...lines,
        "",
        "対応したら変更点を簡潔に要約してください（commit は人間が Bezier の UI から行います）。",
      ].join("\n"),
    send: (p, n) => session.sendDesignFeedback(p, n),
  };
}

/** md document (Spec / 決定 / QA-doc): reflect the annotations into the doc or impl. */
export function docAnnotationSurface(
  session: ImplementSession,
  docPath: string,
  type: string,
  label: string,
): AnnotationSurface {
  return feedbackSurface(
    session,
    `doc:${type}`,
    true,
    "利用可能なエージェントが見つかりません。",
    [
      `## ドキュメント「${label}」への注釈`,
      `\`${docPath}\` の下記の番号付き注釈を反映してください（文書の更新、または実装への反映）。`,
    ],
  );
}

/** Map (bird's-eye): annotations target the scoped screens of the real app. */
export function mapAnnotationSurface(
  session: ImplementSession,
  routes: string[],
): AnnotationSurface {
  return feedbackSurface(
    session,
    "map",
    !!session.ref,
    "先に Prototype で worktree を作成してください。",
    [
      "## Map（俯瞰）への注釈",
      `対象範囲: ${routes.join(", ") || "(未指定)"}。下記の注釈に従い、該当画面を worktree 内で修正してください。`,
    ],
  );
}

/** QA table: annotations are remarks on test cases / coverage. */
export function qaAnnotationSurface(session: ImplementSession): AnnotationSurface {
  return feedbackSurface(
    session,
    "qa",
    true,
    "利用可能なエージェントが見つかりません。",
    [
      "## QA への注釈",
      "下記は QA 項目・観点への指摘です。spec.md の受入基準や実装に反映してください。",
    ],
  );
}
