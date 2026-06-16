# 「現状（Live）」— repo ホームに "今のアプリを動かして見る" 前段（DEC-109 詳細）

> 作成日: 2026-06-16 / きっかけ: CEO dogfood 中「Issue を考える前に、今のものを起動して見たい」。
> 決定: [[decisions-log]] DEC-109。本ノートは UX 確定内容＋実装計画。

---

## 1. 抜けていた前段（なぜ作るか）
Bezier は **Issue 起点**（起票→Spec→…→Preview）。Preview は **Issue の worktree に紐づく**ので、**Issue を作る前に現状を見る**手段が無い。だが maker は「**まず今の物を動かして見て、そこから何を変えるか決める**」＝Discovery/Idea ステージ（見る→気づく）。この居場所を作る。

## 2. 確定 UX（CEO 選択）
- **入り口＝repo ホーム＝現状**：repo を選ぶ（Issue 未選択）と、空状態（現「Select an issue」）が **「▶ 現状を見る (Live)」** になる。**明示クリック**で repo ルートの dev サーバ起動（**worktree 無し・read-only**）→ ライブアプリが画面を埋める＋ルート移動。
- **v1 スコープ＝見る＋Issue化の橋渡し**：Live 上で **注釈（comment/pen）** → **「これを Issue にする」** で **{注釈テキスト＋スクショ＋対象ルート}** を初期文脈に持った**新規 Issue** を立てる。観察が枠（Issue）にそのまま流れ込む。

## 3. 実装計画

### 既存資産の現実
- `usePreviewServer(root, worktreePath, …)`：worktreePath が null だと起動しない（worktree 前提）。**worktreePath に repo ルートを渡せば dev サーバは動く**。ただし内部で `ensureWorktreeNodeModules` / `ensureWorktreeTauriTarget` を呼ぶ（root に対しては概ね no-op か既存利用だが、**root を mutate しない**確認が要る）。
- 空状態：`page.tsx` の「repo open・Issue 未選択」コンポーネント（`issuesPage.selectIssueTitle`）が置き場所。
- `PreviewPane` は `session.preview` ＋ `session` を要求。Live には session/issue が無いので、**PreviewPane を session 非依存に薄く一般化** or **RepoLivePreview を新設**（dev サーバ＋iframe＋ルート入力＋注釈の最小再利用）。

### Phase 1 — repo-level Live preview（実需「/site を Bezier で見る」を即満たす）
1. **repo-root preview**：`usePreviewServer(root, root)` 派生（read-only・mutate しない）。
2. **空状態を Live に**：「▶ 現状を見る (Live)」CTA → 起動 → ライブアプリ＋ルート移動＋レスポンシブ（既存 Preview UI 流用）。
3. read-only（agent も commit も無し）。**Live と Issue の Preview を呼び分け**（"現状/Live" vs Issue の "Preview"）。

### Phase 2 — 注釈 → Issue化の橋渡し（Bezier 固有価値）
4. Live 上に共有 `AnnotationLayer`＋**新 surface**（send＝Issue 作成）。
5. **「これを Issue にする」**：`createIssue` を呼び、初期 body/Spec に **{注釈テキスト・スクショパス・対象ルート}** を差し込んで新規 Issue を開く（観察→枠）。
6. スクショは既存 `captureRegion`、ルートは Live の現在 path。

### 任意・後段
- 現状アプリの **Map**（repo レベルの画面俯瞰）も同じ枠で。
- 「現状」常設エントリ（サイドバー固定行）— 今回は repo ホーム実装を優先。

## 4. 技術的な要確認
- `usePreviewServer(root, root)` が **root を書き換えない**こと（node_modules/tauri-target ensure の挙動）。書き換えるなら read-only ガード or 別経路。
- dev サーバの **同時数**（既存 DEC-040 の上限）と Live の扱い。
- session 非依存化：`PreviewPane` を一般化するか新コンポーネントか（後者が安全・前者が DRY）。

## 5. 狙い（戦略）
活性化↑（開いた最初の一画面＝動くアプリ）/ Discovery を一級市民に / moat 整合（自分の動く repo でオリエンテーション）。Anthropic playbook の Idea ステージを UI で支える。
