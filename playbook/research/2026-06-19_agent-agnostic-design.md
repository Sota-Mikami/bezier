<!-- 作成日: 2026-06-19 / Owner: COO / Status: 設計＋v1 実装済み（DEC-132） -->
# Bezier を「あらゆるコーディングエージェント対応」にする設計（＋v1 実装）

## Context
Bezier は CEO 環境向けに **Claude Code 前提**で作られていたが、実体はローカルラッパーで、思想として Claude に縛りたくない。Codex・Cursor CLI・aider・Gemini CLI・opencode・任意の CLI を**ユーザーが自由に選べる**設計へ。CEO 3 点（①通知の共通化 ②起動の汎用化 ③切替 UX）＋網羅調査。CEO 承認で **フル v1 を実装**（組込＝claude/codex＋任意 CLI のカスタム）。

## 設計の核 — AgentAdapter（能力宣言レジストリ）
`app/src/lib/agent-adapters.ts`。`if (id==="claude")` 分岐を、各エージェントが能力を**データ**で宣言する adapter に置換: prompt 渡し方（positional/flag/stdin）・resume・contextDirs（flag/fold）・settings(hooks)・headless・notify(hooks/idle/exit-only)・commandsDir・conventionFiles・newlineKeySeq・template（custom）。`buildLaunch(adapter,bin,ctx)` が cmd/args/initialInput/notify/eventsPath を生成（claude の variadic 安全な順序＝prompt 先頭・--add-dir 末尾を封入）。`adapterForId` は未知 id を安全な generic にフォールバック。

## CEO 3 点への回答（＝実装）
1. **通知の共通化**: 状態 `{running/waiting/done/error}` を **exit code（全）＋hooks（claude）＋idle（非hook 新規）** で統一。Rust `pty_statuses` を strategy 別に（hooks=events ファイル増／idle=had_output && 無出力≥idle_ms／exit-only）。idle の waiting は誤検知し得るので had_output ガード＋`pty_write` で clock リセット。
2. **起動の汎用化**: `launchAgent`/`handleResume`/`fixWithAgent` を `buildLaunch` 化、`isClaude` 撤去。prompt は per-adapter（aider 等で positional=ファイル名の誤動作回避・未知は stdin 既定）。
3. **切替 UX**: detectAgents が組込＋カスタムを統合し既存ピッカーに反映。Settings に **カスタムエージェント追加 UI**（name/bin/argv テンプレ）＋**能力ヒント**（resume?・待機検出の精度・継承する規約ファイル）。codex は coming-soon 解除（idle で起動可）。

## moat（規約継承）は自然に汎用化
各エージェントが**自分の**規約ファイル（CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules / GEMINI.md / aider CONVENTIONS.md）を読む。Bezier は spec をハンドオフするだけ。能力ヒントの「継承」で可視化。

## v1 実装（コミット）
- v1-1 `ad31f37`: agent-adapters.ts（レジストリ＋buildLaunch＋claude/codex/custom）＋unit tests。
- v1-2 `9235367`: 呼び出し側を buildLaunch 化（isClaude 撤去）／detectAgents が custom 統合・codex 解禁／settings.customAgents（型＋coerce）。claude 挙動はバイト一致。
- v1-3 `f4bcad0`: Rust idle-waiting＋strategy 配線（PtySpawnOpts/Session/pty_spawn/pty_statuses/pty_write、TermSpawn/TerminalPane/ptySpawn）。
- v1-4/5 `e5e0d2e`: カスタムエージェント UI＋能力ヒント＋文言の agent 中立化（en/ja）＋headless は claude 限定を明文化。
- 検証: tsc 0 / eslint 0 / vitest 75（buildLaunch 6 ケース）/ cargo green。本番 build→ditto。

## 割り切り / 延期（記録）
- **headless（deploy-env の `claude -p`）は v1 で claude 限定**: `.env` 物理遮断の deny ルールが claude `--settings` 依存。非対応 agent は env 推論をスキップ（安全）。deny 能力の一般化は later。
- **slash パック（`~/.claude/commands/bezier`）は claude 専用据置**: 非 claude には無害（baseline は BEZIER.md インライン散文）。per-adapter commandsDir は later。
- **terminal Shift+Enter の newline 列**（claude ESC+CR）は据置（非 claude は稀な多行入力のみ影響）。
- **per-issue の adapterId 永続**（着手 agent で再開）は later。cursor/aider/gemini の組込 adapter（実フラグ検証込み）も later＝今は **custom 登録**でカバー。

## リスク（対策済）
idle 誤検知（had_output＋既定 8s＋pty_write リセット＋idle の OS 通知抑制）／prompt 渡し（per-adapter＋未知 stdin）／custom 安全性（argv トークン置換・shell 連結なし・PATH 検証）／resume 乖離（能力ヒストで明示）／headless 秘密漏れ（claude 限定 gate）。

## 検証（dogfood）
claude＝従来どおり（resume/hooks 通知）。codex＝PATH にあれば選択→Implement→idle で waiting→done。**カスタム**＝任意 CLI を Settings 登録→ピッカーに出る→起動→exit で done。claude 未導入でも「コーディングエージェントを入れて/カスタム追加」案内＋他 agent で動く。
