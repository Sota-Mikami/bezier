<!-- 作成日: 2026-06-22 / Owner: Principal Engineer + CEO -->
# Preview を attach-first に — 確定設計（DEC-141 #5 / cmux 体験）

> **CEO の体験像**: 「**AI Agent が能動的に dev サーバを起動 → Bezier が起動を検知したら自動でブラウザを開く**」を基本に、**手動 URL 入力はフォールバック**（= cmux 体験）。
> **真因**: 表示は DEC-120 で既にネイティブ webview（cmux 方式）。**不安定の根は「任意スタックの dev サーバを自動検出して自動起動」**（DEC-121〜130 は全部その綻びのパッチ）。
> **方針（CEO 確定）**: Bezier は **dev サーバを起動しない**のを基本に。起動はエージェント/人が持ち、Bezier は**起動済みサーバを検知して映す**。自動検知方式は **両方（ポート探索＋ターミナル parse）**。

## 現状アーキ（接地）
- `use-preview-server`: `status`/`config`(devCommand/port/packageDir/externalUrl)/`attach`(DEC-129)/`start()`/`stop()`/`apps`。
- **管理モード（既定・脆い）**: devCommand を検出→pty で起動→`parseDevServerUrl(output)` で URL→`httpPing` poll→ready。
- **attach モード（DEC-129・脇役）**: `config.externalUrl` を `httpPing` poll→ready（プロセス管理なし）。
- 表示: ネイティブ webview（DEC-120）。`httpPing`(Rust `http_ping`・loopback 限定) / `http_probe`(loopback 限定) あり。

## 3ピース設計

### ① エージェントが起動＋URL 報告（プロンプト規約・低リスク・先行出荷可）
- implement ガイド（`prompts.ts` JA/EN）に追加：「**プレビューが要るなら、dev サーバを起動し、URL を maker に伝える（例 `npm run dev` → http://localhost:3000）。Bezier が検知して自動で表示する。**」
- 起動の**永続化**: エージェントの pty は issue 単位で永続（DEC-040）。背景起動 or Bezier の preview ボトムパネル端末（永続 `shell:<cwd>`・DEC-126）で起動。**ここは要・実機 dogfood で挙動確認**（背景プロセスの生存・ターン跨ぎ）。

### ② 起動済みサーバの自動検知（核・要 dogfood）
- **待機状態**（管理 not-running かつ attach 未設定）で background poll：
  - **(a) ターミナル parse**: 直近の出力（管理ログ＝`parseDevServerUrl` 既存／エージェント pty 出力＝**新規に読む必要あり**）から `https?://(localhost|127.0.0.1):PORT` を拾う。見つかればそれを優先。
  - **(b) ポート探索**: 見つからなければ **よくある dev ポート**を `httpPing` で順に叩く（候補例: 3000, 5173, 5174, 8080, 4321, 3001, 8000, 4000, 9000, 1420, 5000）。最初に応答した URL を採用。
  - config の port ヒントがあれば最優先。
- 採用 URL を **attach 扱いで setUrl+ready→webview が開く**（= 「起動を確認したら開く」）。
- **注意/リスク**: 非標準ポートは探索漏れ→手動欄で補完。複数サーバ稼働時は曖昧（最初の応答 or ユーザー選択）。エージェント pty 出力の読み取りは新規配線（現状 thread は自由テキスト非保持＝pty バッファ直読が要る）。

### ③ attach-first UI（reframe）
- 未起動状態を **「dev サーバを待っています…（起動すれば自動で開きます）」** に。②の探索を回す。
- **手動 URL 欄**（上書き・既存 attach 入力を昇格）。
- **「Bezier に起動させる」（現状の自動検出+起動）は小さなフォールバックボタンに格下げ**（critical path から外す）。
- per-issue 記憶（externalUrl 永続・既存）。

## 実装順（リスク順）
1. **①プロンプト**（低リスク・自己完結）— 先行出荷。
2. **②自動検知**（核・要 dogfood）— ポート探索を先に（自己完結）、ターミナル parse（管理ログ→エージェント pty）を後に。既存の管理/attach パスを壊さないようスコープを「待機状態のみ」に限定。
3. **③UI reframe**（②と一体）。

## 検証観点（dogfood）
- 代表スタック（Next 3000 / Vite 5173 / Rails or Docker:3000 / mikan-for-school 等）で「エージェント起動→自動で開く」が成立するか。
- 背景 dev サーバの生存（ターン跨ぎ・⌘Q 後）。
- 既存の管理起動 / attach（DEC-129）/ 注釈フリーズ / login（DEC-120）に回帰がないか。
