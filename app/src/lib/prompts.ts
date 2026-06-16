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
  previewScreen: (route: string) => string;

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
  previewScreen: (route) => `対象画面: \`${route}\``,

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
    "**html の規約は維持**：自己完結（プレーンな html + インライン CSS のみ・外部依存なし）。`design-system.md` やトークンがあればブランドに沿わせる。**実装コードは書かない**（これは Design）。",
  reviseSummarize: "改訂したらチャットで一言だけ要約してください。",

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
  previewScreen: (route) => `Screen shown: \`${route}\``,

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
    "**Keep the html conventions**: self-contained (plain html + inline CSS only, no external deps). Stay on-brand via `design-system.md` / tokens if present. **Do not write implementation code** (this is Design).",
  reviseSummarize: "Once revised, give a one-line summary in the chat.",

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

export function previewFeedbackPrompt(route: string, lines: string[], shot: string | null): string {
  const p = promptPhrases();
  return feedbackBody(p, [p.previewHeader, p.previewIntro, p.previewScreen(route)], lines, shot);
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

export function conflictResolvePrompt(worktree: string, base: string, files: string | null): string {
  return promptPhrases().conflict(worktree, base, files).join("\n");
}

// ===========================================================================
// Handoff tier (DEC-108): the implement / variant HANDOFF docs + the BEZIER.md
// guide — the core agent harness (DEC-050/057). Same en/ja-co-located shape so a
// future tuning pass improves all locales together (see the prompt-tuning memo).
// ===========================================================================

interface HandoffPhrases {
  untitled: string;
  specMissing: string;

  // BEZIER.md guide
  guideTitle: string;
  guideIntro: string;
  livingSpecHeader: string;
  livingSpec: (specPath: string) => string[];
  docsHeader: string;
  docs: (issueDir: string) => string[];
  titleHeader: string;
  titleRule: string;
  evidenceHeader: string;
  evidence: string[];
  shortcutsHeader: string;
  shortcuts: string[];

  // design-variant convention (its own block: header + lines + trailing blank)
  designBlock: (designDir: string) => string[];

  // implement handoff
  implementTitle: (title: string) => string;
  introUser: (worktree: string, specPath: string) => string[];
  introFollowUp: (worktree: string) => string[];
  introPlain: (worktree: string) => string[];
  monorepo: (subPath: string) => string[];
  guideRef: (guidePath: string) => string[];
  userRequestHeader: string;
  issueHeader: string;
  specHeader: string;

  // variant handoff
  variantTitle: (title: string) => string;
  variantBody: (a: { worktree: string; ids: string[]; ctx: string; designGlob: string }) => string[];
}

const JA_HANDOFF: HandoffPhrases = {
  untitled: "(無題)",
  specMissing: "(spec.md がありません)",

  guideTitle: "# Bezier — この issue での作法（自動生成。毎ターン従う）",
  guideIntro:
    "Bezier 経由でこの issue を進めています。タスク指示が薄くても、以下の共通ルールに従ってください。",
  livingSpecHeader: "## 生きた Spec",
  livingSpec: (specPath) => [
    `- 仕様書は \`${specPath}\`（worktree の外。\`--add-dir\` で読み書きできます）。`,
    "- **実装の前に必ず spec.md を読み直す**。会話で意図/要件が変わったら **まず spec.md を更新**してから実装し、Spec⇆実装を常に同期する。",
    "- **「受入基準」= 完成の定義（DoD）**。観察可能・チェック可能な文に保つ。**採点はあなたではなく maker** が、Bezier が集めた証拠を見て行う（自己採点はしない）。",
  ],
  docsHeader: "## ドキュメント（docs/）",
  docs: (issueDir) => [
    `- 永続的なドキュメント（決定ログ・QA/テストケース・共有メモ・調査メモ等）は \`${issueDir}/docs/\` に Markdown で置く。Bezier の Docs タブが自動で一覧表示する。`,
    "- この BEZIER.md が docs/ の**索引兼「使い方」**。新しい docs を作ったら、ここに1行追記して何のファイルかを示す。",
    "- spec.md は軸。それ以外は必要に応じて presence-driven に作る（無ければ作らない・無理に増やさない）。**spec.md にログや長い調査結果を貼らない**（spec が太ると判断が鈍る）。",
    "- **調査・比較した時**（フォント・ライブラリ・参考・方向性など）は、チャットに選択肢を並べて終わりにせず、`docs/<topic>.md` に短いレポート（選択肢・トレードオフ・**推奨**）を書いてリンクする。maker が読んで判断できるように。",
    "- `docs/verify-log.md` は **Bezier が自動生成**（毎ターンの変更スコープ＋機微領域フラグ）。自分で作成・編集しない。",
  ],
  titleHeader: "## タイトル",
  titleRule:
    "- issue.md の frontmatter `title` が空 or「Untitled」なら、**最優先で**内容を表す簡潔なタイトルに更新する（忘れない）。",
  evidenceHeader: "## 受入基準の根拠（実装後に Spec へ付す）",
  evidence: [
    "- **採点はしない**（PASS/FAIL を書かない）。代わりに、実装が終わったら spec.md の **各受入基準の直下に「根拠」を1行**付す:",
    "  例: `- [ ] ログインできる`",
    "  　　`  - 根拠: \\`src/auth/login.tsx\\` に実装。⚠️ 認証を変更（要目視）。`",
    "  → 根拠＝**どこに/どう実装したか・関連ファイル**。auth / DB・スキーマ / env / 権限 に触れたら明記。",
    "- チェック（採点）は **maker が** その根拠を見て付けます。あなたの責務は **実装 ＋ 各基準への根拠付与 ＋ 変更点の簡潔な要約** まで。",
  ],
  shortcutsHeader: "## ショートカット（claude スラッシュコマンド・任意）",
  shortcuts: [
    "- maker が Bezier の設定からインストールしていれば、このプロンプトで次のコマンドを呼べます（未導入なら `/` メニューに出ません。その場合は無視して通常通り進めてください）:",
    "  - `/bezier:verify` — 受入基準の直下に「根拠」を1行ずつ付す（採点はしない）",
    "  - `/bezier:spec` — spec.md を読み直して実装と同期する",
    "  - `/bezier:states` — 画面のエッジ状態（Empty/Error/Focus…）を洗い出し受入基準に落とす",
    "  - `/bezier:design` — html でデザインの方向を見せる（複数案の比較もOK・ブランド準拠）",
    "  - `/bezier:research` — 調査・比較を docs/ に短いレポートとして残す（推奨を添える）",
    "  - `/bezier:precommit` — 型・lint・動作を事前チェックして報告する",
  ],

  designBlock: (designDir) => [
    "## デザイン（Design）— html で「見せる」方が早い時に作る",
    "",
    "UI の構造や見た目を **文章より視覚で示す方が早い** 時（方向を決めたい・「デザイン案を出して」「他の方向は？」と言われた等）に、下記の規約で **html** を作ってください。Bezier の Design ボードに自動で並びます（別途プロンプト不要）。**md で十分なら md（docs/）で書く** — md か html かは内容で判断する。",
    `- **保存先**: \`${designDir}/NN-<短いkebab-slug>.html\`（NN=2桁ゼロ埋め連番。既存の最大+1から・**使い回さない＝蓄積**）。例 \`${designDir}/01-toolbar-filter.html\`。`,
    "- **html の役割は自由**: 1案のワイヤーでも、**複数パターンを1つの html に並べて比較**でも、簡単なインタラクションのスケッチでもよい。「1ファイル=1方向」「色は使わない」の縛りはない（その html が一番都合よく示せる形にする）。",
    "- **自己完結**: プレーンな html + インライン CSS のみ。Tailwind class・外部 CSS/JS/CDN・外部画像に依存しない（sandboxed iframe で静的描画されるため）。",
    "- **ブランドに沿わせる（軽いルール）**: repo に `design-system.md` やデザイントークンがあれば参照し、色・タイポ・余白をそれに寄せる（ブランドが破綻しない範囲で。固定1パターンには縛らない）。無ければニュートラルでよい。実装コードまで読み込む必要はない。",
    "- 各ファイル先頭に `<title>短い名前</title>` と `<!-- bezier:prompt: 〈一言〉 -->`。書いたらチャットで「NN: 〈何を示したか〉」を1行報告（コード・commit は不要）。",
    "- **実装着手はチャットから**: 「html を作る → 確定」という線形フローではない。ユーザーが「この方向で実装して」（例: 「02 の nav と 01 のレイアウトで」）と言ったら、その方向を **実コード（実物の DS）** に実装する。",
    "",
  ],

  implementTitle: (title) => `# 実装ハンドオフ — ${title}`,
  introUser: (worktree, specPath) => [
    `あなたは git worktree \`${worktree}\`（branch を切った隔離作業コピー）の中にいます。`,
    "これは **新規 Issue のチャット開始** です。ユーザーの最初のリクエスト（下記）をもとに、次の順で進めてください:",
    "0) **まず Clarify（確認）**: いきなり実装せず、**リポジトリを読んだ上で** 要望の曖昧さを潰す確認を **3〜5 問** してください。各問いには **おすすめの既定値（best-guess）を併記** し、ユーザーが「それで OK」と言うだけで前に進めるように。既存の実装・部品・規約に接地した具体的な問いにし、誘導尋問は避けます。",
    `1) 合意できたら \`${specPath}\` に Spec を書き起こす（テンプレートがあれば埋める）。特に **「受入基準」は観察可能・チェック可能な文で先に確定**（= 完成の定義。後で maker が証拠を見てチェックします）。「やらないこと」で境界も引く。`,
    "2) issue.md の frontmatter の `title` が空または「Untitled」なら、簡潔なタイトルを設定する。",
    "3) **Design ステップ（UI の変更なら）**: 実装の前に、**デザイン別案（ワイヤー）を 2〜3 案**作って方向を見比べてもらう（下記「デザイン別案」の規約に従う）。Design ボードに自動で並びます。ユーザーが方向を選んだら次へ。ロジック中心でビジュアル判断が不要なら、その旨を伝えてスキップして良い。",
    "4) 選ばれた方向で **この worktree 内のコードに実装**する。受入基準を満たすことをゴールにする。",
    "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
  ],
  introFollowUp: (worktree) => [
    `あなたは git worktree \`${worktree}\`（branch を切った隔離作業コピー）の中にいます。`,
    "これは **追記の再 Implement 依頼** です。この worktree には前回イテレーションの変更が既に入っています。",
    "**ゼロからやり直さず**、更新後の Issue / Spec（特に **受入基準**）に合わせて既存の変更を調整・拡張してください。",
    "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
  ],
  introPlain: (worktree) => [
    `あなたは git worktree \`${worktree}\`（branch を切った隔離作業コピー）の中にいます。`,
    "下記の Issue と Spec を読み、**この worktree 内のコード**に実装してください。",
    "**実装の前に Spec の「受入基準」を確認**してください。空・曖昧なら、いきなり作らず **まず 3〜5 問の確認**（各問いに既定値を併記・リポジトリに接地）をして spec.md を更新してから実装します。",
    "受入基準は「完成の定義」です。これを満たすことをゴールにしてください（後で maker が証拠を見てチェックします）。",
    "完了したら変更点を簡潔に要約してください（commit は人間が UI から行います）。",
  ],
  monorepo: (subPath) => [
    `**この作業は monorepo の \`${subPath}/\` パッケージに限定されています。** あなたの作業ディレクトリは既にそこです。原則 \`${subPath}/\` の外（リポジトリの他パッケージや root 設定）は変更しないでください。`,
    "",
  ],
  guideRef: (guidePath) => [
    "## 作法（重要・先に読む）",
    `この issue の共通ルールは \`${guidePath}\` にあります（\`--add-dir\` で読めます）。**まず読んでから**進めてください — 生きた Spec / 受入基準=DoD / タイトル更新 / デザイン別案の作り方 / 検証。`,
    "",
  ],
  userRequestHeader: "## ユーザーの最初のリクエスト",
  issueHeader: "## Issue",
  specHeader: "## Spec",

  variantTitle: (title) => `# デザイン別案（ワイヤー）— ${title}`,
  variantBody: ({ worktree, ids, ctx, designGlob }) => [
    `あなたの作業ディレクトリは \`${worktree}\` です。これは **Design（考える層）** の依頼で、**Implementの前段**でも構いません。`,
    `**実装コードは書かないでください。** 代わりに、**${ids.length} 案**を **それぞれ別の方向**で書き出します。`,
    "",
    "## 出力先と命名（厳守）",
    "",
    `- 保存先フォルダ: \`${designGlob}\``,
    `- ファイル名: **\`NN-<短いkebab-slug>.html\`**。今回使う番号: **${ids.join(" / ")}**（この番号をそのまま使う）。slug は各案の方向の短い名前（英小文字ハイフン）。例: \`${ids[0]}-toolbar-filter.html\` / \`${ids[1] ?? "02"}-column-menu.html\`。`,
    `- 既存ファイルがあれば読み、番号・方向が**重複しない**ようにする（番号は使い回さない＝増えていく）。`,
    "",
    "## スタックに依存しない自由なアイデア（重要）",
    "",
    "- ここは **repo の技術スタックから独立**しています。**repo のフレームワーク・コンポーネント・既存コードを読みに行かない／真似ない**。Spec が示す「何を解くか」から、**自由に**ビジュアルの方向を出す（実装の制約は後段 Implement の仕事）。",
    "- **完全に自己完結した HTML**：**プレーンなインライン CSS のみ**。**Tailwind の class・外部 CSS/JS/CDN・外部画像は使わない**（fully sandboxed iframe で静的描画されるため）。アイコンは文字（▾ × ＋ ⌕ 等）や CSS シェイプで。",
    "",
    "## これは『ワイヤー（構造スケッチ）』— 作り込まない",
    "",
    "- 目的は **レイアウト / 構造 / 情報設計の方向を見比べる**こと。ピクセル忠実は不要（採用案だけ後で Implement が実物を描画）。",
    "- **グレースケール**（白〜グレー: #fff / #f3f4f6 / #e5e7eb / #d1d5db / #9ca3af / #374151 程度）。**色は使わない**（方向差は構造で出す）。本文/ラベルはグレーのバー・箱・短文で represent。",
    "- 各案は別方向に振る：ツールバー型 / 列ヘッダメニュー型 / サイドパネル型、密 vs 余白、タブ vs アコーディオン、一覧 vs カード… 似た案を量産しない。",
    "",
    "## 参照（あなたの環境に委ねる）",
    "",
    "- もし参照ツール（デザイン事例の MCP 等）や、このプロジェクトのデザイン指針（CLAUDE.md / design.md 等）が**あれば**それを踏まえて方向の引き出しを増やす。無ければ無しで良い（Bezier 側は特定ツールを前提にしない）。",
    ctx
      ? `- **方向性の指定: ${ctx}** — これを最優先で反映する。`
      : "- 方向性の指定はなし。Spec から妥当な複数方向を選ぶ。",
    "",
    "## メタ（各ファイル必須）",
    "",
    "- ファイル先頭付近に `<title>この案の短い名前</title>` と `<!-- bezier:prompt: 〈方向の一言〉 -->` を入れる（Bezier がラベルとして読みます）。",
    "",
    "## @参照",
    "",
    `- ユーザー指定に「@01」のような参照があれば、それは番号 01 のアイデア（\`${designGlob}01-*.html\`）を指します。読んで踏まえてください（例:「@02 を密に」「@01 の余白＋@03 の構成」）。`,
    "",
    `書き出したら、チャットで各案を1行ずつ「案 NN: 〈方向〉」と述べてください（コード・commit は不要）。`,
  ],
};

const EN_HANDOFF: HandoffPhrases = {
  untitled: "(untitled)",
  specMissing: "(no spec.md)",

  guideTitle: "# Bezier — working conventions for this issue (auto-generated; follow every turn)",
  guideIntro:
    "You're working on this issue via Bezier. Even if the task instructions are thin, follow the shared rules below.",
  livingSpecHeader: "## Living Spec",
  livingSpec: (specPath) => [
    `- The spec lives at \`${specPath}\` (outside the worktree; read/write it with \`--add-dir\`).`,
    "- **Always re-read spec.md before implementing.** If the intent/requirements change during the conversation, **update spec.md first**, then implement — keep Spec and code in sync at all times.",
    "- **The “acceptance criteria” = the Definition of Done (DoD)**. Keep them observable and checkable. **The maker, not you, scores them** by looking at the evidence Bezier collected (do not self-score).",
  ],
  docsHeader: "## Documents (docs/)",
  docs: (issueDir) => [
    `- Put durable documents (decision logs, QA / test cases, handoff notes, research notes, etc.) as Markdown under \`${issueDir}/docs/\`. Bezier's Docs tab lists them automatically.`,
    "- This BEZIER.md is the **index and how-to** for docs/. When you add a new doc, append one line here noting what it is.",
    "- spec.md is the backbone; create the rest presence-driven, only as needed (don't create what isn't needed, don't pad). **Don't paste logs or long research into spec.md** (a bloated spec dulls judgment).",
    "- **When you research or compare options** (fonts, libraries, references, directions), don't just list choices in chat — write a short report to `docs/<topic>.md` (options · trade-offs · **recommendation**) and link it, so the maker can read and decide.",
    "- `docs/verify-log.md` is **auto-maintained by Bezier** (per-turn change scope + sensitive-area flags). Don't create or edit it yourself.",
  ],
  titleHeader: "## Title",
  titleRule:
    "- If issue.md's frontmatter `title` is empty or “Untitled”, **update it first** to a concise title that reflects the content (don't forget).",
  evidenceHeader: "## Evidence for the acceptance criteria (add to the Spec after implementing)",
  evidence: [
    "- **Don't score** (no PASS/FAIL). Instead, once implementation is done, add a one-line “evidence” **right under each acceptance criterion** in spec.md:",
    "  e.g. `- [ ] Can log in`",
    "  　　`  - evidence: implemented in \\`src/auth/login.tsx\\`. ⚠️ changed auth (needs a visual check).`",
    "  → evidence = **where / how you implemented it + related files**. Call it out when you touch auth / DB / schema / env / permissions.",
    "- The **maker** does the checking (scoring) by reading that evidence. Your job ends at **implement + add evidence to each criterion + a brief summary of the changes**.",
  ],
  shortcutsHeader: "## Shortcuts (claude slash commands; optional)",
  shortcuts: [
    "- If the maker installed them from Bezier's settings, you can call these commands in this prompt (if not installed they won't appear in the `/` menu — just ignore them and proceed normally):",
    "  - `/bezier:verify` — add a one-line “evidence” under each acceptance criterion (no scoring)",
    "  - `/bezier:spec` — re-read spec.md and sync it with the implementation",
    "  - `/bezier:states` — enumerate a screen's edge states (Empty / Error / Focus…) and turn them into acceptance criteria",
    "  - `/bezier:design` — show design directions in html (comparing several is fine; on-brand)",
    "  - `/bezier:research` — capture an investigation/comparison as a short report in docs/ (with a recommendation)",
    "  - `/bezier:precommit` — pre-check types / lint / behavior and report",
  ],

  designBlock: (designDir) => [
    "## Design — make html when showing beats telling",
    "",
    "When a UI's structure or look is **faster to show than to describe** (settling a direction, the user says “show me some designs” / “any other directions?”, etc.), make **html** with the convention below. It lines up automatically on Bezier's Design board (no separate prompt needed). **If md is enough, write md (docs/)** — judge md vs html by the content.",
    `- **Save to**: \`${designDir}/NN-<short-kebab-slug>.html\` (NN = 2-digit zero-padded serial; start from the existing max + 1, **never reuse — they accumulate**). e.g. \`${designDir}/01-toolbar-filter.html\`.`,
    "- **The html's role is open**: a single wireframe, **several patterns side-by-side in one html** to compare, or a small interaction sketch — whatever shows it best. No “one file = one direction” / “no color” rule.",
    "- **Self-contained**: plain html + inline CSS only. Don't depend on Tailwind classes, external CSS/JS/CDN, or external images (it renders statically in a sandboxed iframe).",
    "- **Stay on-brand (light rule)**: if the repo has a `design-system.md` or design tokens, read them and follow the colors / type / spacing (enough not to break the brand — not locked to one pattern). If there are none, neutral is fine. You don't need to read the implementation code.",
    "- At the top of each file, put `<title>short name</title>` and `<!-- bezier:prompt: 〈one line〉 -->`. After writing, report one line in chat: “NN: 〈what it shows〉” (no code, no commit).",
    "- **Implementation starts from chat**: it's NOT a linear “make html → adopt”. When the user says “implement this direction” (e.g. “02's nav with 01's layout”), implement it in the **real code (the real design system)**.",
    "",
  ],

  implementTitle: (title) => `# Implementation handoff — ${title}`,
  introUser: (worktree, specPath) => [
    `You are inside the git worktree \`${worktree}\` (an isolated working copy on its own branch).`,
    "This is the **start of a chat for a new issue**. Based on the user's first request (below), proceed in this order:",
    "0) **Clarify first**: don't jump into implementation — **after reading the repo**, ask **3–5 questions** that remove ambiguity in the request. For each, **include a recommended best-guess default** so the user can move forward just by saying “that's fine”. Make the questions concrete and grounded in the existing implementation / components / conventions; avoid leading questions.",
    `1) Once aligned, write the Spec into \`${specPath}\` (fill in the template if present). In particular, **lock the “acceptance criteria” first, as observable & checkable statements** (= the Definition of Done; the maker checks them against evidence later). Draw the boundary with “out of scope”.`,
    "2) If issue.md's frontmatter `title` is empty or “Untitled”, set a concise title.",
    "3) **Design step (for UI changes)**: before implementing, make **2–3 design variants (wireframes)** so the directions can be compared (follow the “design variants” convention). They line up automatically on the Design board. Once the user picks a direction, continue. If it's logic-heavy with no visual call to make, say so and skip.",
    "4) Implement the chosen direction **in the code inside this worktree**. Make meeting the acceptance criteria the goal.",
    "When you're done, summarize the changes briefly (commits are made by a human from the UI).",
  ],
  introFollowUp: (worktree) => [
    `You are inside the git worktree \`${worktree}\` (an isolated working copy on its own branch).`,
    "This is a **follow-up re-implement request**. This worktree already contains the previous iteration's changes.",
    "**Don't start over** — adjust and extend the existing changes to match the updated Issue / Spec (especially the **acceptance criteria**).",
    "When you're done, summarize the changes briefly (commits are made by a human from the UI).",
  ],
  introPlain: (worktree) => [
    `You are inside the git worktree \`${worktree}\` (an isolated working copy on its own branch).`,
    "Read the Issue and Spec below and implement **in the code inside this worktree**.",
    "**Before implementing, check the Spec's “acceptance criteria”.** If they're empty or vague, don't just build — **first ask 3–5 clarifying questions** (each with a default, grounded in the repo) and update spec.md, then implement.",
    "The acceptance criteria are the “Definition of Done”. Make meeting them the goal (the maker checks them against evidence later).",
    "When you're done, summarize the changes briefly (commits are made by a human from the UI).",
  ],
  monorepo: (subPath) => [
    `**This work is limited to the \`${subPath}/\` package of a monorepo.** Your working directory is already there. As a rule, don't change anything outside \`${subPath}/\` (other packages or root config).`,
    "",
  ],
  guideRef: (guidePath) => [
    "## Conventions (important — read first)",
    `The shared rules for this issue are in \`${guidePath}\` (readable via \`--add-dir\`). **Read it first**, then proceed — living Spec / acceptance criteria = DoD / title update / how to make design variants / verification.`,
    "",
  ],
  userRequestHeader: "## The user's first request",
  issueHeader: "## Issue",
  specHeader: "## Spec",

  variantTitle: (title) => `# Design variants (wireframes) — ${title}`,
  variantBody: ({ worktree, ids, ctx, designGlob }) => [
    `Your working directory is \`${worktree}\`. This is a **Design (the “think” layer)** request, and may come **before Implement**.`,
    `**Do not write implementation code.** Instead, produce **${ids.length} variant(s)**, **each in a different direction**.`,
    "",
    "## Output location & naming (strict)",
    "",
    `- Save folder: \`${designGlob}\``,
    `- File name: **\`NN-<short-kebab-slug>.html\`**. Numbers to use this time: **${ids.join(" / ")}** (use exactly these). The slug is a short name for each direction (lowercase, hyphenated). e.g. \`${ids[0]}-toolbar-filter.html\` / \`${ids[1] ?? "02"}-column-menu.html\`.`,
    `- If files already exist, read them so numbers and directions **don't collide** (numbers are never reused — they accumulate).`,
    "",
    "## Free, stack-independent ideas (important)",
    "",
    "- This is **independent of the repo's tech stack**. **Don't go read or mimic the repo's framework / components / existing code.** From what the Spec says to solve, explore visual directions **freely** (implementation constraints are the later Implement step's job).",
    "- **Fully self-contained HTML**: **plain inline CSS only**. **No Tailwind classes, no external CSS/JS/CDN, no external images** (it renders statically in a fully sandboxed iframe). Use text glyphs (▾ × ＋ ⌕ etc.) or CSS shapes for icons.",
    "",
    "## These are ‘wireframes (structural sketches)’ — don't over-build",
    "",
    "- The goal is to **compare directions for layout / structure / information design**. Pixel fidelity isn't needed (only the adopted one gets rendered for real later by Implement).",
    "- **Grayscale** (white–gray: roughly #fff / #f3f4f6 / #e5e7eb / #d1d5db / #9ca3af / #374151). **No color** (show directional difference through structure). Represent body/labels with gray bars, boxes, and short text.",
    "- Push each variant in a different direction: toolbar-style / column-header-menu / side-panel, dense vs spacious, tabs vs accordion, list vs cards… don't mass-produce similar variants.",
    "",
    "## Reference (left to your environment)",
    "",
    "- If you have reference tools (a design-examples MCP, etc.) or this project's design guidance (CLAUDE.md / design.md, etc.), use them to widen your range of directions. If not, that's fine (Bezier doesn't assume any specific tool).",
    ctx
      ? `- **Direction specified: ${ctx}** — reflect this with top priority.`
      : "- No direction specified. Pick several sensible directions from the Spec.",
    "",
    "## Meta (required in each file)",
    "",
    "- Near the top of each file, include `<title>short name of this variant</title>` and `<!-- bezier:prompt: 〈one-line direction〉 -->` (Bezier reads these as the label).",
    "",
    "## @references",
    "",
    `- If the user's instruction has a reference like “@01”, it points to idea number 01 (\`${designGlob}01-*.html\`). Read it and take it into account (e.g. “make @02 denser”, “@01's spacing + @03's structure”).`,
    "",
    `Once written, state each variant in chat, one line each: “variant NN: 〈direction〉” (no code or commit needed).`,
  ],
};

/** The active handoff phrase set (the maker's UI locale, DEC-108). */
function handoff(locale: Locale = getSettings().locale): HandoffPhrases {
  return locale === "ja" ? JA_HANDOFF : EN_HANDOFF;
}

// --- verify evidence block (written into spec.md) -------------------------

export type SensitiveKey = "env" | "auth" | "db" | "rls";

interface VerifyPhrases {
  sens: Record<SensitiveKey, string>;
  noChanges: string;
  scope: (n: number, added: number, removed: number) => string;
  sensChanged: (areas: string) => string;
  sensNone: string;
  blockHeader: string;
  lastUpdated: (time: string) => string;
  scopeLabel: string;
  sensLabel: string;
  changedFiles: string;
  moreFiles: (n: number) => string;
  makerChecks: string;
}

const JA_VERIFY: VerifyPhrases = {
  sens: { env: "env", auth: "認証", db: "DB/スキーマ", rls: "RLS/権限" },
  noChanges: "変更なし",
  scope: (n, a, r) => `${n} files ・ +${a} / -${r}`,
  sensChanged: (areas) => `⚠️ **${areas}** を変更 — ここはあなたの目で確認`,
  sensNone: "なし（auth/DB/env/権限への変更は検出されず）",
  blockHeader: "## 検証ログ（Bezier が自動収集）",
  lastUpdated: (t) => `_最終更新: ${t} ・ Implement ターン終了時に自動収集_`,
  scopeLabel: "**変更スコープ**",
  sensLabel: "**機微領域**",
  changedFiles: "変更ファイル",
  moreFiles: (n) => `…他 ${n} 件`,
  makerChecks:
    "> 受入基準のチェックは、上の証拠を見て **あなた（maker）が** 付けてください（AI は採点しません）。",
};

const EN_VERIFY: VerifyPhrases = {
  sens: { env: "env", auth: "auth", db: "DB/schema", rls: "RLS/permissions" },
  noChanges: "No changes",
  scope: (n, a, r) => `${n} files · +${a} / -${r}`,
  sensChanged: (areas) => `⚠️ **${areas}** changed — eyeball this yourself`,
  sensNone: "None (no changes to auth / DB / env / permissions detected)",
  blockHeader: "## Verification log (auto-collected by Bezier)",
  lastUpdated: (t) => `_Last updated: ${t} · auto-collected when the Implement turn ends_`,
  scopeLabel: "**Change scope**",
  sensLabel: "**Sensitive areas**",
  changedFiles: "Changed files",
  moreFiles: (n) => `…and ${n} more`,
  makerChecks:
    "> You (the maker) tick the acceptance criteria by looking at the evidence above (the AI does not score).",
};

/** Phrases for the verify evidence block written into spec.md (DEC-108). */
export function verifyPhrases(locale: Locale = getSettings().locale): VerifyPhrases {
  return locale === "ja" ? JA_VERIFY : EN_VERIFY;
}

// --- the /bezier:* slash-command pack (installed to ~/.claude) ------------

export interface PackCommand {
  name: string;
  description: string;
  body: string;
}

const JA_COMMANDS: PackCommand[] = [
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
    name: "design",
    description: "html でデザインの方向を見せる（複数案の比較もOK・ブランド準拠）",
    body: [
      "$ARGUMENTS の UI について、**方向性をデザインとして見せて**ください（引数が無ければ、いま検討中の画面について）。文章より視覚で示す方が早い時に html を作る。",
      "",
      "- BEZIER.md の Design 規約に従う（`design/NN-slug.html`、自己完結の html+inline CSS、Design ボードに自動で並ぶ）。",
      "- **形は自由**: 別方向を複数ファイルでも、**複数パターンを1つの html に並べて比較**でもよい（「1ファイル=1方向」「グレースケール限定」の縛りはない）。",
      "- **ブランドに沿わせる**: repo に `design-system.md` やトークンがあれば参照し、色・タイポ・余白を寄せる（無ければニュートラル）。",
      "- 各案に**トレードオフを1行**添える。まだ実装はしない — ユーザーがチャットで方向を選んでから実装に入る。",
    ].join("\n"),
  },
  {
    name: "research",
    description: "調査・比較を docs/ に短いレポートとして残す（推奨を添える）",
    body: [
      "$ARGUMENTS について調査・比較し、結果を **`docs/<topic>.md` の短いレポート**にまとめてください（引数が無ければ、いま検討中のトピックについて）。チャットに選択肢を並べて終わりにしない — maker が**読んで判断できる**ように残すのが目的。",
      "",
      "レポートに含める:",
      "- **問い / 文脈**（何を決めたいか）",
      "- **選択肢**（各案の要点）と **トレードオフ**（何を取り、何を捨てるか）",
      "- 必要なら比較表",
      "- **推奨**（どれを・なぜ）。判断材料が足りなければ、足りないものを明記",
      "",
      "- 出典・参照リンクがあれば併記する。",
      "- まだ実装はしない。書いたら **要約とファイルへのリンクをチャットで1行**返す。",
      "- spec.md には貼らない（spec を太らせない）。決定が固まったら spec 側は「受入基準」や「やらないこと」に**結論だけ**反映する。",
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

const EN_COMMANDS: PackCommand[] = [
  {
    name: "verify",
    description: "Add a one-line “evidence” under each acceptance criterion (no scoring)",
    body: [
      "Go through the acceptance criteria in spec.md (outside the worktree; already `--add-dir`'d) top to bottom and, for each criterion that's implemented, add a one-line **“evidence” right under it**.",
      "",
      "- Evidence = **where / how you implemented it + related files**. e.g. `  - evidence: implemented in \\`src/auth/login.tsx\\`.`",
      "- For criteria that touch **auth / DB·schema / env / permissions**, prefix with ⚠️ and call it out (needs a visual check).",
      "- **Do not score PASS/FAIL.** The maker scores by reading the evidence.",
      "",
      "Finish with a brief summary of the changes (commits are made by a human from Bezier's UI).",
    ].join("\n"),
  },
  {
    name: "spec",
    description: "Re-read spec.md and sync it with the implementation",
    body: [
      "Re-read spec.md (already `--add-dir`'d) and surface anything that's **out of sync** with the current conversation / implementation.",
      "",
      "- If the requirements or intent have changed, **update spec.md first**, then adjust the implementation to that diff (keep Spec and code in sync at all times).",
      "- Keep the “acceptance criteria” as **observable, checkable statements**. Make vague ones concrete.",
      "- Draw the boundary with “out of scope”.",
    ].join("\n"),
  },
  {
    name: "states",
    description: "Enumerate a screen's edge states and turn them into acceptance criteria (Empty/Error/Focus…)",
    body: [
      "For the screen/component in $ARGUMENTS, **enumerate edge states → decide them → write them as acceptance criteria in spec.md** (if no argument, use the screen under discussion). The goal is to settle the designer↔engineer “what about Empty? Focus?” questions **now, in the spec** — not in review.",
      "",
      "1. Classify the screen into an **archetype** and pick the states to ask about:",
      "   - List/table: empty / loading / error / single item / many (paging) / long-text truncation / no permission",
      "   - Form: initial / validation error / submitting / success / server error / unsaved-leave",
      "   - Detail: loading / not found (404) / no permission / editing",
      "   - Dashboard: empty / loading / partial failure / refreshing",
      "   - Auth/onboarding: initial / error / processing / success transition",
      "   - Cross-cutting (interaction states): hover / focus / active / disabled / selected",
      "2. Present each state with a **one-line default-behavior proposal** and check with the maker (need it or not / what) — don't decide unilaterally.",
      "3. Add the agreed states **to spec.md's “acceptance criteria” as observable statements**. e.g. “- Empty: when the list has 0 items, show an illustration + a ‘Create your first X’ CTA”.",
      "4. Include an **accessibility baseline** by default: a visible keyboard-focus ring / labels for primary actions / contrast.",
      "",
      "**Don't implement here** — just decide the states and write them into the spec. After implementing, confirm each state's evidence with /bezier:verify.",
      "",
      "(This is Bezier's default states checklist. Edit/replace it to match your team's bar — strict a11y, mobile-first, industry compliance, etc.)",
    ].join("\n"),
  },
  {
    name: "design",
    description: "Show design directions in html (multiple compared is fine; on-brand)",
    body: [
      "Show design directions for the UI in $ARGUMENTS (if no argument, use the screen under discussion). When showing beats telling, make html.",
      "",
      "- Follow the Design convention in BEZIER.md (`design/NN-slug.html`, self-contained html + inline CSS, auto-lines-up on the Design board).",
      "- **The form is open**: separate files for separate directions, or **several patterns side-by-side in one html** to compare (no “one file = one direction” / grayscale-only rule).",
      "- **Stay on-brand**: if the repo has a `design-system.md` or tokens, follow the colors / type / spacing (neutral if none).",
      "- Add a **one-line trade-off** to each. Don't implement yet — implementation starts once the user picks a direction in chat.",
    ].join("\n"),
  },
  {
    name: "research",
    description: "Capture an investigation/comparison as a short report in docs/ (with a recommendation)",
    body: [
      "Research/compare $ARGUMENTS and capture the result as a **short report in `docs/<topic>.md`** (if there are no arguments, use the topic under discussion). Don't just list choices in chat — the point is to leave something the maker can **read and decide** from.",
      "",
      "Include in the report:",
      "- **Question / context** (what you're trying to decide)",
      "- **Options** (the gist of each) and **trade-offs** (what each gives up)",
      "- A comparison table if useful",
      "- A **recommendation** (which / why). If you lack what you'd need to decide, say what's missing",
      "",
      "- Cite sources / reference links where relevant.",
      "- Don't implement yet. When done, reply with **a one-line summary + a link to the file** in chat.",
      "- Don't paste it into spec.md (keep the spec lean). Once a decision lands, reflect only the **conclusion** into the spec's acceptance criteria / “won't do”.",
    ].join("\n"),
  },
  {
    name: "precommit",
    description: "Pre-check types / lint / behavior and report the result",
    body: [
      "Run a pre-commit check:",
      "",
      "1. Run the type check and lint.",
      "2. Confirm the main changes **actually work**.",
      "3. Report the result (PASS/FAIL and what you fixed) concisely.",
      "",
      "**Don't commit** — a human does that from Bezier's UI (Commit / Ship).",
    ].join("\n"),
  },
];

/** The built-in /bezier:* command pack for a locale (DEC-108). */
export function commandPack(locale: Locale = getSettings().locale): PackCommand[] {
  return locale === "ja" ? JA_COMMANDS : EN_COMMANDS;
}

// --- doc / spec content scaffolds (written into the user's repo) ----------
// These are CONTENT (not UI chrome) the maker reads/edits, so they follow the
// locale like the Spec template (DEC-108). Markdown bodies.

interface Scaffolds {
  issueBody: string;
  docDecision: string;
  docQa: string;
  docHandoff: string;
  docNote: string;
  prComment: string;
  prActivityHeader: string;
}

const JA_SCAFFOLDS: Scaffolds = {
  issueBody: "> 解きたい問題 / 機会をここに書く。",
  docDecision: ["# 決定ログ", "", "## 決定", "", "- ", "", "## 未解決の問い", "", "- ", ""].join("\n"),
  docQa: ["# QA", "", "## テストケース", "", "- [ ] ", "", "## 状態", "", "- ", ""].join("\n"),
  docHandoff: ["# 共有", "", "- URL: ", "- 変更点: ", "- 検討した決定: ", "- 未解決の問い: ", "- 既知の制約: ", ""].join("\n"),
  docNote: ["# ", "", ""].join("\n"),
  prComment: "<!-- Generated by Bezier (DEC-015). Spec と経緯を PR に同梱（DEC-008: why が what と同じ PR）。 -->",
  prActivityHeader: "## 経緯（activity）",
};

const EN_SCAFFOLDS: Scaffolds = {
  issueBody: "> Write the problem / opportunity you want to solve here.",
  docDecision: ["# Decision log", "", "## Decisions", "", "- ", "", "## Open questions", "", "- ", ""].join("\n"),
  docQa: ["# QA", "", "## Test cases", "", "- [ ] ", "", "## Status", "", "- ", ""].join("\n"),
  docHandoff: ["# Handoff", "", "- URL: ", "- Changes: ", "- Decisions considered: ", "- Open questions: ", "- Known constraints: ", ""].join("\n"),
  docNote: ["# ", "", ""].join("\n"),
  prComment: "<!-- Generated by Bezier (DEC-015). The Spec and history are bundled into the PR (DEC-008: the why rides with the what). -->",
  prActivityHeader: "## History (activity)",
};

/** Content scaffolds in the maker's UI locale (DEC-108). */
export function scaffolds(locale: Locale = getSettings().locale): Scaffolds {
  return locale === "ja" ? JA_SCAFFOLDS : EN_SCAFFOLDS;
}

/** A docs/ template by stem (decision / qa / handoff / note); "" if unknown. */
export function docTemplate(type: string): string {
  const s = scaffolds();
  switch (type) {
    case "decision":
      return s.docDecision;
    case "qa":
      return s.docQa;
    case "handoff":
      return s.docHandoff;
    case "note":
      return s.docNote;
    default:
      return "";
  }
}

/** The design-variant convention block (BEZIER.md sub-section / standalone). */
export function designConventionLines(designDir: string): string[] {
  return handoff().designBlock(designDir);
}

/** The full BEZIER.md guide (DEC-057 stable conventions the agent reads). */
export function bezierGuideDoc(specPath: string, issueDir: string): string {
  const h = handoff();
  return [
    h.guideTitle,
    "",
    h.guideIntro,
    "",
    h.livingSpecHeader,
    ...h.livingSpec(specPath),
    "",
    h.docsHeader,
    ...h.docs(issueDir),
    "",
    h.titleHeader,
    h.titleRule,
    "",
    ...h.designBlock(`${issueDir}/design`),
    h.evidenceHeader,
    ...h.evidence,
    "",
    h.shortcutsHeader,
    ...h.shortcuts,
    "",
  ].join("\n");
}

/** The placeholder used when spec.md can't be read (locale-aware). */
export function specMissingText(): string {
  return handoff().specMissing;
}

/** The implement handoff doc (the per-turn task instructions). */
export function implementHandoffDoc(a: {
  worktree: string;
  issueTitle: string;
  issueMd: string;
  specMd: string;
  specPath: string;
  guidePath: string;
  userMessage?: string;
  followUp?: boolean;
  subPath?: string;
}): string {
  const h = handoff();
  const intro = a.userMessage
    ? h.introUser(a.worktree, a.specPath)
    : a.followUp
      ? h.introFollowUp(a.worktree)
      : h.introPlain(a.worktree);
  return [
    h.implementTitle(a.issueTitle || h.untitled),
    "",
    ...intro,
    "",
    ...(a.subPath ? h.monorepo(a.subPath) : []),
    "---",
    "",
    ...(a.userMessage ? [h.userRequestHeader, "", a.userMessage, "", "---", ""] : []),
    ...h.guideRef(a.guidePath),
    "---",
    "",
    h.issueHeader,
    "",
    a.issueMd,
    "",
    h.specHeader,
    "",
    a.specMd,
    "",
  ].join("\n");
}

/** The variant-generation handoff doc (the Design "think" layer). */
export function variantHandoffDoc(a: {
  worktree: string;
  issueTitle: string;
  ids: string[];
  ctx: string;
  designGlob: string;
  specMd: string;
}): string {
  const h = handoff();
  return [
    h.variantTitle(a.issueTitle || h.untitled),
    "",
    ...h.variantBody({ worktree: a.worktree, ids: a.ids, ctx: a.ctx, designGlob: a.designGlob }),
    "",
    "---",
    "",
    h.specHeader,
    "",
    a.specMd,
    "",
  ].join("\n");
}
