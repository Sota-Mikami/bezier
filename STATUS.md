<!-- 最終更新: 2026-06-08 / DEC-005: 再開（RESUMED）+ 再定義 / DEC-006: アーキ確定（Tauri+Web+OSS流用） -->
# continuum — 現在地（2026-06-08 / ▶ RESUMED・再定義）

> ▶ **2026-06-08 再開（DEC-005）**。賭ける層を engine → **レイヤC（プロダクト意思決定の SoR + ベンダー横断オーケストレーション）** に移し、**自分用ツールとして全部入りで作り切る**方針（dogfood-first）。
> 📌 再開時の読む順: この STATUS → `playbook/decisions-log.md`（DEC-005/006）→ `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md`。

## ▶ 再定義サマリ（DEC-005/006 / 2026-06-08）
- **新コア**: Superset が「コードを書く指揮者」なら continuum は「**プロダクト/デザインの意思決定を束ねて貯める指揮者+台帳**」（Sierra プロセスのSoR の design/PM 版）。engine は Claude Code/Codex/Claude Design に委譲。
- **空白**: コーディングagentオーケストレーション層は混雑、生成エンジン層はネイティブ侵食。**設計/プロダクト意思決定 SoR は誰も占有していない**＝唯一筋が通る層。
- **Founder=First User**: CEO は既に手で SoR層を運用（decisions-log/approval-queue/handoff/memory/仮想法人）→ 製品化＝自分の運用の載せ替えが最短 dogfood。
- **アーキ確定（DEC-006）**: 殻=**Tauri v2**（軽さ / 摩擦時 Electron 退避）/ UI=単一 React web（ブラウザ表示も無料）/ ブロック=**Plate(MIT, MDX)** / Canvas編集=**Onlook(Apache-2.0, React+Tailwind固定)** / ターミナル=**xterm.js + Rust portable-pty** / Onlook AST engine=Node サイドカー隔離。正本=.mdx/.yaml/scene-graph を Git。
- **ビルド順**: v0.1 SoR+Plateエディタ → v0.2 ターミナル+委譲 → v0.3 Canvas表示 → v0.4 要素編集(Onlook)。
- **時限リスク**: Claude Code が「設計判断の恒久記録」をネイティブ統合したらレイヤCも侵食 → 窓が開いている今のうち（定期ウォッチ）。
- **次アクション**: ③OSSライセンス棚卸し=完了（`2026-06-08_oss-license-inventory.md`）→ ②v0.1 着工へ。

## ⏸ 旧 pause の経緯（DEC-004 / 2026-06-05・参考）
- 当時の停止理由 = Codex preview 登場で「楔のエンジン」がネイティブに吸われる懸念（ハーネス競合リスクの現実化）。**この判断は正しかった**（engine層に賭けていた）。DEC-005 はこれを否定せず、賭ける層を engine → SoR/オーケストレーションに移して再開するもの。
- 当時 validated: エンジン実動（extract/鍵なし生成/実部品render/revertable shim）。未validated: SoR層の独立需要 ← まさに今回の再定義で正面から取りに行く層。

## 🔀 大転換: OSS open-core へ (2026-06-05 / DEC-002 / DEC-001アーキを supersede)
- **収益 = OSS open-core（n8n型）**: ローカルエンジン/local maker loop は **fair-code で無料**（self-host 自由・SaaS再販禁止）。hosted クラウドSoR・チーム・SSO・無制限版管理 = **サブスク有料**。
- **アーキ = ローカルエンジン（CLI daemon, npm）+ クラウド SoR**: ingestion/モック生成/render/エージェント委譲はユーザーマシンで、**ユーザー自身の Claude Code サブスクで実行**。クラウドへ送るのは scene-graph/spec/PNG のみ（ソースコードは出さない）。SoR が moat の実体（Sierra プロセスのSoR）。
- **技術lin = green**: Claude **Agent SDK**（`@anthropic-ai/claude-agent-sdk`）で Claude Code ハーネスを埋め込み、SDK更新で新モデル/tool-use/MCP/hooks を自動継承 = 「Modelを足すだけ」問題の解。詳細・DEC全文・却下代替案 = `playbook/operations/2026-06-05_local-engine-architecture.md`。
- **効果**: ISSUE-001 の鍵待ちが消える（ユーザーの Claude Code で生成）。enterprise security（コードがクラウドに出ない＋監査可能OSS）が差別化。

## ✅ 楔 de-risked: ISSUE-002 PASS (2026-06-05 / 鍵なし・Claude Code サブスク)
- **経路A確定**: `@anthropic-ai/claude-agent-sdk` + **MCP stdio**（catalog ツール）で、**ANTHROPIC_API_KEY なし・CEOの Claude Code サブスク**で生成が走った。DEC-002 のアーキ（Agent SDK + MCP 委譲）を実地で実証。
- **実数（架空0件・COOが独立裏取り済）**: chomchom 4/4・alloy 5/5・template 3/3 で**実コンポーネントを ≥3 流用**、reused は全件 index に実在。
- 楔の核心リスク（「ただの v0 か / 実部品を忠実に流用できるか」）を**継続(continue)判定**で通過 → Sprint へ。
- 成果物: `spike/cli.mjs`（extract/generate/list）/ `generate-sdk.mjs` / `mcp-catalog.mjs` / `scene-graph-schema-v1.json` / `out/gen-*.json`。レポート `playbook/operations/2026-06-05_issue-002-result.md`。

## 👁 「見える」: ISSUE-003 完了 (2026-06-05 / dogfood #1)
- scene-graph → **chom-chom の実部品で実レンダリング**成功。生成画面「語彙SRS復習」がブラウザ/PNG で見える。
- **clean render 率 = 5/6（83%）**: VocabFlashcard(中核UI・モックデータで完全動作)・TabBar・AchievementCelebration・generated×2 = REAL。唯一の FALLBACK は ReviewSession（Supabase `fetchDueItems()` 依存 → プレースホルダ表示）。
- 「これは MY app の部品だ」体験が実物で出た（v0/Lovable の白紙生成に対する楔の説得力を可視化）。
- 成果物: preview ルート `chom-chom/src/app/continuum-preview/page.tsx`（throwaway）/ `spike/screenshot-preview.mjs` / PNG `spike/out/render-chomchom.png`。レポート `playbook/operations/2026-06-05_issue-003-result.md`。
- 回し方: `node spike/cli.mjs preview chomchom "<意図>"`（dev server 起動済み前提, `PORT=3201 npm run dev` → `localhost:3201/continuum-preview`）。

## 🧩 汎用化: ISSUE-004 完了 (2026-06-05 / dogfood #2)
- chom-chom 専用ハードコードを除去し、**汎用 preview ジェネレータ**化。`node cli.mjs preview <repo> --port <n>` の**1コマンド**で gen-preview → dev server 自動起動 → PNG 完走。
- **別 repo で実証**: `template` repo を同一ハーネスで実描画（ProtoNav 等が REAL）= ハードコードでないことを証明。**clean render 率 = template 5/7(71%) / chom-chom 5/6(83%)**。alloy は repo がローカルに無く正直に exit 2（捏造しない）。
- **判明した recurring な壁**: 実 repo の **auth gate / provider / 複雑props** が naive preview を止める（chom-chom の `AuthGate`、template の `AuthGate`/`ScreenPanel`)。→ continuum は「preview-mode bypass / provider shim」戦略が要る（CEO 判断待ち）。
- 成果物: `spike/generate-preview.mjs` / `screenshot-generic.mjs` / `cli.mjs`(preview更新) / `out/render-{chomchom,template}.png`。レポート `playbook/operations/2026-06-05_issue-004-result.md`。

## 🔓 preview shim: ISSUE-005 完了 (2026-06-05 / DEC-003 / dogfood #3)
- **revertable preview shim** 実装。chom-chom の `AuthGate` 壁を突破し、**実ブラウザで preview content が描画**（ISSUE-004 では auth ログイン全画面で止まっていた）。AchievementCelebration モーダル等が live 描画。
- **安全実測**: 終了後・クラッシュ後とも対象 repo `git status` **クリーン（痕跡ゼロ）**。マニフェストは repo 外（`spike/out/shim-manifest-*.json`）、原子的復元。`--no-shim` で厳格 read-only。
- 中核: `spike/shim-engine.mjs`。CLI 統合済 `node cli.mjs preview chomchom --port 3201`（shim 適用→描画→復元 自動）。クラッシュ時手動復元 `node cli.mjs shim-restore chomchom`。
- 残: `--no-shim` 後の `continuum-preview/` untracked 残留（5行修正）/ ReviewSession の 1 FALLBACK（Supabase Session 依存）。
- レポート `playbook/operations/2026-06-05_issue-005-result.md`。

## ✅ dogfood ループ一周完成 (2026-06-05)
**`intent → 実部品で生成（鍵なし・自分の Claude Code）→ 実 repo の auth 壁を安全に越えて実レンダリングで見る`** が1コマンドで回る。楔の核心が CEO の手元で動作。
- **次の候補**: (a) 実日常 repo（mikan 等）で render 率の現実値を見る / (b) 残 FALLBACK 潰し（ReviewSession data mock・`--no-shim` 残留）/ (c) SoR 着工（schema v1 → Supabase）/ (d) app/ canvas に流して見る体験を磨く。

## 🔄 詳細ページを会話駆動カスケードに刷新 (2026-06-04 / Mobbin準拠)
- CEO修正フロー = 「AI Chat→Specライブ→**承認**→Design生成→確定→QA生成」。Mobbin調査(`playbook/research/2026-06-04_mobbin-ai-work-apps.md`, T1=GPT Builder/Copilot/Replit/Jasper)で情報設計の王道を確認。
- 詳細ページを **会話主役の二ペイン** に刷新: 左=セッション(駆動・タイムライン: 生成イベント/**承認ゲート**/チェックポイント/次の一手/composer)、右=成果物ペイン(stageタブ=生成済み成果物のビューア+進捗、**未生成はロック**)。
- 承認カスケード: Spec確定→Design解放・3案生成→採用して確定→QA解放・生成→Build。URL永続化(?tab=&adopted=&sc=&dc=)。
- ステージ名 Mock→**Design** に統一(CEO語彙)。スクショ `app/.shots/v6-{spec-gate,design-gate,build}.png`。

## 🔄 ISSUE-001 スパイク進行中 (2026-06-04)
- **L1 静的抽出 = ✅ PASS**（鍵不要・完了）。自分の3 repo(_template/alloy/chom-chom)で 0 parse error、component registry+props+screen/part+edges+tokens 抽出。精度: alloyで grep候補22 vs 抽出23（recall~100%）。出力 `spike/out/*.json`。報告 `playbook/operations/2026-06-04_issue-001-spike-report.md`。
- **生成テスト = ⏸ 鍵待ち**。`spike/generate.mjs`(@anthropic-ai/sdk tool-use+prompt cache)実装済。**要: Anthropic APIキー + コスト上限 + モデル選択**。実行で「Claudeが実パーツ≥3を流用するか」を判定。
- 暫定: 最大リスクの前半クリア。後半（流用品質）が鍵待ちの決定的テスト。

## 🧭 確定している方針
- アーキ = ピュア Web SaaS（Next.js16/Vercel + Supabase + Claude API）。Day1 からチーム共有/課金前提。
- 楔 = 既存 repo → 実部品流用モック生成（v0/Lovable の白紙生成に対する文脈生成）。ステージ = **Idea**（build ≠ 検証）。
- チーム = COO + 専門家5 + ペルソナ4（`.claude/agents/`）。起ち上げプラン = `~/.claude/plans/cuddly-cuddling-crane.md`。

## ⏭ 次の選択肢（CEO 未決 / 楔 de-risked 後）
1. **生成→可視化を繋ぐ**: scene-graph → render（Playwright）or `app/` canvas に流し込み、「生成モックを実際に見る」ループを閉じる ← 楔の"説得力"を可視化
2. **SoR 着工**: scene-graph schema v1 を確定 → Supabase SoR schema + `app/` への生成エンジン移植（DEC-002 のクラウド側）
3. 収益仮説を詰める: Head of Product に 4ペルソナ WTP pressure-test（`2026-06-05_monetization-open-core.md`）
4. 配色を入れる（ブランド・グレースケール卒業）

---

## 🖥 ローカル起動
```
cd ~/Workspaces/Personal/projects/continuum/app
npm run dev -- -p 3100        # → http://localhost:3100 （落ちていたら再起動）
```
- 一覧: http://localhost:3100/ （左ナビ / テーブル+右プレビュー / 行クリックで切替）
- 詳細(会話駆動・二ペイン): `ISSUE-218`=Spec段階(承認ゲート) / `ISSUE-214`=Design段階 / `SOTAS-76?tab=build`=全解放
- URL永続化: `?tab=&adopted=&sc=&dc=`。最新スクショ `app/.shots/v6-*.png`
- 触れる点: 左の会話で「Spec を確定」→Design解放・3案生成→「採用して確定」→QA解放→Build。タブは生成済み成果物のビューア(未生成はロック)。
- 既知: グレースケールWF(配色は後) / render・生成は `spike/`(ISSUE-001, 生成は鍵待ち)。

## 再開ガイド & 構成
読む順: このSTATUS → `playbook/operations/2026-06-04_session-handoff.md`(詳細要約) → `COMPANY.md` / `playbook/decisions-log.md`(DEC) / `playbook/product-roadmap.md`。
- 単一窓口 = **COO**(`.claude/agents/coo.md`)。CEOの依頼はまずCOOが受ける。
- 最新の設計判断: `product/specs/2026-06-04_app-ia-and-spec-driven-loop.md` / `playbook/research/2026-06-04_mobbin-ai-work-apps.md`
- コード: `app/`（`src/app/page.tsx`=一覧 / `src/app/issues/[id]/page.tsx`=詳細(会話駆動) / `src/components/app-sidebar.tsx` / `src/lib/data.ts`=ダミーデータ）
- 楔スパイク: `spike/`（`extract.mjs`=L1抽出済 / `generate.mjs`=生成・鍵待ち / `out/*.json`）
- 戦略の根拠: `playbook/strategy/2026-06-04_continuum-thesis-v1.md`

---

## 進行中 ISSUE 一覧

| ISSUE | タイトル | Stage | Owner | 状態 |
|---|---|---|---|---|
| ISSUE-002 | ローカルエンジンCLI昇格 + Agent SDK 生成委譲 | Idea→MVP | Engineer | **✅ 完了 / continue 判定**（鍵なし・実部品≥3流用） |
| ISSUE-001 | 楔の de-risking スパイク | Idea | Engineer | **✅ 完了**（L1抽出 + 生成委譲 = ISSUE-002 で決着） |
| (app WF) | グレースケールWF＝会話駆動カスケード | — | Eng+Designer | 反復中・localhost:3100 |

---

## 直近の DEC

- **DEC-002** (2026-06-05): OSS open-core 転換。ローカルエンジン（CLI/fair-code/無料）+ クラウドSoR（サブスク有料）。Agent SDK で Claude Code 進化に追従。DEC-001 のアーキを supersede（プロダクト/楔/Sierra/ペルソナは不変）。
- **DEC-001** (2026-06-04): continuum 設立。アーキ=ピュアWeb SaaS / 楔=既存repo→コンセプトモック / コードネーム=continuum / 会社OS（本ディレクトリ構成・エージェントチーム）を採択。

---

## ハンドオフ・ログ（逆時系列）

### 2026-06-04 — 5サイクルレビュー後の P0着地 + スパイクscope定義（並行 / DEC）
- CEO決定: 「並行」(P0実装＋ISSUE-001スパイク定義) / 状態永続化=URL searchParams。
- **5サイクル自律レビュー(36体)** 完了。記録 `playbook/quality-reviews/2026-06-04_5cycle-review-round2.md`。自己レビューが「適用報告されたが未着地」を検出。
- **P0着地**(Lane A): QA「Buildへ進む」結線(未確定なら→Mock)・AI送信(入力→1往復)・差分カード適用/却下結線・QA/受け入れ基準/流用部品をデータ駆動化・**URL永続化(?tab=&adopted=&mat=)**・specFinalized=確定&&採用案あり。data.ts に QACase/components/acceptanceCriteria 追加。スクショ `app/.shots/v5-{qa,spec}.png`。
- **スパイクscope定義**(Lane B): `playbook/operations/2026-06-04_issue-001-spike-scope.md`。3 repo(_template/alloy/chom-chom)で L1抽出→L3 render→tool-use生成→scene-graph、測定可能な kill/continue 基準。CEO承認待ち(APIキー・コスト上限・mikan clone可否)。

### 2026-06-04 — Kiro由来の強化 + Mai批判の本丸（ライブ連動）
- **Kiro学習をAIレールに**: モデル選択(claude-opus-4.8)・**Autopilot**トグル・`@`参照(部品/Spec)・**差分提案カード**（Spec/Mock編集をAIが提案→却下/適用 = 「AIは提案、人が承認」）・生成物チップに「開く」。spec-as-file パス表示 `.continuum/specs/{id}/{stage}`。
- **Mai批判「Spec書いてる途中でMockが出るくらい融けて」への回答**: Specタブに**ライブMockプレビュー**を併設（doc | 連動プレビュー | AI）。タブは"場所"のまま中身をライブ連動させ"ウォーターフォール感"を解消。タブ見出しも「Spec と Mock はライブ連動」に。
- スクショ: `app/.shots/v4-{spec,build}.png`。

### 2026-06-04 — AIチャットをタブ横断の常駐レールに（Kiro UI 準拠）
- CEO指摘: AIチャットはタブ配下でなく横断した存在にすべき（Kiro UI 参照）。
- 詳細ページを再構成: タブ(Spec/Mock/QA/Build)は**左+中央のみ**制御。右に**AIセッション常駐レール**（新規/履歴、Ask/Agent、コンテキストチップ、Kiro風"生成物"チップ）。タブ移動でも同一セッション継続。
- タブ固有のインスペクタ（流用部品/トークン→Mock左、カバレッジ→QA左、エクスポート→Build中央）に再配置。タブ状態は controlled(useState)、AIレールに現在地を渡す。
- スクショ: `app/.shots/v3-{spec,mock}.png`。

### 2026-06-04 — IA Round1: 6→4タブ統合（レビュー反映）
- 専門家(HoP/Designer)+ペルソナ(Mai/Kenji/Priya)の5体レビューを実施。記録: `playbook/quality-reviews/2026-06-04_ia-review-round1.md`。
- 決定: **6タブ→4タブ `Spec · Mock · QA · Build`**。Intent→Spec統合 / Design→Mock統合 / Handoff→Build改名(Spec確定でアンロック・タスクは提案・承認ガード)。
- サイドナビの崩れを修正。Mockに DS準拠バッジ・発散↔収束トグル・@デザイナーレビュー導線・流用部品/トークン常設。
- 反映済みコード: `app/src/lib/data.ts`(4 stages+maturity) / `app-sidebar.tsx` / `app/src/app/issues/[id]/page.tsx`。スクショ `app/.shots/v2-*.png`。
- 未決: Mai「タブ=ウォーターフォール」批判への更なる融合 / enterprise要件(Priya) は Launch段階 / 配色は後。

### 2026-06-04 — 本体 `app/` 着工: グレースケールWF（Engineer + Designer）
- Next.js 16 + React 19 + Tailwind v4 + **shadcn/ui（neutral）** で `app/` を scaffold。
- グレースケールのワイヤーフレームを実装: 左ナビ / ヘッダー / 一覧(Design Issues + 右プレビュー) / 詳細(6ステージタブ×3カラム)。
- **Kiro 型 仕様駆動ループを IA に反映**: Intent→Spec(下書き)→Design→Mock(発散↔収束)→Spec(確定)→QA→Handoff(spec→タスク自動分解)→将来AI実装。
- IA仕様: `product/specs/2026-06-04_app-ia-and-spec-driven-loop.md`。principles.md のループ図を更新。
- 起動: `cd app && npm run dev -- -p 3100`（dev稼働中）。スクショ: `app/.shots/`。
- 次論点: タブ数(Designをmockに畳むか)・Spec下書き↔確定UX・Componentsライブラリ・配色。

### 2026-06-04 — セルフモック（dogfood #0 / Principal Designer）
- continuum の最初のコンセプトモックを作成（題材=continuum UI、接地=mikan ISSUE-214 SRS復習画面）。
- 2画面: Canvas（既存repo流用モック生成）+ Spec&QA（Notion風block + QA自動生成）。Retina 2x。
- 置き場所: `design/mocks/2026-06-04_continuum-self-mock/`（01-canvas / 02-spec-qa の .html + .png + README）。
- 理想（役割の連続体）への回答 兼 mikan/Sotas 実作業の時短デモ。本体実装ではなく出力プレビュー。

### 2026-06-04 — Founding セッション（COO）
- 会社OS の docs（COMPANY / STATUS / org-chart / playbook 一式 / product / design）を作成。
- `.claude/agents/` に専門家6 + ペルソナ4 を定義。
- `2026-06-04_continuum-thesis-v1.md` で 固い問題 + Sierra + Anthropic ステージ判定を実施。
- 次: CEO が ISSUE-001 着手を承認 → Week1 スパイク。
