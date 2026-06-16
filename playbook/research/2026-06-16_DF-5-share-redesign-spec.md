# DF-5 — Share 再設計 仕様（合意済み・実装待ち）

> 2026-06-16 dogfood backlog の DF-5。CEO 合意済みの設計をロックした実装仕様。
> 関連: [[2026-06-16_dogfood-feedback-backlog]]。DF-2 で先送りした adopt 機構撤去をここで実施。

## 背景 / 現状

- 今の共有（`issue-share.tsx`）＝粗い3トグル `settings.journeyLayers`（`app` / `design` / `spec`、DEC-101）。
- 生成ページ（`journey.ts` `buildJourneyHtml`）＝**1カラム静的ページ**：app iframe・spec(md描画)・**採用デザイン1案**(`designHtml`＝`.adopted` 由来)・履歴。Spec が上寄り固定。
- パスワード保護＝`buildGatePage`（暗号化 blob、DEC-102）。維持する。

## CEO の新モデル（合意済み）

作り手の Issue 詳細 UI を**ミラー**する:
- **Design セグメント**：その Issue の Design 配下（Spec・各 doc・各 html variant）から**共有するものを選ぶ**。
- **Prototype セグメント**：Preview（公開アプリ）/ **Map** / QA から選ぶ。
- 既定＝**全部オン**、チェックを外して減らす。選択は **per-issue 永続**（`.bezier` に保存）。
- 受け手ページ＝ **Design / Prototype の Segmented Control ＋ 各セグメント内タブ**。**共有が無いセグメントは出さない**（Spec が必ずトップとは限らない）。

### 確定した2フォーク
- **Map：v1 でも含める**（現状スカフォルドをそのまま描画 → 後述の route-grid）。
- **選択保持：per-issue 永続**（`.bezier/<issue>/share.json` 等。既定は全部オン）。

## 実装仕様

### 1. 共有対象の列挙（per-issue, 動的）
- **Design グループ**: `listDocuments(issue)`（spec / decision / qa / handoff / note …）＋ `listVariants(issue)`（html）。各アイテム＝ `{ kind: "doc"|"variant", key: path, label }`。
- **Prototype グループ**: 固定3つ `preview` / `map` / `qa`。
  - ※ QA が「Design の qa doc」と「Prototype の QA タブ」で二重に出る可能性 → **Prototype 側の QA を正**とし、Design の docs 列挙からは `qa.md` を除外（or ラベルで区別）。実装時に確認。

### 2. 選択状態の永続（新規 `share-config`）
- `.bezier/<issueDir>/share.json`：`{ exclude: string[] }`（既定全部オン＝除外リスト方式。新規アイテムは自動でオン）。
- もしくは `{ include: Record<key, boolean> }`。**除外リスト方式を推奨**（新規 doc/variant が増えても既定オンを維持できる）。
- ヘルパー: `readShareConfig(issue)` / `writeShareConfig(issue, cfg)` / `isShared(cfg, key)`。
- グローバル `settings.journeyLayers` は**廃止**（移行: 旧設定は無視）。

### 3. 共有 UI（`issue-share.tsx` 改修）
- ドロップダウン内を **2グループのチェックリスト**に:
  - 「Design」見出し＋ Spec・各 doc・各 html の行（チェックボックス、既定オン）。
  - 「Prototype」見出し＋ Preview・Map・QA の行。
- 既定全部オン、外すと `exclude` に追加。空グループは見出しごと隠す。
- パスワード保護 UI はそのまま。
- 「アプリを公開」は **Preview を共有する時のみ**（`publish.publish()` で Vercel URL を取得 → ページに渡す）。

### 4. 受け手ページ（`journey.ts` 再構築）
- **2セグメント＋タブの静的 html＋最小 JS**（タブ切替のみ。依存なし）。
- データ収集（`use-journey.ts`）: 選択された docs の md、variants の html、QA(`qa.md`)、Map の route 一覧、公開アプリ URL。
- レンダリング:
  - **Design タブ群**: doc＝`renderSafeMarkdown`、variant＝`<iframe sandbox srcdoc>`。
  - **Prototype タブ群**: Preview＝公開アプリ `<iframe>`、QA＝`qa.md` をテーブル描画、**Map＝route-grid**（`${appUrl}${route}` の縮小 iframe グリッド。appUrl 無ければ Map は出せない→公開アプリ必須を UI で示す）。
- 空セグメントは Segmented Control ごと非描画。最初の利用可能タブを既定表示。
- CSP / sandbox は現行を踏襲（`frame-src 'self' https://*.vercel.app` 等）。パスワード時は `buildGatePage` で全体を暗号化。

### 5. adopt 機構の撤去（DF-2 繰越）
- `journey.ts`：`designHtml`（単一 `.adopted`）を廃止 → 「共有する html variants（複数）」へ。
- 撤去: `readAdoptedDesign` / `writeAdoptedDesign` / `syncSpecDesignSection`（DEC-056 spec ミラー）/ `adoptedPath`（`variants.ts`）、`handlePickVariant` / `adoptVariantPrompt`（session / prompts）、**死んだ `DesignVariants` コンポーネント**（`design-variants.tsx`：`designSurface` だけ残す or 別ファイルへ）。
- `implement-session-types.ts` から `handlePickVariant` を除去。`use-journey.ts` の `readAdoptedDesign` 依存を共有選択ベースに置換。
- 未使用 i18n キー（`design.adoptThis` / `adoptTooltip` / `reImplement` / `designVariants.*adopt*` / `share.layer*` の一部）を整理。

## 検証
- tsc / eslint / vitest / build green。
- 実機: docs/variants/preview/qa/map を一部チェック外し→共有→受け手ページがセグメント＋タブでミラーされ、空セグメントが消えることを確認。パスワード保護の往復。

## メモ
- 大物。outward-facing（公開ページ生成）なので、フォーカスした実装パスで丁寧に。
- Map の route 一覧の保存場所は実装時に確認（`issue-map.tsx` が持つ route state の永続先）。
