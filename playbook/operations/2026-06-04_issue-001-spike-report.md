<!-- 作成日: 2026-06-04 / Owner: Principal Engineer -->
# ISSUE-001 スパイク報告（進行中）

## L1 静的抽出 — ✅ PASS（鍵不要・完了）
`spike/extract.mjs`（Babel AST）を自分の3 repo に実行。**0 parse error**。

| repo | files | components | screens | parts | edges | cssVars |
|---|---|---|---|---|---|---|
| _template | 18 | 18 | 8 | 10 | 71 | 90 |
| alloy | 34 | 23 | 3 | 20 | 222 | 81 |
| chom-chom | 85 | 90 | 23 | 67 | 169 | 72 |

**精度検証(alloy)**: grep ベースライン候補 22件 vs 抽出 23件 → ベースライン全件を捕捉し、grepが取りこぼした `IssueWorkspacePage` も抽出（実質 recall ~100%）。screen/part 分類・props 抽出も的確（例: `AgentDock`→{issueId,open,onClose} / `CommandPalette`→{open,onOpenChange,currentWorkspaceId,extraActions}）。
- 色は hex でなく Tailwind v4 `@theme` の CSS変数（--color-*）に存在 → cssVars で捕捉済（hex colors=0 は v4 として正常）。
- 出力: `spike/out/{template,alloy,chomchom}.json`（component registry + composition edges + tokens）。

**判定**: 最大リスクの前半「任意 repo → 使える component index を抽出できるか」= **YES（クリーン）**。

## 生成（L3後の決定的テスト）— ⏸ 鍵待ち
`spike/generate.mjs` 実装済み（`@anthropic-ai/sdk` tool-use: `search_components`/`get_component`/`get_tokens`/`emit_screen` + catalog の prompt caching）。
- intent を渡すと、Claude が既存パーツを調べ、**既存パーツだけで scene-graph を組み**、`reused` 実パーツ数を計測。**実パーツ ≥3 で continue 基準**。
- 実行: `ANTHROPIC_API_KEY=... MODEL=claude-sonnet-4-6 node generate.mjs chomchom "既存部品で語彙のSRS復習画面を作って"`
- **要: Anthropic API キー + コスト上限**（CEO）。

## 残（GO 後 / or 本スパイク後半）
- L3 Playwright render（clean率計測。`capture-screens.ts` 流用）。
- scene-graph → 実 render（iframe）で「本当にプロダクトらしいか」side-by-side（vs v0）。

## 現時点の暫定結論
L1 が強い PASS。**Bezier が v0 と違うための前提（既存の文脈を機械抽出）は成立**。残るは「Claude がそれを忠実に流用するか」= 生成テスト（鍵待ち）。
