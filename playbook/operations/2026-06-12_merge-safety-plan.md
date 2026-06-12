<!-- 作成日: 2026-06-12 / Owner: CEO+CoS / OPEN-001 を実装スライスに格上げ -->
# merge 安全層 実装プラン（Issue branch を安全に畳む）

> CEO: merge 衝突は実運用で確実に起きる。Issue が増える前に今入れたい（OPEN-001 格上げ）。
> 方針: Accept=branch commit のみ(main 不触)は維持。**衝突は main の外（隔離 worktree）で解決**してから merge する安全層を足す（DEC-008/G1' の精神を保つ）。

## 0. 課題
各 Issue branch は「Implement 時点の main」から枝分かれ。別路線(直接 main commit) や他 Issue で main が進む → 後で merge する時に同一ファイルで衝突。今 Bezier は **merge を助ける仕組みが無い**。

## 1. Rust git コマンド（`src-tauri/src/lib.rs`・既存 git_* に追加）
- `git_behind_ahead(worktree, base) -> {behind:u32, ahead:u32}`：`rev-list --count <branch>..<base>`（behind）/ `<base>..<branch>`（ahead）。base 既定="main"。
- `git_merge_conflict_check(worktree, base) -> {clean:bool, files:[String]}`：`git merge-tree`（実行せず衝突検知）。新しめの git の `merge-tree --write-tree` で衝突ファイルを列挙。
- `git_sync_main(worktree, base) -> {ok:bool, conflicts:[String]}`：worktree の branch に **base を merge**（`git -C <wt> merge <base>`）。衝突したら conflicts を返し **merge は中断せず衝突状態のまま残す**（ユーザー/AI が右ターミナルで解決→commit）。クリーンに merge できたら ok。
- `git_merge_to_main(repo, branch) -> Result`：**ガード付き**。repo(main の作業ツリー)で `git merge <branch>`。事前条件＝branch が base 最新(behind=0)＆作業ツリー clean＆無衝突。条件を満たさなければ Err（「先に Sync」）。
- すべて `reject_traversal`＋stderr surface。`invoke_handler` 登録。

## 2. TS（`src/lib/git.ts` 拡張）
上記の薄いラッパ＋型。`use-implement-session.ts` に behind/ahead 状態と `sync`/`mergeToMain` アクションを追加（Accept/Discard はそのまま）。

## 3. UI（`issue-agent-panel.tsx`）
- ヘッダ/コントロール付近に **"N commits behind main" バッジ**（0 なら "up to date"・緑）。Issue を開いた時＆Accept 後に更新。
- **「Sync with main」**ボタン：`git_sync_main` 実行。
  - クリーン → behind 更新（0 に）＋「同期済」表示。
  - 衝突 → 衝突ファイル一覧＋「右のターミナルで解決して commit してください」。AI に「main を取り込んで衝突を解決して」と投げる導線（handoff 再利用）も可。
- **「Merge to main」**ボタン：`git_merge_to_main`。**behind=0 ＆ 無衝突の時だけ活性**。押すと main に merge → status=merged。それ以外は disabled＋ツールチップ「先に Sync with main」。
  - ※ DEC-008/G1' は本来 PR 運用。ソロ dogfood 用にアプリ内 merge を**ガード付き**で提供。将来チームでは「PR を開く」に差し替え可能に（runner 同様 additive）。

## 4. フロー
```
Implement→実装→Accept(branch commit)
  → behind 表示
  → behind>0: Sync with main（衝突は隔離 worktree 内で解決→commit）
  → Merge to main（ガード：behind=0 ＆ 無衝突のみ）→ status=merged
```

## 5. 受け入れ
1. Issue 詳細に behind バッジが出る（main が進むと増える）
2. Sync with main で main を取り込める／衝突時は一覧＋ターミナルで解決できる
3. Merge to main は最新＆無衝突の時だけ押せ、main に反映される
4. 既存（Implement/Re-run/Accept/Discard/Preview/web&tauri runner）を壊さない

## 6. 検証ゲート
cargo build / tsc=0 / eslint clean / next build / `/issues` 200。実 git 挙動は dogfood ゲート＋temp repo スモーク。

## 7. 順序の注意
**(b) Tauri runner と同時に走らせない**（両方 lib.rs・issue コンポーネントを触る＝並行編集衝突）。Tauri runner 着地後に着工。
