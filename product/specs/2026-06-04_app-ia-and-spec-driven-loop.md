<!-- 作成日: 2026-06-04 / Owner: Head of Product + Principal Designer -->
# continuum アプリ IA & 仕様駆動ループ（グレースケールWF）

> **更新 2026-06-04 (Round1反映)**: 専門家+ペルソナのレビュー（`playbook/quality-reviews/2026-06-04_ia-review-round1.md`）を受け、**6タブ→4タブ**に統合。最終モデル = **`Spec · Mock · QA · Build`**。
> - Intent+Spec → **Spec**（成熟度ピル 意図→下書き→確定、コンテキストに repo/Issue URL 内包）
> - Design+Mock → **Mock**（発散↔収束トグル、DS準拠バッジ、@デザイナーにレビュー導線、流用部品/トークンを右に常設）
> - QA → 維持
> - Handoff → **Build**（Spec確定でアンロック、タスクは「提案」明記、承認者表示、Cursor/Claude Code/GitHub/Linear連携、AI実装手前に承認ガード）
> - サイドナビ修正済（repo行2段・ドット前置き・部品数inline）。
> 以下 v1 記述は初期案の記録（一部は上記で置換済み）。

continuum 本体（`app/`）の情報設計。グレースケールの shadcn/ui ワイヤーフレームとして実装済み。デザインの作り込みは後工程、まず構造を固める。

## 0. 参照: Amazon Kiro（spec-driven development）
spec を用意 → タスク化 → 実装 を回すAIコーディングツール。受け入れられた背景＝**「いきなりコードでなく、仕様を中心に AI と進める」と手戻りが減り、意図が資産化される**。continuum はこれを **デザイン/モックの発散・収束まで含めて** 一気通貫にする（Kiro はコード寄り、continuum は Spec↔Design↔Mock↔QA↔実装 を繋ぐ）。

## 1. 仕様駆動ループ（6ステージ = 上部タブ）
`Intent → Spec → Design → Mock → QA → Handoff`（CEOの5ステップ + Handoff）。直線でなくループ:
- **Spec は下書き → 確定 の2状態**。
- **Mock は発散の場**（パターン候補を広げる discovery board）→ 1案を **採用＝収束** → Spec(確定) に差分反映。
- **Handoff** で確定 spec を **実装タスクに自動分解**（Kiro型 spec→tasks）→ GitHub/Linear へ、将来は AI 実装へ一気通貫。

## 2. IA 決定（CEOの4つの問い）

### ① 左サイドナビ（AppSidebar）
- ヘッダー: ワークスペース切替（continuum / 三上奏太 · Personal）
- **ワークスペース**群: Inbox / Design Issues（主）/ Components（流用部品ライブラリ）
- **接続済みリポジトリ**群: mikan(142) / Sotas(88) — 同期ドット + 部品数バッジ
- フッター: 設定 / ユーザー
- 折りたたみ可（icon collapse）

### ② ヘッダー
- 一覧: SidebarTrigger + breadcrumb(Workspace / Design Issues) + 検索 + New Issue
- 詳細: SidebarTrigger + breadcrumb(Design Issues / ISSUE-ID) + repoバッジ + Specステータス + アバター + 共有。直下にタイトル行、その下に **6ステージのタブ**。

### ③ 一覧ページ vs ディテールページ
- **一覧**: Design Issues。フィルタバー（repo/ステージ/ソート）+ テーブル + **右プレビューパネル**（master-detail）。
- **ディテール**: 1 Issue を開く。上部タブでステージ切替。各タブ = **3カラム**（左コンテキスト + 中央ワークスペース + 右AI/インスペクタ）。
  - Intent: 依頼 + repoコンテキスト / Spec: アウトライン + Notion風doc + AI / Design: 画面 + canvas + トークン・部品 / **Mock: 画面 + 発散収束ボード + AI・流用部品** / QA: フィルタ + ケース + 生成/連携 / Handoff: 構成 + タスク分解 + エクスポート。

### ④ 一覧のパネル（list panel）
- テーブル行: `ISSUE-ID + repoバッジ / タイトル`・ステージ・Spec状態・担当アバター・コメント数・更新。
- 右プレビュー: 選択 Issue の 進捗ステッパー・概要・受け入れ基準・流用部品・「開く」。

## 3. 実装メモ
- スタック: Next.js 16 + React 19 + Tailwind v4 + shadcn/ui（neutral=グレースケール）+ lucide。`app/`。
- 主要ファイル: `src/components/app-sidebar.tsx` / `src/components/stage-stepper.tsx` / `src/app/page.tsx`（一覧）/ `src/app/issues/[id]/page.tsx`（詳細・6タブ）/ `src/lib/data.ts`（ダミー）。
- データは全てダミー（後で Supabase の workspaces/repos/issues/specs/mock_*/qa へ置換）。
- 既知の軽微: console に `asChild` 警告（描画影響なし、後で解消）。
- 起動: `cd app && npm run dev -- -p <port>`。

## 4. 次の論点（後で詰める）
- タブは6つで多いか? Design を Mock に畳むか（CEO判断）。
- Spec の「下書き↔確定」状態遷移のUX、Mock収束→Spec差分のインタラクション。
- Components（流用部品ライブラリ）ページの設計。
- 配色・トークン（グレースケール卒業時）。
