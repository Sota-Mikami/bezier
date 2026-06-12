<!-- 作成日: 2026-06-04 / Owner: Head of Product + COO -->
# Bezier — プロダクトロードマップ

> フレーム: Anthropic AI-Native Startup Playbook（Idea→MVP→Launch→Scale）。各段階は **1つ** を証明する。build ≠ 検証。楔を鋭くするまで広げない。
> 現在地: **Idea Stage**（2026-06-04）。

## ステージマップ

| Stage | 証明すること | Exit 基準 |
|---|---|---|
| **Idea**（W1-2） | 「文脈生成」の魔法が本物か。生成モックを maker が「これは自分のプロダクト、続きを作れる」と言うか（v0 白紙より明確に良い） | 自分の3repo（`_template`/`alloy`/`chom-chom`）で実component≥3を正しく流用、自分で使いたい、v0 に side-by-side で勝つ |
| **MVP**（W3-10） | 一人 maker が repo→mock→編集→spec→QA を Bezier内で回し、既存ツールより好むか（dogfood） | GitHub App + 取込（L0-2堅牢, L3 best-effort）/ scene-graphモック / React Flowボード / iframe基本prop編集 / BlockNote spec（AI下書き）/ spec+mockからQA生成 / Liveblocksコメント。自分の機能を週内に2本他ツール無しで通す。取込が実repo 8/10成功 |
| **Launch**（M3-5） | 非創業者が払い継続するか。チーム共有が pull を生むか | チーム共有 / Stripe課金 / 任意repoオンボーディング / full canvas編集 / Design Issues（LLM支援）/ export-to-code。N design-partner が週次active、初課金、他人のrepoで「接続→最初の価値あるモック<10分」 |
| **Scale**（M6+） | Bezier の **ワークフロー** が標準になるか | renderランナー信頼性/perf / push毎の差分再取込 / DS drift検出 / QA自動化深化 / enterprise（SSO/audit）。モックが日常的に出荷コードになる |

## Now / Next / Later

### 🔵 NOW（Idea）
- **ISSUE-001**: 楔の Week1 de-risking スパイク（使い捨て、本体ではない）。
  - 自分の3repo → TS Compiler API + Babel で `component_index` JSON 抽出。
  - `capture-screens.ts` パターンで component/画面 screenshot。
  - index を `@anthropic-ai/sdk`（`search_components`/`get_component` tool + prompt cache）に渡し、新画面生成 → scene-graph → render。**実componentを流用しプロダクトらしく見えるか?**
  - untrusted code render の sandbox を time-box 調査。
  - **kill/continue**: 既知良repoでindexが誤る/Claudeが実パーツを流用しないなら、UIを作る前に抽出を直す。

### 🟡 NEXT（Idea → MVP 入口）
- Sprint 1: 最薄縦slice（repo接続→intent→React Flowボードに実component流用モックのサムネ）。
- GitHub App 登録、Supabase スキーマ（workspaces/repo/ingestion/component_index/mock_*）、Bezier-agent サービス scaffold。

### ⚪ LATER（MVP 以降）
- interactive iframe canvas 編集 / BlockNote spec + AI下書き / QA 自動生成 / Liveblocks コメント / チーム共有 / Stripe / 任意repo堅牢性 / export-to-code。

## 最大の技術リスク（常時意識）

クラウドで・許容コスト/レイテンシで、任意 repo を「Claude が実component を忠実に流用するモックを生成できる」だけ豊かな component index に変換でき、それを headless render で証明できるか。**ここが弱いと Bezier はただの v0**。他（auth/RLS/editor/billing/Liveblocks）は自分のコードで解決済み。
