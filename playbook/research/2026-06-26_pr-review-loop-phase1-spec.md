<!-- 作成日: 2026-06-26 / Owner: Head of Product → Principal Engineer (build) → QA Lead (verify) -->
# PR Review Loop — Phase 1 Spec
## "See review comments and address them with the agent, without leaving Bezier"

| | |
|---|---|
| **ステージ** | MVP / dogfood |
| **Owner** | Head of Product (spec) → Principal Engineer (build) → QA Lead (verify) |
| **状態** | Ready for build — CEO approved Phase 1 scope 2026-06-26 |
| **依存** | `session.injectOrFeedback` (DEC-152) / `session.prUrl` (existing) / `gh_pr_create` Rust command (existing) / Sync existing |
| **Phase 2 以降** | スレッドへの返信・Resolve / Re-request review / CI 詳細展開 → Phase 2。Bezier 内から Merge → Phase 3 |

---

## 1. 問題と根拠（固い問題フレーム）

### 誰の、どんな痛みか

**主体**: solo maker (Mai) / PM who can't design (Kenji) — PR を作りチームに渡してレビューを受けるすべての Bezier ユーザー。

**定量化できる workflow の断絶**:

現在 Bezier の maker-loop は `chat → implement → Sync → gh pr create` まで走る。しかし PR にレビューコメントが付いた瞬間に maker は **ループの外に出なければならない**:

1. GitHub.com を開く
2. レビューコメントを読む（ファイル/行/diff 文脈が入り混じる）
3. Bezier に戻る
4. コメント内容をチャットで agent に再説明する（コピペ or 記憶）
5. agent が実装 → Sync で push
6. GitHub に戻って「Fixed」とコメントを返す

**ステップ 1–4 が純粋なコンテキストスイッチ + 手作業**。agent は「何を直すか」を知らず、maker が橋渡し役になる。これが Bezier の「maker loop」テーゼの最大の穴。

### なぜ今か

- PR 機能 (`gh_pr_create`) が dogfood で使われ始め、レビューコメントを返す外部ユーザーが出ている
- `session.injectOrFeedback` (DEC-152) が no-restart で agent に注入する統一レールとして確立した — セマンティクスを持ったテキストを流し込む口がある
- BuildReview の sub-tab フレーム (Preview / Map / QA) が確立した — 4 枚目を追加するコストが低い

### Sierra / 固い問題チェック

- **Pain 定量化**: コンテキストスイッチ × コメント数。5件コメントがあれば往復 10+ 分、再説明エラーも発生する
- **既存予算**: GitHub を使っているチームは既にこの workflow に時間を払っている
- **AI 改善幅**: "コメント → コードに反映" は agent が最も得意なタスクの一つ。人手の再説明コストをゼロにできる
- **Sierra**: 既存 GitHub の UI を置き換えず、Bezier が「上のレイヤー」として review feedback を取り込む。SoA として差し込む設計

---

## 2. スコープ（Phase 1 で作るもの）

Phase 1 の One-liner:

> **maker が Bezier 内で PR のレビューコメントを確認し、選択したコメントをワンクリックで agent に渡して現在の worktree で修正させ、既存 Sync で push する。**

### 含むもの

1. **Review sub-tab** — BuildReview (Prototype エリア) に 4 枚目のタブ "Review" を追加。`session.prUrl` が null の Issue では非表示。
2. **PR review データの取得** — 新 Tauri コマンド `gh_pr_reviews` が以下を組み合わせてひとつの JSON を返す:
   - PR メタ（番号・状態・reviewDecision・reviewer 一覧）
   - レビュースレッド（path / line / diffHunk / body / 最初のコメント author / isResolved）
   - CI checks サマリー（名前 + 状態 + 件数）
3. **UI: ステータスバー** — reviewDecision バッジ / reviewer 一覧 / CI: N passed, M failed（件数のみ）
4. **UI: スレッドリスト** — unresolved スレッドを先頭に、解決済みは折り畳んだ状態で表示。各スレッドにチェックボックス（unresolved のみ有効）
5. **Address アクション** — 選択コメント（または "Address all unresolved"）を構造化プロンプトとして `session.injectOrFeedback` に流す
6. **Refresh** — タブヘッダーの Refresh ボタン（手動）+ タブを開いたときにデータが null / 2 分超古い場合は自動取得
7. **エラー / 空 / ロード状態** — 各ケースのメッセージ（後述）

### 含まないもの（Phase 2 / 3）

| カット | 理由 |
|---|---|
| スレッドへの「Fixed」返信 / Resolve | GitHub API への書き込みが必要。Phase 2 |
| Re-request review | 同上 |
| CI 個別ログ / 詳細展開 | Phase 2。今は件数サマリーのみ |
| 複数ラウンドのレビュー（過去ラウンドの diff 表示） | Phase 2 |
| Fork PR のレビュー取得 | `gh api` の owner/repo 解決が複雑。Phase 2 |
| PR へのコメント返信エディタ | Phase 2 |
| Bezier 内 Merge | Phase 3 |

---

## 3. データ取得の仕様（実装仕様レベル）

### 3.1 新 Tauri コマンド: `gh_pr_reviews`

```
invoke("gh_pr_reviews", { repoPath: string, branch: string })
  -> Promise<PrReviewData>
```

`repoPath` = `session.ref.path`（worktree のパス。`gh` はここを cwd として実行する）。  
`branch` = `session.ref.branch`。

Rust 実装が以下を順に実行する。いずれかが失敗した場合は `Err(String)` を返す（JS 側でエラー状態を表示する）。

**Step 1: PR number + state + reviewDecision + reviewers**

```
gh pr view <branch> \
  --json number,state,reviewDecision,reviews,headRefName,baseRefName \
  (cwd = repoPath)
```

返却フィールド:
- `number: i64` — PR 番号（以降の API 呼び出しに使う）
- `state: "OPEN" | "CLOSED" | "MERGED"`
- `reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "COMMENTED" | null`
- `reviews[].author.login: string`
- `reviews[].state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING"`
- `reviews[].submittedAt: string (ISO8601)`

**Step 2: owner / repo の解決**

```
gh repo view --json owner,name (cwd = repoPath)
```

`owner.login` + `name` を取得。fork PR 判定はしない（Phase 1 ではエラーにならず、Step 3 の GraphQL が失敗した場合だけエラーを返す）。

**Step 3: レビュースレッド（GraphQL）**

```
gh api graphql \
  -F owner=<owner> \
  -F repo=<name> \
  -F number=<pr_number> \
  -f query='
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              originalLine
              diffHunk
              comments(first: 20) {
                nodes {
                  id
                  author { login }
                  body
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  '
```

取得対象フィールドの意味:
- `id` — スレッド識別子（選択チェックボックスのキー）
- `isResolved` — 解決済みかどうか
- `path` — コメントが付いたファイルパス（repo root からの相対パス）
- `line` — コメント位置の行番号（新しい diff 上の行番号。outdated の場合 null）
- `originalLine` — PR 作成時点の行番号（`line` が null のときのフォールバック）
- `diffHunk` — diff 文脈（前後数行を含む）
- `comments.nodes[0]` — スレッドの起点コメント（author.login + body + createdAt）

> Phase 1 は「スレッドの最初のコメント」のみ表示する。返信（`comments.nodes[1+]`）は件数のみ表示し（例: "+ 2 replies"）展開しない。

**Step 4: CI checks**

```
gh pr checks <branch> \
  --json name,state,description \
  (cwd = repoPath)
```

`state` の取りうる値: `"SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "CANCELLED" | "SKIPPED" | "NEUTRAL"`

`gh pr checks` が存在しない gh バージョン or CI 未設定の場合: エラーではなく空配列 `[]` を返す（CI セクションは「CI なし」と表示）。

**Rust の返却型（TypeScript 型として定義 — `src/lib/pr-reviews.ts`）**

```typescript
export interface PrReviewData {
  prNumber: number;
  prState: "OPEN" | "CLOSED" | "MERGED";
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "COMMENTED" | null;
  reviewers: {
    login: string;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
    submittedAt: string;
  }[];
  ciChecks: {
    name: string;
    state: string; // SUCCESS / FAILURE / PENDING / ERROR 等
    description: string;
  }[];
  threads: {
    id: string;
    isResolved: boolean;
    path: string;
    line: number | null;       // null = outdated diff line
    originalLine: number | null;
    diffHunk: string;
    initiatingComment: {
      id: string;
      author: string;          // login
      body: string;
      createdAt: string;
    };
    replyCount: number;        // comments.nodes.length - 1
  }[];
}
```

JS 側の薄いラッパーを `src/lib/pr-reviews.ts` に置く:

```typescript
export function ghPrReviews(repoPath: string, branch: string): Promise<PrReviewData> {
  return invoke<PrReviewData>("gh_pr_reviews", { repoPath, branch });
}
```

---

## 4. UX / IA 仕様

### 4.1 タブの配置

`build-review.tsx` の `ProtoTab` 型に `"review"` を追加する。

```
Prototype エリア sub-tabs:
[Preview] [Map β] [QA β] [Review]   ← Review は prUrl != null のときのみ表示
```

Review タブのラベル:
- データ未取得 / ロード中 / エラー: "Review"
- 取得済み、unresolved スレッド 0 件: "Review"
- 取得済み、unresolved スレッド N 件: "Review (N)" — N をカウントバッジとして表示

### 4.2 タブを開いたときの動作

- データが null（初回）: 即座に `ghPrReviews` を呼び出しローディング状態を表示する
- データが 2 分以内: そのまま表示（Refresh で手動更新可能）
- データが 2 分超: 自動的に再取得する

最後の取得時刻は React state に保持する（セッション内のみ。アプリ再起動でリセット）。

### 4.3 タブ内レイアウト（上から順）

```
┌────────────────────────────────────────────────────────────────────┐
│ STATUS BAR                                              [Refresh ↻] │
│  ● CHANGES REQUESTED  |  Reviewer: alice (CHANGES_REQUESTED), bob  │
│  CI: 3 passed, 1 failed                                            │
├────────────────────────────────────────────────────────────────────┤
│ FILTER:  [Unresolved ▾]                                            │
│ ─────────────────────────────────────────────────────────────────  │
│ □  src/components/foo.tsx : 42                                      │
│    alice: "This function should memoize the callback."              │
│    ─ diff context ─ (折り畳み可, 最大 8 行表示)                    │
│                                                                     │
│ □  src/lib/utils.ts : 17                                            │
│    alice: "Missing null check here."                                │
│    ─ diff context ─                                                 │
│                                                                     │
│ ✓  (resolved) src/app/page.tsx : 5     [+2 replies · Resolved]     │
│    bob: "Looks good."                                               │
├────────────────────────────────────────────────────────────────────┤
│ FOOTER (sticky)                                                     │
│  [Address selected (2)]   Address all unresolved                    │
└────────────────────────────────────────────────────────────────────┘
```

**STATUS BAR の詳細**:

| reviewDecision | 表示 |
|---|---|
| `APPROVED` | ✓ APPROVED（emerald 系テキスト）|
| `CHANGES_REQUESTED` | ✗ CHANGES REQUESTED（destructive 系テキスト）|
| `REVIEW_REQUIRED` | ○ REVIEW REQUIRED（muted テキスト）|
| `COMMENTED` | ○ COMMENTED（muted テキスト）|
| `null` | — |

Reviewer 一覧: `reviewer.login` をカンマ区切り。状態が `CHANGES_REQUESTED` の reviewer は名前を強調（font-medium）。

CI サマリー: `ciChecks` を集計し "N passed, M failed" と表示。failed が 0 なら "N passed"。checks が空なら "CI: —"。

Refresh ボタン: ローディング中はスピナー + disabled。

**FILTER**:

- "Unresolved" / "All" のトグル（デフォルト: Unresolved）
- All 表示のとき resolved スレッドは視覚的に抑制（opacity-50 + ✓ アイコン + "Resolved" バッジ）し、チェックボックスは disabled（resolved スレッドを address には渡さない）

**スレッド行の詳細**:

- チェックボックス: unresolved のみ有効。resolved は disabled（☑ マーク + opacity-50）
- ファイルパス + 行番号: `path:line`（line が null のとき `path (outdated)` と表示）
- Author: `author:` ラベル + body のテキスト（最大 2 行、overflow hidden + hover で全文 tooltip）
- Diff context: `<pre>` タグのコードブロック。最大 8 行表示。8 行超は "... (show more)" で展開
- 返信がある場合: "+ N replies" のテキストリンク（Phase 1 はクリックしても何もしない or GitHub リンクに飛ぶ）

**FOOTER (sticky)**:

- "Address selected (N)" ボタン: 選択済みスレッド数 N。N = 0 のとき disabled
- "Address all unresolved" テキストボタン: 全 unresolved を選択してから同じアクションを実行

### 4.4 空状態 / ロード / エラー

| 状態 | 表示 |
|---|---|
| `prUrl == null` | タブ自体が非表示（BuildReview に Review タブを追加しない）|
| ローディング中 | タブ内にスピナー + "Fetching review comments…" |
| 取得成功、スレッドが 0 件（レビューなし） | "No review comments yet." + Refresh ボタン |
| 取得成功、Unresolved フィルタで 0 件 | "No unresolved comments." + "Show all" リンク |
| `gh` not authenticated | "GitHub CLI is not authenticated. Run `gh auth login` in your terminal." + Refresh ボタン |
| その他 gh エラー | エラーメッセージ（stderr を表示）+ Refresh ボタン |
| PR が closed / merged | STATUS BAR に "MERGED" / "CLOSED" バッジを表示。スレッドは引き続き読める。Address ボタンは enabled のまま（merged 後に別 PR で使える）|
| Draft PR | 通常と同じ動作（reviews は draft でも付けられる）|

---

## 5. Address アクションのプロンプト形式

`session.injectOrFeedback(text)` に渡すテキストの形式。選択されたスレッドの数と内容によって可変。

```
Address the following PR review comments in this worktree (branch: <branch>).
For each comment, locate the indicated file and line, understand what the reviewer is asking for, and implement the fix directly. Do not reply to review threads or add explanatory comments — just fix the code. When done, write a brief summary of what you changed per comment.

[1] <path>:<line | "outdated"> — <reviewer_login>:
"<body>"

Diff context (for reference):
<diffHunk truncated to 20 lines if longer>

[2] <path>:<line | "outdated"> — <reviewer_login>:
"<body>"

Diff context:
<diffHunk>

...
```

**実装上の注意**:

- `branch` は `session.ref.branch` から取る
- `diffHunk` が 20 行を超える場合は最初の 20 行のみ。末尾に `[... truncated]` を付ける
- `body` が 500 文字を超える場合は 500 文字に切り詰め `[... truncated]` を付ける
- thread が複数のコメント（返信あり）を持つ場合、Phase 1 は起点コメント (`initiatingComment`) のみをプロンプトに含める

**inject 後の動作**:

- チェックボックスをすべて解除する（再実行の重複を防ぐ）
- agent がコードを修正したら、maker は既存の Sync ボタンで commit + push する
- GitHub 側の PR は自動更新される（Push が走るため）

---

## 6. 受け入れ基準（QA Lead が採点できる形式）

以下を **実機（Bezier.app）で、dogfood repo の実際の PR を使って**確認する。

### AC-1: Review タブの表示条件

- PR を作成していない Issue を開く → Prototype エリアに "Review" タブが表示されない
- 同じ Issue で `gh pr create` を実行してから再度確認する → "Review" タブが出現する
- "Review" タブをクリックする → GitHub からのデータ取得が開始し、ローディング表示が出る

### AC-2: PR ステータスの正確性

- reviewDecision が `CHANGES_REQUESTED` の PR を対象にする → STATUS BAR に "CHANGES REQUESTED" が表示される
- reviewer が 2 名いる場合 → 2 名の login が STATUS BAR に表示される
- CI が設定されていて 1 件 failure がある → "N passed, 1 failed" と表示される

### AC-3: スレッドリストの正確性

- 1 件 unresolved・1 件 resolved スレッドがある PR → Unresolved フィルタで 1 件のみ表示される
- "All" フィルタに切り替える → 2 件表示される（resolved はグレーアウト + "Resolved" バッジ）
- unresolved スレッドの `path:line` が GitHub 上のコメント位置と一致する
- diff hunk が 8 行以内の場合 → 全行が表示される。8 行超の場合 → 8 行 + "... (show more)"

### AC-4: Address アクション

- unresolved スレッド 2 件にチェックを入れ "Address selected (2)" をクリックする
  → agent チャットに構造化プロンプトが inject される（再起動なし）
  → プロンプトに `[1]` `[2]` の形式で 2 件のコメントが含まれる
  → `path:line` と `reviewer_login` と `body` がそれぞれ正確に含まれる
- "Address all unresolved" をクリックする → unresolved 全件が inject される
- inject 後にチェックボックスがクリアされる

### AC-5: Refresh

- Review タブが開いている状態で Refresh ボタンをクリックする → 再取得が走りデータが更新される
- 別のタブに切り替えて 2 分以上待ち、Review タブに戻る → 自動再取得が走る（手動 Refresh 不要）

### AC-6: 空状態 / エラー状態

- レビューが 0 件の PR で Review タブを開く → "No review comments yet." が表示される + Refresh ボタンが有効
- `gh auth` が通っていない環境でテスト（または `gh` が PATH にない）→ タブ内にエラーメッセージが表示される（アプリのクラッシュ / 空白画面はない）

### AC-7: 非退行

- Review タブを追加しても既存の Preview / Map / QA 各サブタブが正常に機能する
- `session.injectOrFeedback` への inject が Address 以外のフロー（Annotation コメント等）で引き続き機能する
- PR を開いていない Issue では Review タブが一切出現せず、既存 UI に影響がない

---

## 7. エッジケースの処理方針

| エッジケース | Phase 1 の処理 |
|---|---|
| PR が存在しない | タブ非表示。`session.prUrl == null` で判定 |
| PR は存在するがレビューがない | タブ表示。"No review comments yet." の空状態 |
| `gh` が PATH にない | エラーメッセージを表示。`gh auth login` を案内 |
| `gh auth` 未実施 | 同上。stderr をユーザーに見せる |
| Fork PR | `gh repo view` が fork の origin を返すため GraphQL が失敗する。エラーメッセージ: "Review comments for fork PRs are not yet supported. View on GitHub." + `session.prUrl` への外部リンク |
| Draft PR | 通常と同じ動作 |
| PR が merged / closed | STATUS BAR にバッジ表示。スレッドは読み取り専用で表示。Address は引き続き可能（close 後の follow-up 用途）|
| Outdated diff 行 (`line == null`) | ファイルパスのみ表示。行番号なし。プロンプトには `path (outdated)` として渡す |
| diffHunk が極端に長い（500 行超） | 最初の 20 行のみ取得・表示。Rust 側で切り詰める |
| `gh pr checks` が使えない (古い gh バージョン) | CI セクションを "CI: —" と表示。エラーにしない |
| reviewThreads が 100 件超 | GraphQL の `first: 100` で打ち切り。タブ内に "Showing first 100 threads" の注記を追加 |
| 選択 0 件で Address をクリック | ボタンが disabled のためクリック不可 |

---

## 8. 実装時の参照点（Principal Engineer 向け）

### 既存の再利用レール

| 用途 | 既存コード |
|---|---|
| agent へのテキスト注入 | `session.injectOrFeedback(text)` in `use-implement-session.ts:1403` |
| worktree パス | `session.ref.path` (WorktreeRef) |
| branch 名 | `session.ref.branch` |
| PR URL (判定用) | `session.prUrl` (string \| null) |
| Rust `gh` 呼び出しパターン | `gh_pr_create` / `gh_pr_state` in `src-tauri/src/lib.rs:2615, 2683` |
| BuildReview sub-tab フレーム | `src/components/issues/build-review.tsx` — `ProtoTab` 型と `UnderlineTab` を拡張 |
| sub-tab shortcut | `useTabShortcuts` in `build-review.tsx:112` — `PROTO_TABS` 配列に `"review"` を追加 |
| sub-tab persistence | `getViewState` / `setViewState` in `build-review.tsx:53-58` |

### 新規ファイル

- `src/lib/pr-reviews.ts` — 型定義 + `ghPrReviews` ラッパー関数
- `src/components/issues/pr-review-tab.tsx` — Review タブの全 UI

### Rust 追加コマンド

- `fn gh_pr_reviews(repo_path: String, branch: String) -> Result<PrReviewData, String>` — `lib.rs` に追加し `tauri::generate_handler![]` に登録
- `PrReviewData` を Rust の `#[derive(Serialize, Deserialize)]` struct として定義（`serde_json::Value` から各フィールドをパース）

### i18n

新規文字列キーは `en.json` / `ja.json` に追加する。キーの例:
- `review.tabLabel` / `review.tabLabelWithCount`
- `review.statusDecision.*`
- `review.emptyNoComments` / `review.emptyNoUnresolved`
- `review.addressSelected` / `review.addressAllUnresolved`
- `review.errorGhNotAuth` / `review.errorForkNotSupported`
- `review.filterUnresolved` / `review.filterAll`
- `review.ciLabel` / `review.ciNone`

---

## 9. Phase 2 / 3 で追加するもの（先読み・今は作らない）

| Phase | 追加内容 |
|---|---|
| Phase 2 | スレッドへの「Fixed / Addressed」返信。`gh api` PATCH で thread を resolve。Re-request review。CI 個別ログの展開（外部リンク or インライン）。返信スレッドの展開表示。過去レビューラウンドの diff 表示 |
| Phase 3 | Bezier 内 Merge（`gh pr merge`）。PR コメント（行コメントでない PR 全体コメント）の表示と返信 |

---

## 10. 並行作業・非依存性

このスペックは以下に依存しない（並行で開発可）:

- ISSUE-006 (Agentic Map) — 独立した Prototype sub-tab
- DEC-157 以降の進行中タスク — Review タブは既存 BuildReview に追加するだけ

このスペックが完了しないと進められない後続作業:

- Phase 2 のスレッド返信・Resolve（Phase 1 の Review タブ UI + `gh_pr_reviews` コマンドが前提）
