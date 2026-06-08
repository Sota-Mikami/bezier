<!-- 作成日: 2026-06-05 / Owner: Principal Engineer -->
# ISSUE-004 — preview の汎用化（任意 repo / 任意 intent を 1コマンドで見る）

| | |
|---|---|
| **Stage** | Idea →（境界）MVP / dogfood #2 |
| **Owner** | Principal Engineer |
| **状態** | 完了（2026-06-05） |
| **由来** | ISSUE-003（chom-chom で「見える」=✅）の次。CEO 方針「私個人が使える形」 |
| **目的** | ISSUE-003 の preview を **chom-chom 専用ハードコードから汎用化**し、任意 repo を `intent → 実部品で生成 → 実レンダリングで見る` が **1コマンド**で回る dogfood ツールにする |

## なぜ

ISSUE-003 で「見える」は出たが、preview ルートは chom-chom 専用に手書き。CEO が**普段の任意 repo（mikan/Sotas/個人）でそのまま使える**道具にするには、scene-graph から **動的に** preview を組み立てる必要がある。これで continuum が日常 dogfood に乗る。

## スコープ

1. **汎用 preview ジェネレータ**: 任意の `gen-*.json`（scene-graph）＋ その repo の `index.json` を入力に、対象 repo 内へ **preview ルートを動的生成**（scene-graph の `existing_component` を実 import・`generated` はラッパー）。chom-chom 固有のロジックを除去し、index の実ファイルパスから import を解決。
2. **汎用 props/data 合成**: prop 名・型から plausible なモックを**汎用ロジック**で合成（repo 内の既存使用例を読めれば優先）。data 依存で落ちるノードは ISSUE-003 同様**ラベル付きフォールバック**（画面は壊さない）。
3. **provider 自動検出**: 対象 repo の root layout / providers を検出して wrap（app-router の `app/layout.tsx` 等）。検出できなければ素で描画。
4. **1コマンド一気通貫**: `node cli.mjs preview <repo>` 相当で **extract（未抽出なら）→ generate（intent）→ 動的 preview 生成 → dev server → screenshot → 開く** を一発。intent は引数 or 対話。
5. **汎用性の実証（重要）**: **chom-chom 以外に最低2 repo**（`alloy` / `template`、`out/gen-alloy.json` `gen-template.json` 既存）で、**同じハーネスがハードコードなしで描画**することを示す。各 repo の clean render 率を出す。

## 制約・前提

- 第一スコープは **Next.js app-router repo**（CEO の標準スタック）。pages-router / Vite / 他フレームは検出して「未対応」と正直に出す（落とさない）。Launch で広げる。
- 対象 repo を壊さない（preview は throwaway・gitignore、既存ファイル不変、dev server は使い終わったら停止）。
- build ≠ 検証。app/ canvas やクラウド SoR はやらない。CLI dogfood ツールの汎用化に集中。

## 受け入れ基準（kill / continue）

- ✅ continue: **3 repo（chom-chom + alloy + template）が同一汎用ハーネスで実描画**され、各 PNG が出る / `cli.mjs preview <repo>` が1コマンドで回る / clean render 率を repo 別に正直に提示 / CEO が「自分の別 repo でも試せる」状態。
- ❌ kill/fix: 汎用化すると render 率が極端に落ちる / repo ごとに手書きが必要なまま → 何が repo 固有の壁か（import 解決 / provider / props）を明記し、現実的な抽象境界を提案。

## やらないこと
- 任意 repo の隔離サンドボックス（= Launch）。今は CEO 手元 repo・Next app-router 前提でよい。
- app/ canvas 統合 / クラウド SoR 保存。
- 配色・ブランディング。

## 参照
- ISSUE-003 結果 `playbook/operations/2026-06-05_issue-003-result.md`
- ISSUE-004 結果 `playbook/operations/2026-06-05_issue-004-result.md`
- `spike/generate-preview.mjs`（汎用ジェネレータ）
- `spike/screenshot-generic.mjs`（汎用スクリーンショット）
- `spike/cli.mjs`（preview サブコマンド更新済み）
- `out/render-{chomchom,template}.png`（実描画 PNG）
