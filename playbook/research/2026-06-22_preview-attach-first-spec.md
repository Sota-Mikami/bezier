<!-- 作成日: 2026-06-22 / Owner: Principal Engineer + CEO -->
# Preview を attach-first に — 確定設計（DEC-141 #5 / cmux 体験）

> **CEO の体験像**: 「**AI Agent が能動的に dev サーバを起動 → Bezier が起動を検知したら自動でブラウザを開く**」を基本に、**手動 URL 入力はフォールバック**（= cmux 体験）。
> **真因**: 表示は DEC-120 で既にネイティブ webview（cmux 方式）。**不安定の根は「任意スタックの dev サーバを自動検出して自動起動」**（DEC-121〜130 は全部その綻びのパッチ）。
> **方針（CEO 確定）**: Bezier は **dev サーバを起動しない**のを基本に。起動はエージェント/人が持ち、Bezier は**起動済みサーバを検知して映す**。
> **自動検知（CEO 指摘で改訂）**: **ポート探索は撤回**（複数イシュー同時で誤検知）。サーバは**ポートでなく worktree で紐付ける** → **per-issue URL 宣言（主）＋ lsof worktree-scoped 検出（robustness）**。詳細は ②。

## 現状アーキ（接地）
- `use-preview-server`: `status`/`config`(devCommand/port/packageDir/externalUrl)/`attach`(DEC-129)/`start()`/`stop()`/`apps`。
- **管理モード（既定・脆い）**: devCommand を検出→pty で起動→`parseDevServerUrl(output)` で URL→`httpPing` poll→ready。
- **attach モード（DEC-129・脇役）**: `config.externalUrl` を `httpPing` poll→ready（プロセス管理なし）。
- 表示: ネイティブ webview（DEC-120）。`httpPing`(Rust `http_ping`・loopback 限定) / `http_probe`(loopback 限定) あり。

## 3ピース設計

### ① エージェントが起動＋URL 報告（プロンプト規約・低リスク・先行出荷可）
- implement ガイド（`prompts.ts` JA/EN）に追加：「**プレビューが要るなら、dev サーバを起動し、URL を maker に伝える（例 `npm run dev` → http://localhost:3000）。Bezier が検知して自動で表示する。**」
- 起動の**永続化**: エージェントの pty は issue 単位で永続（DEC-040）。背景起動 or Bezier の preview ボトムパネル端末（永続 `shell:<cwd>`・DEC-126）で起動。**ここは要・実機 dogfood で挙動確認**（背景プロセスの生存・ターン跨ぎ）。

### ② 起動済みサーバの自動検知（核・要 dogfood）— **issue-correct**（CEO 指摘で改訂）
> **却下した方式**: 「よくあるポートを `httpPing` 探索→最初の応答」。**複数イシュー同時進行では各 worktree が別ポートで dev サーバを立てるため、イシュー A の preview が B のサーバを誤検知する**（ポートで紐付けるのが根本的に誤り）。**ポート探索は撤回。**
> **原則**: サーバとイシューの対応は **worktree** で一意（A のエージェントは A の worktree で起動＝そのプロセスの cwd は A の worktree）。**ポートでなくイシュー/worktree で紐付ける。**

- **(a) per-issue URL 宣言（主）**: エージェントが起動した URL を**そのイシューの場所**（`<issue.dir>/preview-url`・spec.md と同じ `--add-dir` 配下）に1行書く。Bezier は**そのイシューのファイルだけ**を poll で読み、`httpPing` で生きていれば attach。曖昧さゼロ（他イシューのファイルは見ない）。
- **(b) lsof worktree-scoped 検出（robustness・宣言が無い時）**: Rust で `lsof -nP -iTCP -sTCP:LISTEN`（listen ポート+PID）→ 各 PID の cwd（`lsof -a -p PID -d cwd`）を取り、**cwd がそのイシューの worktree 配下のものだけ**を採用。他イシューのポートは cwd が違うので拾わない。新規 Rust コマンド `discover_worktree_url(worktree)`。
- 採用 URL を **attach 扱いで setUrl+ready→webview が開く**（=「起動を確認したら開く」）。manual URL は上書き。
- **注意**: (a) はエージェントの協力が要る（プロンプト①で `preview-url` 書き込みを指示）。(b) は OS 依存（macOS lsof）。両方 issue-correct。

### ③ attach-first UI（reframe）
- 未起動状態を **「dev サーバを待っています…（起動すれば自動で開きます）」** に。②の探索を回す。
- **手動 URL 欄**（上書き・既存 attach 入力を昇格）。
- **「Bezier に起動させる」（現状の自動検出+起動）は小さなフォールバックボタンに格下げ**（critical path から外す）。
- per-issue 記憶（externalUrl 永続・既存）。

## 実装順（リスク順）
1. **①プロンプト**（低リスク・自己完結）— 先行出荷。
2. **②自動検知**（核・要 dogfood）— **(a) per-issue 宣言の reader を先に**（`<issue.dir>/preview-url` を poll→`httpPing`→attach・既存 attach パス再利用で自己完結）、**(b) lsof worktree 検出を後に**（新規 Rust コマンド）。既存の管理/attach パスを壊さないようスコープを「待機状態のみ」に限定。
3. **③UI reframe**（②と一体）。

## 検証観点（dogfood）
- 代表スタック（Next 3000 / Vite 5173 / Rails or Docker:3000 / mikan-for-school 等）で「エージェント起動→自動で開く」が成立するか。
- 背景 dev サーバの生存（ターン跨ぎ・⌘Q 後）。
- 既存の管理起動 / attach（DEC-129）/ 注釈フリーズ / login（DEC-120）に回帰がないか。
