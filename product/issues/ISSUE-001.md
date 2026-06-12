<!-- 作成日: 2026-06-04 / Owner: Head of Product -->
# ISSUE-001 — dogfood: 楔の Week1 de-risking スパイク

| | |
|---|---|
| **Stage** | Idea |
| **Owner** | Head of Product →（実務）Principal Engineer |
| **状態** | 起票済 / CEO 着手承認待ち（PROP-001） |
| **目的** | 最大の技術リスクを、UI を作る前に証明 or 反証する |

## なぜ（固い問題 / Idea Stage）

`playbook/strategy/2026-06-04_Bezier-thesis-v1.md` の通り、Bezier の固さは需要側でなく **楔の差別化（軸5）= 技術不確実性の解消** にある。auth/RLS/editor/billing/Liveblocks は自分のコードで解決済み。**未解決かつ moat の核**は:

> 任意 repo を「Claude が実コンポーネントを忠実に流用するモックを生成できる」だけ豊かな component index に変換でき、それを headless render で証明できるか。**ここが弱いと Bezier はただの v0。**

build ≠ 検証。**これは使い捨てスパイクであり、本体ではない。** 生産的に見えるからと canvas を作らない。

## スコープ（Week1, ローカルで）

1. 自分の3 repo を対象に選ぶ: `_template` / `alloy` / `chom-chom`（既知・多様・品質を正直に判定できる）。
2. **Layer 1 抽出**: TS Compiler API + `@babel/parser` で `component_index` JSON（名前 / file / prop schema / screen vs part）+ design token（`tailwind.config` + `@theme`）。→ 正しいパーツを見つけるか?
3. **Layer 3 render**: `prototypes-monorepo/_template/scripts/capture-screens.ts` パターンで component/画面を Playwright screenshot。→ clean render 率は?
4. **生成**: index（catalog を prompt cache, `claude-api` skill 準拠）を `@anthropic-ai/sdk` に `search_components`/`get_component` tool で渡し、新画面を生成 → scene-graph → render。→ **実コンポーネントを流用しプロダクトらしく見えるか?**
5. **sandbox 調査（time-box）**: ephemeral container（Fly Machines 等）が secret なし / egress drop で1 repo を boot + install + screenshot できるか。最怖インフラを先に。

## 受け入れ基準（kill / continue 判定）

- ✅ **continue**: 3 repo で `component_index` が正しいパーツを抽出 / Claude が実component ≥3 を流用した scene-graph を生成 / 自分が「続きを作りたい」モックが出る / sandbox が1 repo を安全に render。→ Sprint 1 へ。
- ❌ **kill/fix**: 既知良 repo で index が誤る / Claude が実パーツを流用しない → UI を作る前に **抽出を直す**。canvas に逃げない。

## 並行で回すこと（Discovery）

- UX Researcher が `persona-solo-maker` / `persona-pm-cant-design` / `persona-ds-lead` を**並行**インタビュー → WTP（軸4）と差別化（軸5）の仮説を当てる。synthesis は `playbook/research/`。

## スコープ外（Sprint 1 以降）

interactive canvas 編集 / 複数画面フロー / Spec / QA / コメント / チーム / 課金 / 任意repo堅牢性。

## 成果物

- `playbook/operations/2026-06-XX_issue-001-spike-report.md`（kill/continue 判定 + 数値）
- スパイクコードは `app/` 外の使い捨て（例: `app/../spike/` or 別 scratch）。本体に混ぜない。
