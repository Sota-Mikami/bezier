# Bezier — Claude Code Context

AI-native な PdM+Design ツール。PdM/Designer/Engineer/QA の境界を溶かし、一人の「maker」が **Spec → Design → Mock → QA** を連続的に回せる世界の業界標準を目指す。Personal-first → dogfood → SaaS。

## 起動プロトコル（このディレクトリでセッションを開始したら）

```
1. STATUS.md          ← まず必ず読む（現在地・最新DEC・進行中ISSUE・再開ガイド）
2. COMPANY.md         ← 憲章・maker thesis・運営原則・ファイル構造
3. product/issues/    ← 作業の単位。今どの ISSUE か
```

- **CEO の依頼はまず COO（`.claude/agents/coo.md`）が受ける**。COO が専門家へ並行/逐次 dispatch し、`[COO報告]`（結論/推奨/詳細/承認待ち）で CEO に返す。
- 決定は `playbook/decisions-log.md`（DEC-###）。二度聞かない。承認待ちは `playbook/approval-queue.md`（PROP-###）。

## チーム（`.claude/agents/`）

- 専門家: `coo` / `head-of-product` / `principal-designer` / `principal-engineer` / `qa-lead` / `ux-researcher`
- ペルソナ（テスト対象）: `persona-solo-maker` / `persona-pm-cant-design` / `persona-ds-lead` / `persona-agency-designer`

## 運営ルール（要点）

- **build ≠ 検証**（Anthropic Idea Stage）。プロトタイプを作ること自体は検証ではない。
- **1 サイクル 1 段階 = 1 ファイル**、日付プレフィックス `YYYY-MM-DD_topic.md`。
- 成果物は必ずファイルに保存（`product/` `design/` `playbook/`）。チャット消失で作業ログを失わない。
- **code is not the asset** — 資産は判断の蓄積。

## プロダクト（`app/`）

- スタック: Next.js 15 / React 19 / Tailwind v4 / Supabase（Postgres/Auth/RLS）/ Claude API（`@anthropic-ai/sdk`）/ Liveblocks / React Flow / BlockNote。
- 楔: 既存 repo → コンセプトモック。詳細アーキは起ち上げプラン `~/.claude/plans/cuddly-cuddling-crane.md` と `playbook/product-roadmap.md`。
- 再利用元（lift する既存コード）: `prototypes-monorepo/_template/src/app/map/`（React Flow ボード+Screenモデル）/ `_template/scripts/capture-screens.ts`（Playwright render）/ `projects/alloy`（BlockNote）/ `chom-chom/supabase/functions/ai-chat`（Claude streaming + RLS）/ `_template/supabase/functions/liveblocks-auth`（Liveblocks auth）。

## 戦略フレーム（親 CLAUDE.md の shared/knowledge を参照）

固い問題 / Sierra SoA→Interface→SoR / Anthropic AI-Native Playbook。本プロジェクトの適用は `playbook/strategy/2026-06-04_Bezier-thesis-v1.md`。
