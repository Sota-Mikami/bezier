<!-- 作成日: 2026-06-23 / Owner: CTO (Claude) → CEO / branch: feat/maker-loop-edit-surfaces -->
# ペルソナ体験レビュー — 「定義した体験」は担保できているか + 対応

> CEO が今の Bezier を触り「定義した体験が担保できているか怪しい」→ ペルソナ6体（Mai/Kenji/Leo/Priya/Daniel/Saki）に実コード接地でレビューさせ、CTO が synthesize。その上で CEO が「今すぐ効く 1〜5 を実装して見せて」＋「テキスト選択コメントが欲しい」と指示 → 実装。

## レビュー結論
**「配管（成果物/データ）はある。体験レイヤーが薄い」。** AIの誘導・コメント・提案・フィードバックが全部「データ/プロンプト/ファイル」としては存在するのに、Bezier 自身のUIに浮かび上がっていない。だから「会話で導かれるFigmaのような体験」が「生ターミナル＋座標ピン注釈＋静的ページ」に見える。

## ペルソナ別の主要ギャップ（コード接地）
- **Mai/Kenji**: エージェント起動の瞬間に会話UXが生ターミナルに落ちる。next-move 提案がスクロールに埋もれ Bezier クロームに出ない。ステージ遷移は手動タブ。terrain チップが `lg` 未満で消える。
- **Kenji**: md コメントが座標ピン＝意味（文）でなく座標。要件定義が Notion-with-AI でなく「別々の編集器＋チャット」。
- **Leo**: E-1b の Style パネルは堅実、だが Layer は同一親のみ・テキスト編集は条件で無言。**mock→repo コードの seam**（保存しても「コードに反映」が無く、チャットで言い直し）。WKWebView 注入は未検証。
- **Priya**: 「ブランド忠実」「トークン突合」は散文のお願いで**ゲートではない**。Style パネルは生CSS＝magic number 製造機。監査証跡ゼロ。
- **Daniel**: compare URL 止まりで本物PR URLに辿り着けない。publish 無しで env 欄が空。auto-seed QA が人確認済みと区別不能。
- **Saki**: 共有が一方通行。コメント可モード・チャット介入が**存在しない**。受信者は Slack に長文を送る羽目。

## 実装した対応（CEO 指示 1〜5 ＋ テキスト選択コメント）

| # | 内容 | 状態 | コミット |
|---|---|---|---|
| 1 | **AI の「次の一手」を UI に出す** — agent が `<issue.dir>/next-step` に提案を書く（loopBlock）→ チャット上に `NextStepCard`（「進める」ワンクリック=sendDesignFeedback で続行＋×）。 | ✅ first-cut | b7dc7f7 |
| 3 | **terrain チップを `sm` から表示＋primary tint で主役化**（`lg` 隠れ解消）。 | ✅ | b7dc7f7 |
| — | **md テキスト選択コメント（意味アンカー・XYでない）** — CodeMirror で範囲選択→フローティング「コメント」→指示→`docTextCommentPrompt` で AI へ（選択テキストに紐づく）。 | ✅ | b4d5264 |
| 4 | **mock 編集→「コードに反映」** — PendingEditsBar に二次アクション追加（`visualEditPrompt`→agent）。seam 解消。 | ✅ | 877785e |
| 5 | **ハンドオフの穴** — auto-seed QA に「未実行・自動生成」警告、publish 無し時に「branch checkout→dev 起動」ガイド。 | ✅（PR URL正規化は Rust 要・延期） | 877785e |
| 2 | ステージ遷移ナッジ（design.html→Design タブ点灯 等） | 🔜 未（next-step card が「次に何を」を概ねカバー。tab-pulse は増分） | — |

全段 tsc0 / eslint0 / vitest115。**要 dogfood**（特に #1 next-step card が役立つか・テキスト選択コメントの手触り）。

## CEO が skip 指定
共有フィードバック（Liveblocks 系）/ DS ゲート（Priya）/ ネイティブ Preview = **今は skip**。ただし体験上は重い、と判明済み（再優先の材料）。

## 残・要監視
- **WKWebView 注入の linchpin（E-1b）** は依然 dogfood 検証待ち。
- #1 は「提案をファイルに書く」方式（生ターミナル parse でなく堅実）だが、agent が実際に next-step を書くかは prompt 遵守次第 → dogfood で確認。
- 競合 [[impeccable-competitor]] の design-in-code バンドと重なる領域あり。
