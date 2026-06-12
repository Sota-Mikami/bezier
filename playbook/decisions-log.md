<!-- 作成日: 2026-06-04 / Owner: COO -->
# continuum — 決定ログ（DEC-###）

CEO が承認・決定した不可逆な事項を記録する。**二度聞かない。** 新しい決定は最上部に追記（逆時系列）。

---

## DEC-028 (2026-06-12) — Agent Inbox（要対応キュー）＋通知。並行Agentの「司令塔」

> CEO とのキャッチアップ（IDE/Agentオーケストレータ観点）で、A=「並行Agentの司令塔UX」を最優先と合意。並行Agent(DEC-026)を入れたが「どのAgentが今self を必要としているか」が分からない=残り半分。

- **Agentの状態を Rust 側で常時トラッキング**（terminal detach 中も reader thread が動くのでバックエンドが正）: `Session` に `last_activity`（出力ごとに更新）＋ `exited`（EOF で exit code 記録、session は map に残す）。
- **`pty_statuses(waitingAfterMs)`**: keyed Agent ごとに `running`（最近出力）/ `waiting`（生存だが idle ≥ 閾値=入力待ち推定）/ `done`(exit0) / `error`(exit≠0)。`pty_dismiss(key)` で exited を ack 除去。
- **Agent Inbox（サイドバー上部）**: waiting/done/error の Agent を集約表示（タイトル＋状態、idle 降順）。クリックでその issue へジャンプ（repo 切替込み）、done/error は ✕ で dismiss。running は inbox に出さない（self を必要としない）。
- **per-issue ドット拡張**: running=緑パルス / waiting=琥珀パルス / done=✓緑 / error=✕赤。
- **通知**: needs-attention へ遷移した瞬間（かつ現在開いている issue でない）に Web Notification（best-effort、権限を遅延要求）。新規プラグイン無し。
- ~~**waiting 閾値=8s**~~ → DEC-029 で**廃止**（CEO「8秒は急かしすぎ・明確に判定できないの？」）。Claude の Stop/Notification hook で決定論的に検知する方式へ。
- DEC-027 の badge `running` も `pty_statuses`(running|waiting) ベースに変更（lingering exited を緑にしない）。

---

## DEC-029 (2026-06-12) — waiting 検知を idle ヒューリスティック → Claude hooks で決定論化

> CEO:「8秒沈黙判定は急かしすぎ。明確に判定できないの？ cmux はちゃんと Agent からのアクション待ちの時に通知できている」。正しい。cmux は Claude Code の hooks で検知している（env に `CMUX_CLAUDE_HOOK_CMUX_BIN` があったのが証拠）。

- **実機検証**: `claude --settings '{"hooks":{"Stop":[...],"Notification":[...]}}' -p ...` で **Stop hook が発火し events ファイルに追記される**ことを確認（`--settings` は file/JSON 文字列を受ける、hooks は Stop/Notification/SubagentStop 対応）。
- **方式**: claude 起動時に `--settings` で **Stop/Notification hooks** を注入し、`<root>/.continuum/agent-events/<issueId>` に1バイト append させる（`agentHookSettings()` が JSON 生成）。
  - **waiting = events ファイルが spawn 後に増えた（hook 発火＝ターン終了/入力要求）**。idle 時間は一切見ない。
  - **解除 = user が pty に入力した瞬間**（`pty_write` で awaiting=false ＋ events baseline 更新）。
  - baseline は **spawn 時の events ファイル長**（Rust `pty_spawn`）。前 session の残りで誤発火しない。親ディレクトリも spawn 時に作成。
- **Rust**: `Session` に `awaiting` / `events_path` / `events_seen_len`。`pty_statuses` から `waiting_after_ms` 引数を撤去し hook ベース判定に。`PtySpawnOpts.events_path` 追加。
- **JS**: `agentHookSettings(path)`、`PtySpawnOpts.eventsPath`、`ptyStatuses()`(引数なし)。terminal→use-implement-session→agent-panel に `eventsPath` を配線。`WAITING_AFTER_MS` 撤去。
- **限界**: hooks は claude 専用。codex 等 hook 非対応 agent は waiting を出さない（done/error は exit で出る）。8s 誤検知が無くなるので体験は改善。
- B（visual review / Figma comment 風）= `playbook/ideas-backlog.md` に着手予定で記録。C/D も同ファイルに idea として保存。

---

## DEC-027 (2026-06-12) — status は手動廃止 → 事実から派生する読み取り専用バッジ

> CEO:「status 本当に必要？ 少なくとも手動はやめたい。IDE/Agent オーケストレーションツールだと普通どう設計する？」。整理: 課題管理系(Linear/Jira)は手動＋他人への進捗共有が主目的、Agent オーケストレータ(Cursor/Zenbu)は明示 status を持たず作業の事実から派生。continuum はソロ×Agent並行なので後者が素直。CEO 選択=「派生バッジ」。

- **手動ドロップダウン廃止**（StatusDropdown / STATUS_BADGE / ISSUE_STATUSES UI を撤去）。
- **派生状態 `deriveState`**（issues.ts）: 事実から計算。`done`(merged) > `running`(agent pty 走行) > `review`(PR あり) > `draft`(worktree あり) > `idea`(なし)。`DERIVED_STATE_META` でラベル＋トーン。
- **読み取り専用バッジ**（detail ヘッダ `StateBadge`）: 未着手/実行中(緑パルス)/下書き/レビュー中/完了(✓)。手で触れない。
- **自動遷移は既存の事実で駆動**: Implement/Start→worktree(=作業中), Open PR→prUrl(=レビュー中), running は pty ポーリング, merge は下記。
- **自動「完了」検知**: Rust `gh_pr_state(branch)` を新設。detail を開いた時 PR が `MERGED` なら status=merged に自動更新（Open PR→GitHub で merge したら勝手に完了になる）。`Merge to main`(ローカル)も従来どおり merged。
- **サイドバー**: 実行中=緑パルス● / 完了=✓ / それ以外=status ドット（per-issue の prUrl は読まないので review は draft 表示）。
- 内部の persisted `IssueStatus`(open/in-progress/merged) は自動メンテのキャッシュとして残置（手動編集経路は撤去）。

---

## DEC-026 (2026-06-12) — 並行エージェント: issue を離れても agent は走り続け、戻ったら再アタッチ

> CEO:「離れてどんどんいろんな Issue について話せるようにしてほしい」。現状は issue を離れると `IssueDetail` unmount → terminal unmount → `ptyKill` で agent が即死していた。

- **pty を issue ごとに永続化**: `PtySpawnOpts` に `key`（issue id）を追加。`key` 付き pty は **terminal を unmount しても kill せず**バックグラウンドで走り続ける。
- **Rust 拡張**: `Session` に `key` ＋ 出力 `backlog`（最後 ~256KB をキャプチャ）。新コマンド `pty_lookup(key)`（生存中の id を返す）/ `pty_backlog(id)`（再アタッチ時に再生）/ `pty_kill_key(key)` / `pty_active_keys()`（実行中インジケータ用）。
- **terminal.tsx**: `sessionKey` prop。mount 時に `pty_lookup` で生存 pty があれば **backlog を再生して再アタッチ**（spawn しない）＋ resize で TUI 再描画。unmount 時は `sessionKey` 付きなら **kill しない**。
- **use-implement-session**: issue を開いた時、生存 pty があれば auto-resume でなく**再アタッチ**（terminal を mount するだけ）。`Discard` / `Re-run` は `pty_kill_key` で明示停止。
- **サイドバー**: `pty_active_keys` を 3 秒ポーリングし、実行中 issue に **緑のパルス●**。
- これで「A で agent を走らせ → B へ移動して B の agent と話す → A に戻ると走り続けた agent に再接続」が可能に。DEC-025（ローカル永続化）と合わせ、生存中は再アタッチ・死んでいれば `--continue` で resume。

---

## DEC-025 (2026-06-12) — resume 不能の真因 = 継承された CMUX/CLAUDE_CODE env による「子セッション bridge 化」。spawn 時に除去

> CEO:「resume が引き続きできていない。チャットのログまで復元したい」。DEC-018（実体 claude 起動）でも直らず、徹底調査した。

- **調査結果（実データで確定）**:
  - 当該 worktree の claude セッション jsonl は `bridge-session`(`bridgeSessionId: cse_...`)＋`ai-title` だけで **user/assistant の本文がローカルに無い**。
  - cmux/nvm **両 claude とも** `--continue -p` で **NO_CONTEXT**（文脈すら復元不可）。`--resume <uuid>` も不可。
  - 環境変数に `CLAUDECODE` / `CLAUDE_CODE_SESSION_ID` / `CLAUDE_CODE_CHILD_SESSION` / `CMUX_*` が大量に存在 = **アプリが cmux/Claude-Code ターミナル内から起動され、それを継承**していた。
  - **クリーン env で検証**: `claude -p` で codeword を覚えさせ、`--continue` したら **ZEBRA42 を想起＝復元成功**。→ 原因は env による child/bridge 判定で確定。
- **修正（真因対応）**: Rust `pty_spawn` で子プロセスから **`CLAUDECODE` / `AI_AGENT` / `CLAUDE_CODE_*` / `CMUX_*` を除去**。これで spawn される agent は通常のトップレベルセッションになり、ローカルに会話を永続化＝`--continue` で文脈もチャットも復元される。
- **限界**: この修正**以降に作る新規チャットのみ resume 可能**。既存の bridge 化済みセッション（履歴は cmux 側）は復元不可。
- DEC-018（cmux shim を避け実体 claude を起動）は併存して有効（cmux bash shim は env 非依存で daemon 接続するため、実体バイナリ利用も必要）。

---

## DEC-024 (2026-06-12) — サイドバー開閉トグルをアプリのタイトルバーへ／detail ヘッダはタイトルのみ

> CEO:「SideNav の collapse をスクショ（Zenbu/Cursor）のように App 自体の Bar に置ける？ 今 icon button がある所はやめて、シンプルに Issue 名だけ。Issue 名の左の左矢印もいらない」。

- **Tauri overlay タイトルバー**: `titleBarStyle: "Overlay"` + `hiddenTitle: true`。ネイティブのタイトルバーを透過し、traffic lights は左上に浮く。
- **`AppTitlebar`（新規）**: ウィンドウ上部に薄い固定バー（`--titlebar-h: 2rem`）。左の traffic lights 用に `pl-[78px]`、その右に **SidebarTrigger（開閉トグル）**。`data-tauri-drag-region` でウィンドウドラッグ可。collapse 時もトグルは常に見える（サイドバー外）。
- **オフセット**: 固定サイドバー(`[data-slot=sidebar-container]`)を `top: var(--titlebar-h)` に、SidebarProvider に `pt-[--titlebar-h]`、ページの `h-svh`→`h-full`。バーの下に隠れないよう全体を下げる。
- **detail ヘッダ整理**: `SidebarTrigger` / 区切り / 「一覧へ戻る」(ArrowLeft) を撤去 → **Issue 名（＋status＋削除）だけ**。一覧/空状態ヘッダのトグルも撤去。
- ⚠️ overlay の見た目（traffic light クリアランス・トグル位置）は実ウィンドウ目視で微調整余地あり。

---

## DEC-023 (2026-06-12) — Step2: チャット即開始の入口 ＋ Spec はデフォルト表示（Add Spec ボタン廃止）

> DEC-021 の Step2。CEO:「New はチャット即開始で spec も AI に起草させたい」「Add Spec ボタンを押す必要なく default でテンプレ表示がいい」。

- **Add Spec ボタン廃止 / spec デフォルト表示**: issue を開いた時に spec.md テンプレを **自動生成**（`ensureSpec` を mount 時に deferred 実行）。Spec タブは常にエディタを表示（生成中だけ短いローダー）。
- **チャット即開始の入口**: worktree 未作成（`!ref`）の時、エージェントパネルのターミナル領域に **チャット入力**（textarea＋開始、Enter送信・自動フォーカス）を表示。送信で:
  - `handleStart(message)`（use-implement-session 新設）= Implement と同じ worktree 作成だが、**spec の事前存在を要求しない**。
  - `buildImplementHandoff` に `userMessage` を追加。エージェントに「①spec.md を起草 ②issue.md の title が空なら設定 ③その後に実装。不明点はまず質問」と指示。
- New（サイドバー）→ 空タイトル issue 作成 → detail を開く → チャット入力に即フォーカス、という一連の「チャットから始める」導線が完成。
- `Implement with AI`（既存 spec から実装）はコントロール側に残置（副導線）。

---

## DEC-022 (2026-06-12) — ゴミ箱はトグル内ではなく「横断1箇所」に集約

> DEC-021 の per-repo トグル内ゴミ箱を見て CEO:「各トグルにゴミ箱があるのは冗長。trash は toggle に入れず横断のゴミ箱一覧にしたい」。

- **トグル内ゴミ箱を撤去**し、各リポトグルは純粋にイシューリストに。
- サイドバー **最下部（footer）に「ゴミ箱（N）」** を1つ。押すと **全リポ集約の横断ゴミ箱ビュー**（各行に Issue タイトル＋所属リポ名＋残日数＋復元/完全削除）。
- 全リポの trash は mount 時に一括ロード（1ディレクトリ読みずつ・軽量）して footer 件数＋一覧に使用。auto-purge も同時。
- issues は従来どおり展開時に lazy ロード。

---

## DEC-021 (2026-06-12) — 情報設計を刷新: 左サイドバー＝リポ→イシューのナビゲーター

> CEO がスクショ（Zenbu/Cursor風）を提示。「左上に大きい New、左ナビは複数リポをトグルで縦に並べ、配下にイシュー、リポ毎ゴミ箱を最下部、検索＋初期5件表示」。New は将来「チャット即開始で spec も AI に起草させる入口」にしたい。

- **進め方（CEO 選択）**: **Step1=IA 刷新を先に / Step2=チャット即 spec 起草は次セッション**。New 挙動は「チャット即開始」を選択（Step2 で配線）。
- **Step1 実装（このコミット）**:
  - `app-sidebar.tsx` を全面刷新し **イシューナビゲーター化**（旧 Obsidian 風の下部リポ切替＋Issues/Repo nav を撤去）。上部に大きい **New** ＋ **検索**、各リポを開閉トグル、配下にイシュー（**初期5件＋「もっと見る」**）、トグル最下部に **リポ毎ゴミ箱**（インライン展開で復元/完全削除）。
  - **イシュー/リポ選択でアクティブ repo が切替**（別リポのイシューを開ける）。`useWorkspaceRoot.recents` をリポ一覧に流用。
  - メインペイン（`/issues`）= 選択中イシューの detail / 無選択時はランディング。旧 `IssueList`・`TrashView` は撤去（サイドバーへ移設）。
  - 検索時は全 recents をロードして横断フィルタ。各リポは展開時に lazy ロード＋ TTL 自動 purge。
  - `useSearchParams` を使うので layout で `AppSidebar` を `<Suspense>` ラップ（static export 対応・`next build` 通過確認済）。
  - git 依存の `purgeTrashed` を `lib/issue-actions.ts` に切り出し、サイドバー/detail で共有。
- **Step2 予定**: New→detail 即オープン＋チャット入力に即フォーカス→初回送信で worktree 作成＋AI 起動し spec を会話で起草。

---

## DEC-020 (2026-06-12) — 削除はゴミ箱方式（30日後 auto-purge）＋ゴミ箱一覧で復元/完全削除

> dogfood 中 CEO が誤って Issue を削除（native-confirm 修正が load される前の window.confirm スルーが原因）。git の dangling commit から作業コミットは復旧できたが、gitignore 下の spec/log テキストは消えていた。CEO:「一旦 Trash にして、30日後に完全削除。トラッシュ一覧で手動完全削除もできるように」。

- **削除＝ゴミ箱へ退避（可逆）**: `.continuum/drafts/<id>-<slug>` と thread を `.continuum/trash/` に **move（rename）**。**git（worktree/branch）は触らない** → 完全に復元可能。`.trashed.json`（deletedAt / branch / worktreePath）を folder 内に残す。
- **30日 auto-purge**: Issue 一覧マウント時に `expiredTrash`（deletedAt + 30日 ≤ now）を `purgeTrashed` で完全削除。
- **ゴミ箱一覧 UI**: ヘッダの「ゴミ箱（N）」トグルで一覧表示。各エントリに **復元**（move-back）と **完全に削除**（手動・確認付き）。「あと N 日で完全削除」を表示。
- **完全削除だけが破壊的**: worktree `--force` 除去 ＋ branch `-D` ＋ trash folder 削除。これは手動 or auto-purge 時のみ。
- **Rust `move_path`（rename）を新設**: `..` 拒否＋ source と dest parent が **両方 `.continuum` 配下**であることを必須化。`remove_path` と同じ堀。
- 旧 `deleteIssue`（即物理削除）は廃止し `trashIssue` に置換。TTL 定数 `TRASH_TTL_DAYS = 30`。

---

## DEC-019 (2026-06-12) — 起票（Issue）の削除機能を追加

> CEO:「起票の delete 機能が欲しい」。これまで Issue は作成のみで削除導線が無かった。

- **削除導線を 2 箇所**: ① Issue 一覧の各行（hover で trash ボタン）② Issue 詳細ヘッダ（status の隣に trash）。確認ダイアログ付き（不可逆）。
- **削除＝完全パージ**: ① worktree ref があれば `git worktree remove --force` ＋ `branch -D`（in-progress な Issue を消しても worktree を orphan しない）② Issue フォルダ `.continuum/drafts/<id>-<slug>` ③ 活動スレッド `.continuum/issues/<id>` を削除。詳細から消す時は preview を stop してから purge → 一覧へ戻る（unmount で terminal も片付く）。
- **Rust `remove_path`（再帰削除）を新設**: `..` traversal 拒否＋**解決後パスが `.continuum` 配下にあることを必須**化（実 repo ファイルは消せないガード）。不在パスは no-op。
- データ層 `issues.ts` は git 非依存のまま（FS のみ）。worktree teardown の orchestration は page 側 `purgeIssue` に置く。

---

## DEC-018 (2026-06-12) — resume が空で開く原因 = cmux.app の `claude` shim。実体 CLI を起動するよう解決

> CEO:「セッション再開しても以前のチャットログが再表示されない（本来の resume になっていない）」。調査の結果、PATH 上の `claude` が cmux.app 同梱 shim で、セッションを bridge するだけで `~/.claude/projects` に再生可能な transcript を残さない → `claude --continue` が再描画する履歴を持たない。

- **原因**: `commandExists("claude")` ＋ pty が継承する PATH で **cmux.app の claude が優先**。これは bridged session で、`--continue` しても空の画面で開く。実体の Claude Code（`~/.nvm/.../bin/claude` = 公式 native バイナリ）は標準どおり transcript を永続化する。
- **修正**: Rust `resolve_command(name)` を新設し、PATH を走査して **cmux.app 配下の shim をスキップ**して最初の実体バイナリの絶対パスを返す（shim しか無ければ最後の手段として返す）。`detectAgents` が `bin` をこの絶対パスにして pty 起動。
- **限界**: これ以降に作る session のみ resume 可能。**過去の cmux-bridged session は復元不可**（ローカル transcript が無い）。
- 関連: 自動 resume（issue を開くと `--continue` を 1 回自動起動）は別途実装済。実体 CLI に切り替わったことで、今後はその自動 resume が過去ログ込みで開く。

---

## DEC-017 (2026-06-12) — `Accept` を `Commit` に改名 ＋ "merged" ステータスの誤りを修正

> dogfood で CEO:「Accept が何か分かってなかった。一時保存的な意味なんだね、ちょっと分かりにくい」。実体は「AI の差分を branch に commit するチェックポイント」で、最終マージではない。さらに Accept した瞬間にステータスが "merged" になっていた（実際は main に何も入っていないのに）＝二重に誤解を生む。

- **ボタン `Accept` → `Commit`**（実体に一致。flow = Implement → Commit → Open PR / Merge）。スレッド表示ラベルも「Commit（branch に確定）」、AI への衝突解決プロンプトの「UI の Accept」も「UI の Commit」に。
- **"merged" 誤表示を修正**: Commit はチェックポイントなので status は **in-progress のまま**。実際に main へ入る **Merge to main 時のみ status = "merged"** にする。Open PR はレビュー段階なので status を変えない（PR がマージされたら status メニューで人が反映）。
- 内部の action 名 / ThreadEventType `"accept"` は維持（既存 thread.json との互換のため。表示ラベルだけ変更）。

---

## DEC-016 (2026-06-12) — decision.md を廃止（A）。決定記録は thread.json に統合

> DEC-014 が「decision.md は optional・要否は後で判断」と保留にした件。dogfood 中 CEO:「（横断 Decisions ビューは消したが）issue ごとの decision.md は？」→ 整理すると、横断ビューは撤去済みだが **decision.md 自動生成は Accept 時に残存し、案内も「Decisions に表示されます」と存在しない画面を指す残骸**だった。CEO 判断 =「A（完全廃止）。ただし適切に JSON 保持はする」。

- **`decision.md` 自動生成を廃止**（`draftDecision` ＋ 唯一の補助 `sectionBody` を削除、Accept のメッセージ修正、ディスク上の orphan `decision.md` も掃除）。
- **データモデルから decision スロットを除去**: `IssueSlot = "spec"` のみ／`IssueSlots = { spec }`／slotPath・readIssueAt・createIssue・SLOT_TEMPLATES から decision を撤去。
- **決定記録は thread.json（JSON）に一本化**（"適切に JSON 保持"）: `ThreadEvent` に `changedPaths?` / `branch?` を追加し、**Accept イベントが「何を・どこを commit したか＋branch」を構造化保持**。decision.md が持っていた「影響・触れた所／関連」の実体はこれで残る。
- durable な "why" の所在 = **spec（なぜ/何を）＋ thread.json（活動＋確定記録）＋ PR body（spec＋活動を載せる・DEC-008）**。decision.md は冗長だったため不要。
- 横断 Decisions メニュー/ビューは DEC-014 で既に撤去済（per-issue ログのみ）。

---

## DEC-015 (2026-06-12) — finalize は pluggable: Open PR を既定（team-safe）/ Merge to main は solo opt-in

> dogfood で CEO:「solo なら Merge to main で良いが、実 repo で直 merge は怖い。make PR が妥当では」。→ DEC-008/G1'（main は reviewed merge でしか変えない）に立ち返る。直 merge は solo の便宜だった。

- **issue を畳む finalize を pluggable に**（runner / SoR adapter と同型）:
  - **Open PR**（GitHub remote がある repo の既定）: `git push -u origin <branch>` → `gh pr create`。レビュー/CI/merge はプラットフォーム上で・**main を直接触らない**。PR 本文に spec＋決定/ログ（why が what と同じ PR・DEC-008）。**PR リンクを issue 記録に保存**（DEC-014 の "PR アクセス" を満たす）。
  - **Merge to main**（remote 無し or solo の opt-in）: 今の直 merge。secondary/advanced に降格。
- 判定: origin remote ＋ `gh` available なら Open PR を主・Merge to main を副。remote 無しなら Merge to main のみ。
- gh は認証済（Sota-Mikami）。Open PR は dirty なら WIP コミット→push→PR（sync と同様）。

---

## DEC-014 (2026-06-12) — issue 記録モデル: spec + 統合ログ + PR-link / 共有は adapter / team plan は後・solo first

> CEO 要件: ①将来チームプランで Issue をチーム共有 ②main を汚さない（高頻度コミットしない）が適切な情報は残す ③decision.md の要否は後で判断 ④issue ごとに spec / PR(worktree)アクセス / 作業ログ / その issue 単体の意思決定ログが残れば良い。

- **issue 記録 = `spec` ＋ `log`（作業ログ＋意思決定ログを統合・人が読める）＋ `PR/branch link`（コード変更へのアクセス）**。
- **decision.md は必須から外す（optional・要否は後で判断）**。決定は log のエントリに畳む（DEC-011 の auto-decision は当面残すが、将来 log 統合 or 廃止を再判断）。
- **main 汚染対策**: 高頻度（毎イベント=implement/rerun/sync…）は main に出さない（ローカル `.continuum/`）。**低頻度の確定記録だけ**を残す（issue 1個＝数commit）。
- **共有は "ローカル作業 ⇄ 共有 SoR" の adapter**（runner 抽象化と同型）: 出力先を git / cloud / Notion 等に差し替え可能に。
  - **(短期/solo)**: ローカル `.continuum/` で個人が扱える（今）。git 昇格は必要時。
  - **(本命/team plan)**: 共有バックエンド（continuum cloud / Notion 等 = DEC-009 P3 / 旧 open-core cloud SoR）。**team plan 実装は後・必要な時**。
- **solo-first**: まず CEO 個人が扱える状態を優先。team 共有インフラは投機的に作らない。
- 現状の実装（全部 `.continuum/` ローカル）は solo には十分。docs/issues 昇格＋team backend は将来の adapter 実装で。

---

## OPEN-001 (2026-06-12) — merge 安全層（Issue branch の衝突対策）が未実装＝要対応

> CEO 懸念: 別路線(直接 main commit)と continuum の Issue branch が並行すると merge 時に衝突しないか / Issue が増えても安全に merge できるか。

- **現状の安全**: Accept=branch に commit のみ(main 不触, DEC-008/G1')・worktree 隔離・Discard 後始末。**Accept 自体は安全**。
- **欠けている安全層**: ①branch の "N commits behind main" 可視化 ②**Sync with main**(worktree で main を取り込み衝突を隔離内で解決) ③衝突チェック付き merge/PR ④運用規律(小さいIssue・早めmerge/discard・2路線で同一ファイル同時編集を避ける)。
- **生の例**: dogfood Issue「themeを増やす」と、直接 main に入れた Light/Dark が二重 → dogfood 実験 Issue(theme/shortcut/remove-setting)は Discard 推奨。
- **continuum 自己開発の当面ルール**: CoS(直接 main) と CEO(Issue branch) が同じファイルを同時に触らない / Issue branch は早めに merge or discard。
- **→ slice 4 圏で「merge 安全層」を実装**（Issue が大量化する前に）。

---

## DEC-013 (2026-06-12) — Preview = platform 別 pluggable runner / Tauri は「本物の窓」を目標

> dogfood で continuum 自身(Tauri)の Web プレビューが `__TAURI_INTERNALS__` undefined で落ちた。CEO: web 優先は維持しつつ continuum を continuum で改修したいので Tauri を先に対応。

- **ループは platform 非依存**（git＋agent）。platform 依存は **Design プレビュー面だけ** → **Preview Runner を platform 別に additive に足す**（web=iframe ✅ / tauri=本物の窓 ★ / electron / ios / android / fallback=diff+スクショ）。「Mac アプリ＝Tauri だけでない」のでパターン毎に runner 追加。
- **Tauri は iframe モックでなく本物の窓を spawn**：親(3210)と iframe(worktree port)が別オリジン→外からモック注入不可＋native は inert。忠実な preview＝`npm run tauri dev` を worktree で起動（native も実際に動く）。
- **(b) Tauri runner の工事**: ①`src-tauri/target` も clonefile（cargo 再ビルド回避）②dev ポートを worktree 用に上書き（continuum tauri.conf は 3210 ハードコード）③spawn/kill ライフサイクル＋Design は「別窓起動」status 表示 ④`src-tauri/` 有無で runner=tauri 判定。
- (a) 応急（web 層を Tauri 不在で degrade）は保険として後回し。mobile は web 実証＋需要後。
- 全文 = `playbook/strategy/2026-06-12_preview-runner-roadmap.md`。

---

## DEC-012 (2026-06-11) — ループは「一方通行」でなく「反復」: 作りながら仕様が磨かれる / 仕様も LLM と共同

> dogfood で CEO: 「Spec を書いてから実装、の一方向しかできないのが気になる。実際は作りながら仕様が磨かれる。仕様の検討も LLM と一緒にやりたい」。continuum の思想（ウォーターフォールでなく**反復ハーネス**）を UI に効かせる。

- **反復ループ**: 「Spec → Implement（一発）」でなく、**(AI支援で)Spec → Implement → Preview(視覚) → Spec を磨く → Re-implement → … → Accept** の**サイクル**。worktree/branch は採用まで持続し、spec・code・decision が**共進化**する。DEC-009 §3.1 の「順序強制しない」を実装で具現化。
- **視覚レビュー（Preview）**: コード diff でなく **worktree の dev server を起動して iframe で実物を見る**（designer/PM の review 方法）。Product Board の preview を前倒し。→ slice 2.5。
- **AI 共同の仕様検討（2-1）**: Spec を **LLM と一緒に探索・記述**（spec エディタ内 AI アシスト＋既存画面参照）。→ slice 3。
- スコープ: **slice 2.5 = Preview ＋ 反復 re-implement**（review↔refine サイクル）。**slice 3 = AI-assisted spec ＋ 画面参照**（2-1）。

---

## DEC-011 (2026-06-11) — Issue slot をスリム化: Design slot 廃止 / Decision は手書きでなく自動

> dogfood で CEO が「Design 用 md は要らないかも / Decision md も本当に要る？」と違和感。AI-native フローでは Design＝コード diff・Decision＝PR+Spec+diff から導出、で手書き slot はセレモニー過多。

- **Design slot 廃止**: デザイン意図は Spec に内包、出力は **PR（コード diff）そのもの**。別途 Design md は二重なので作らない（DEC-009 §3.1 の Design 種別は "コード=デザイン" に統合）。
- **Decision は手書き slot をやめ、自動 draft に**: merge 時に issue+spec+diff から自動生成（DEC-009 §3.5 の「自動下書き」を正とし、手で `+Decision` する導線は削除）。
- **結果、Issue = `issue.md`（何を/なぜ）＋ `spec.md`（要件・任意で画面参照）＋ 実装（branch/PR）＋（自動）`decision.md`**。slot UI は Spec 中心にスリム化。
- 根拠: continuum thesis「意図→AI実行→記録」。記録(Decision)は自動、デザインは実装に融合。slice 2（実装ループ）の中で確定。

---

## DEC-010 (2026-06-11) — エディタ engine 載せ替え: Plate → CodeMirror 6 Live Preview（Obsidian 型）

> dogfood 中、CEO が「Obsidian 体験＝普段はレンダ表示、編集しようとしたら md 記法で書ける」を要望。**DEC-006 の editor 選定（Plate）をこの部分だけ supersede**（Tauri/Web/xterm/Canvas 等 他は不変）。

- **決定**: ブロックエディタを **Plate（Slate・ノード木・round-trip）→ CodeMirror 6 の Live Preview（Obsidian 型）** に載せ替え。
- **技術的理由**: 「カーソルを当てた所だけ生記法 `**`/`#` が現れて編集」は **テキスト＋装飾デコレーション方式**でしか出せず、Plate（ノード木・`**` が存在しない）では構造上不可能。CodeMirror 6 は **Obsidian の中身そのもの**。
- **副次の大利点**: 正本＝**md テキスト**になるので、Plate のために抱えていた **round-trip / idempotency の複雑さ（`markdown.ts` の FROZEN 契約・`mdToPlate`/`plateToMd`/`classify`・raw vs plate 分岐）を丸ごと退役**できる。全 doc が編集可能（raw fallback 消滅）。我々の SoR（＝repo の md ファイル）に**むしろ素直に一致**。
- **コスト**: Plate 置換。Live Preview デコレーション実装は重め（**テーブル / code block の live 描画が最難**）。
- **転用/保持**: `splitFrontmatter`（frontmatter 分離）と save IF は維持（save は「テキストを書く」だけに単純化）。今日入れた `plate-render-kit` の**スタイル判断**は CM デコレーションへ概念移植（Plate プラグイン実体は退役）。
- **却下**: Plate のまま autoformat（記法入力ショートカット＝Notion風）。理由 = 「記法が**見える**」でなく「記法で**入力**」止まりで Obsidian と別物。

---

## DEC-009 (2026-06-11) — IA（メニュー）& Issue モデル確定（一人Designer+PdM / repo-output / 非stepperフォルダ規約）

> 現状プロダクト（IDE 風）への CEO 違和感を起点に「メニューから決める」要件定義を実施。Concept A（改善ループ軸）を採択し Issue モデルまで合意。
> 全文・図・Issue詳細レイアウト・データモデル素案 = `product/specs/2026-06-11_ia-and-issue-model.md`。DEC-008 の docs/ レイアウトを issue 中心に精緻化する。

- **メニュー（Concept A）**: `Product`（実画面 Board・ホーム）/ `Issues`（改善の spine・Spec 内包）/ `Decisions`（ADR 集約）/ `Repo` ＋ `Agent` 常駐ドロワー。**Specs は top nav に出さない**（Issue 内）/ Inbox・Today 入れない / Product は Board（タイル）。ターミナルは常駐ドロワーへ降格。
- **P1 一人 Designer+PdM 第一**: 主ユーザー = Designer+PdM 兼務の一人（=ペルソナ楔=CEO）。チーム協業機能は後回し（形だけ拡張可能に）。
- **P2 repo-output でエンジニア協業が無料**: continuum は「エンジニア用機能」を作らない。output=実 repo のコード+docs ＝ repo が統合面。下流（リリース品質）は既存 PR/git でエンジニアへ手渡し。**設計原則に格上げ**。
- **P3 SoR adapter（repo 既定 / Notion 後日）**: repo-files が canonical（agent ネイティブ読み・決定がコードと同 commit・drift harness の3強み）。Notion は後日の任意バックエンド/ミラー（正本化時は3強みを意識的に手放す）。**今は実装しない**。
- **P4 Issue が spine**: 旧「Improvements」→ **「Issues」改名**。全ては Issue 起点。**注釈は "起点" から "Issue 内で使う道具" に降格**。
- **P5 非 stepper = フォルダ規約 presence-driven**: Issue=フォルダ。slot（spec/design/decision…）が在れば表示・無ければ `+` で作る。順序強制なし（旧 Spec/Mock/QA/Build タブの waterfall 批判を踏まない）。status は軽い dropdown（open/in-progress/merged）。
- **データモデル確定（F1/F2/F3 + G1'/G2）**:
  - **採番=ULID**（F2・time-sortable/並行衝突なし・UIはタイトル表示）/ **issue.md を spec と別持ち**（F1）/ **design/ は必ずフォルダ**（F3）
  - **durable（PR経由で main へ）**: `docs/issues/<ulid>-<slug>/{issue.md, spec.md, design/, decision.md}`。**起票で main に直 push しない**＝ durable は実コード(src/…)と同じ reviewed PR で着地（レビュー/CI/branch protection を通る・why が what と同 commit）
  - **ephemeral（gitignore のローカル作業ストア）**: `.continuum/{drafts, issues/<ulid>/{status, annotations, worktree.json, thread}}`。**status は main に持たない**
  - **issue⇄PR（G2）**: branch 規約 `issue/<ulid>-slug` / durable リンクは issue.md frontmatter / volatile は .continuum worktree.json
  - **Issue一覧** = main の docs/issues/（共有）＋ local drafts（作業中）を UI 合流。**Decisions** = 全 decision.md 横断集約
  - **CTO 懸念で改訂**: 「main 直書き」は branch protection 破り/履歴汚染/status churn/PM状態とコード結合/monorepo競合 の問題 → durable=PR経由・ephemeral=local に分離して解消。**DEC-008 を精緻化**（.continuum=gitignore local / docs=issue中心 / durable=PR経由のみ）
- **既存差分**: Plate/terminal+handoff/Canvas iframe/fs は転用。ナビ刷新・file-tree起点廃止・terminal降格・Issues/Board/注釈/Decisions集約/git worktree(Rust)新規・Onlook除去(DEC-007)。

---

## DEC-008 (2026-06-11) — repo-as-SoR データモデル確定（docs/ 第一級 + .continuum/ 機械 / worktree / drift harness）

> 「実 repo に docs が溜まり、その上に見やすい UI を提供し、worktree で作業して生成物を repo に貯める」という CEO のメンタルモデルを、**共進化（オープンプロトコルで継ぐ）**の要請と整合させて確定。
> 全文・図・B監査・v0.5作業リスト = `playbook/strategy/2026-06-11_coevolution-positioning-and-repo-sor-model.md`。
> ⚠️ **DEC-009 で精緻化（こちらを正とする）**: docs は **issue 中心フォルダ**（`docs/issues/<ulid>/`）/ `.continuum` は **gitignore のローカル作業ストア**（repo内 machinery でない）/ durable は **main 直書きでなく PR 経由のみ**。下記の「flat な docs/specs+docs/decisions」「.continuum=repo内」は DEC-009 で上書き。

- **鉄則: continuum は DB を持たない。正本は repo の中の markdown/yaml（git）**。独自ストアに正本を置くと囲い込み＝共進化前提（誰でも読めるオープン出力）が壊れる。DEC-006「正本＝ファイル&Git」を継承。
- **フォルダ2階層**:
  - `docs/specs/*.md(x)` ＋ `docs/decisions/NNNN-*.md`（**ADR 慣習を product/design に拡張**・発明しない）＝**人間に意味がある第一級市民**
  - `.continuum/`（screens.json / annotations / links.json / handoff）＝**ツール固有の機械machinery（非正本）**
  - 根拠: **non-lock-in を構造で保証**（continuum を消しても docs/ が残る）。索引 = root `AGENTS.md`/`CLAUDE.md`
- **git 機構**: **worktree-per-change**（Superset 型隔離・複数並行）。**決定(why)とコード(what)を同じ commit/PR に載せる**（PR 本文＝決定SoRエントリ）。
- **drift harness**（melta `design:drift` 発想）: docs はループを通してしか変わらない＋docs↔コードの乖離を検出して**壊れて気づく**。これが「ハーネス駆動」の payoff＝docs を腐らせず生きた SoR に保つ。
- **traceability**: spec↔screen↔annotation↔decision を `.continuum/links.json` でリンク。UI 価値の核は「並べる」でなく「辿れる」。
- **共進化のコア価値**: 実行がコモディティ化する世界で、デザイナー&PM の **意図・判断・決定記憶** を握る層。機械との継ぎ目=オープンプロトコル(MCP/markdown/git)、人間との継ぎ目だけ独自UI。**価値 ∝ ループ回転速度**。持続性=ペルソナ楔(エンジニア中心agentが二級扱いするデザイナー&PM面)＋ベンダー横断(単一ベンダーが利益相反でやらない)。

---

## DEC-007 (2026-06-11) — Onlook 廃止 → 完全 LLM 駆動 + Annotation 入力（要素ピック + ペン）

> DEC-006 の「要素編集 Canvas = Onlook（v0.4）」を **supersede**。GUI 直接編集をやめ、UI 変更は完全に LLM 経由、入力は実プロダクト上の Annotation にする。
> 契機 = agentation（注釈→構造化コンテキスト ブリッジ）観測 + CEO の「自分で GUI 編集するのはもうやめる」表明。

- **決定**: **Onlook（GUI 直接編集・v0.4）を廃止**（`vendor/onlook/`・`editable-frame.tsx`・`element-inspector.tsx`・`onlook-edit.ts` を除去対象に）。UI 変更は**完全に LLM 経由**。
- **入力 = Annotation**:
  - **要素ピック注釈**（agentation 流）= セレクタ/DOM文脈/computed styles/近傍コンポーネント/スクショ切片
  - **ペン注釈**（agentation に無い差分）= 画面に直接描画→**マークアップ済みスクショを Claude マルチモーダルに渡す**
  - ソース特定は **LLM に grep させる**（Onlook の AST 書き戻し不要＝最大の技術負債を除去）
- **agentation/melta は競合でなく部品**: agentation=注釈→markdown で止まる（記録しない）/ melta=デザインシステム+harness。continuum は注釈を**入口 modality に過ぎない**ものとし、編集を実行し**決定SoRに刻む**（DEC-008 ループ）。
- **隠れた正解理由**: 手編集は docs を通らずコードだけ変わり即 drift する。**注釈→LLM は必ずループを通る＝drift を構造的に防ぐ**（DEC-008 §drift harness と整合）。
- **たじまの AI ツール（生成層）はドリフト監視対象**: βに応募して一次情報を取る（別カテゴリ＝0→1生成、我々は1→N改善）。

---

## DEC-006 (2026-06-08) — アーキ確定: Tauri v2 殻 + Web UI + Rust/Node ハイブリッドエンジン（OSS流用）

> DEC-002 のローカルエンジン + クラウド SoR 方針を、**具体的なランタイム/OSS構成**に落とす。「全部入り・OSS流用・ネイティブの軽さ」の3条件を同時に満たす構成として確定。
> 根拠: `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md` / 同日 `2026-06-08_oss-license-inventory.md`。

- **殻 = Tauri v2**（RAM ≈ Electron の 1/5 / 30-60MB）。摩擦が出たら **Electron へ退避可能**（UIはwebなので無傷）= 二段構え。**純ネイティブ Swift（cmux型）は不採用**（macOS限定 + web OSS 流用不可）。
- **UI = 単一 React/Web アプリ**。Tauri ウィンドウでもブラウザタブでも同一に動く（→「ブラウザ表示もできる」が無料で付く / Onlook が Electron→Web 移行したのと同じ思想）。
- **OSS マッピング**（全て permissive = fair-code 配布と両立、③で確認済）:
  - ブロックエディタ = **Plate（MIT）**。理由 = **MDX（markdown中にJSX）ネイティブ** → 「正本 .mdx + Spec/QA 用の独自ブロックを増やす」要件に直撃。BlockNote(MPL/一部GPL) / TipTap(コアMIT/一部有料) は次点。
  - 要素編集 Canvas（⑤）= **Onlook（Apache-2.0）**を組込/フォーク。**React+Tailwind に固定**（"任意フロント編集"は世界中未解決 → 捨てる。あなたの標準スタックそのもの）。AST 方式（コード→AST→スタイル注入→書戻し）。
  - ターミナル UI = **xterm.js（MIT）**。PTY/並走 = **Rust `portable-pty`（MIT）**（node-pty より速いネイティブ / Superset 型 worktree 隔離）。
  - Onlook の **AST round-trip エンジン（Node/Babel製）= Node サイドカー1個に隔離**（Tauri の唯一の摩擦点をここに封じ込め）。
- **正本(SoR)＝全てファイル & Git 管理**: Spec/Research/Decision = **.mdx + frontmatter** / QA = **.yaml** / Design = **scene-graph.json + 実コード**。❌ JSON/HTML を手編集の正本にしない（正本は常に「人間が手編集でき Git diff が出る」形式、ブロックUI/Canvasはその上のビュー）。
- **ビルド順序（全部やるが順番で破綻回避）**: v0.1 SoR+Plateエディタ（自分の sota-ai-ventures 運用を載せ替え dogfood）→ v0.2 埋込ターミナル+委譲 → v0.3 Canvas表示/触/一覧（spike資産）→ v0.4 要素編集（Onlook統合・Tauri唯一の難所はここまで来ない）。横断= designer-skill 拡張（research.md 等の skill+成果物を増やせる / Claude Code の skill・subagent 構造を借用）。
- **却下**: Electron 即採用（軽さを捨てる/退避先に留保）。BlockNote XL・cmux コード流用（GPL/AGPL = fair-code と非互換、cmux は参照のみ）。

---

## DEC-005 (2026-06-08) — 再開（RESUMED）+ 再定義: engine → 「プロダクト意思決定オーケストレーター + 設計記憶SoR」

> DEC-004（PAUSED）を解除。再開トリガー③（continuum 資産を別アングルで再利用したい）+ 新トリガー（自分用ツールとして作り切る意思）が成立。

- **決定**: continuum を **再開**。賭ける層を **engine（コモディティ化する側）→ レイヤC（設計/プロダクト意思決定の SoR・記憶 + ベンダー横断オーケストレーション）** に移す。
- **再評価の根拠（2つのイノベーター観測）**:
  - **Superset**: vendor-agnostic な複数コーディングエージェント指揮者として急伸。**ベンダーがネイティブ機能を出すほど束ねる対象＝燃料が増える**（DEC-004 の pause 理由のちょうど裏返し）。エンジンを自作せず上の調整層に立つのが勝ち筋。
  - **Claude デザイナーの働き方**（Meaghan Choi）: "designers ship code, engineers design" / pod = 5 AI Builder + 艦隊。価値は**働き方＝プロセス**側。ただし Anthropic は **Claude Design** を公式リリース済 = 生成エンジン層はネイティブが侵食中（engine を捨てる判断を補強）。
- **空白の確認**: コーディングagentオーケストレーション層（Superset/Conductor/Vibe Kanban/cmux…）は混雑＆無収益。生成エンジン層はネイティブ侵食。**「デザイン/プロダクトの意思決定（spec・採否・QA・ブランド整合・なぜ）をエージェント横断で貯める SoR」は誰も占有していない** = continuum の未検証 SoR層と一致。
- **Founder = First User の成立**: CEO は既に手作業で SoR層を運用（`decisions-log.md`/`approval-queue.md`/`session-handoff.md`/`memory`/仮想法人 Subagent）。MEMORY.md が Claude Code メモリ案の原型だったのと同型 → **製品化＝自分の運用の載せ替え**が最短 dogfood。
- **スコープ意思（CEO 明示）**: 「**基本的に自分用ツールにもなるから、しっかり作り切りたい**」= dogfood-first。WTP問題（デザイナー/PMはツールに金を払わない懸念）は OSS open-core + 自分用価値が先に立つので後回し可。
- **コア定義**: Superset が「**コード**を書く指揮者」なら、continuum は「**プロダクト/デザインの意思決定を束ねて貯める指揮者 + 台帳**」（Sierra「プロセスのSoR」の design/PM 版）。
- **最大の時限リスク**: Claude Code 等が「設計判断の恒久記録」をネイティブ統合した瞬間にレイヤCも侵食される。窓が開いている今のうち。→ 定期ウォッチを継続タスク化。

---

## DEC-004 (2026-06-05) — プロジェクト一旦停止（PAUSED）

- **決定**: continuum を **一旦停止**する。撤退でも放棄でもなく、いつでも再開可能な pause。
- **理由**: LLM/コーディングエージェント自体の進化が速く、**Codex が preview 機能を出した**。今日 de-risk した「楔のエンジン（既存repo→実部品でモック生成→render）」は、**エージェント側がネイティブに担い得る領域**（= DEC-002 §5 で名付けた「ハーネス競合リスク」が現実化しつつある）。最もコモディティ化しやすい部分を、技術不確実性を負って自前で建て続ける合理性が下がった。
- **今日 validated（◎）**: エンジンは実際に動く — extract(L1)/generate(鍵なし・自分のClaude Code)/実部品 render/auth壁を越える revertable shim。楔の技術リスクは消えた。
- **未 validated（×・本当の問い）**: **SoR層（maker ループの spec/decision/QA・チームの設計記憶・承認ゲート）に独立した需要・引きがあるか**。エンジンがエージェントに吸われるなら、製品を支えるのは SoR 層単独になり、その検証が未了のまま。
- **再開トリガー**: ① SoR/maker-loop 層に独立した需要があるという確信が立ったとき（顧客会話で）/ ② エージェントのコモディティ化の見え方が変わったとき / ③ 他の「固い問題」を SoA→SoR フレームで攻める素体として continuum 資産を再利用したくなったとき。
- **資産の状態**: コード（spike/ = 使い捨てエンジン, app/ = グレースケールUI・ダミーデータ）・全ドキュメント・DEC-001〜004 はそのまま保全。dev server 全停止・対象 repo git クリーン（痕跡ゼロ）。
- **姿勢**: 「ダメな仮説の上に建て続けない」= Anthropic Idea Stage の正解。code is not the asset — 今日蓄積した判断（DEC-002/003 と検証結果）が資産として残る。

---

## DEC-003 (2026-06-05) — preview は revertable shim で実 repo の壁を超える

> ISSUE-004 で判明：汎用 preview を実 repo に当てると **auth gate / provider / 複雑props** が必ず描画を止める。これを超える方針を確定。

- **決定**: continuum の local preview は、対象 repo に **管理された一時 "preview shim"**（auth bypass + provider wrap）を適用してよい。
- **安全制約（必須）**: ① **gitignore 必須・絶対にコミットしない** ② **終了/クラッシュ時に原子的に自動復元**（バックアップ→復元、中断耐性）③ opt-out 可 ④ 触るのは preview に必要な最小範囲のみ。
- **DEC-002 との整合**: shim はローカルで生成・即復元。**コードはクラウドに出ない**ポスチャーは不変（「read-only」ではなくなるが「revertable・local-only」は維持）。enterprise 向けには「厳格 read-only」モードも将来用意しうる。
- **却下**: 厳格 read-only（実 repo で render 率が伸びず「見える」が日常 repo で機能しない）/ repo 側に preview-mode 規約を常設（導入摩擦・他人の repo に効かない）。
- **実装**: ISSUE-005。

---

## DEC-002 (2026-06-05) — アーキ+収益転換: OSS open-core（ローカルエンジン + クラウドSoR）/ fair-code

> **DEC-001 のアーキ（ピュア Web SaaS）を supersede する。** プロダクト/楔/Sierraフレーム/ペルソナは不変。変わるのは実行レイヤーと配布/収益モデル。
> 評価・全文・却下代替案: `playbook/operations/2026-06-05_local-engine-architecture.md`。

- **収益モデル = OSS open-core（n8n型）**:
  - **無料**: ローカルエンジン（CLI daemon）+ ローカル単体の maker loop を OSS 公開。self-host/local は無料。ユーザーは自分の AI サブスク（Claude Code 等）で動かす。
  - **有料サブスク**: hosted クラウド SoR / リアルタイム共同編集 / チーム共有・managed / SSO・監査ログ・RBAC（enterprise）/ scene-graph 無制限版管理。
- **ライセンス = fair-code（n8n の Sustainable Use License 型）に確定**（CEO承認 2026-06-05）。ソース公開・self-host 自由・**continuum を SaaS として再販するのは禁止**（Elastic/Redis の罠を回避、moat 防衛）。純OSS(MIT)/BSL は却下。
- **アーキ = ローカルエンジン + クラウド SoR ハイブリッド**:
  - **ローカル（CLI daemon, npm）**: repo ingestion（L1 AST / L2 screenshot / L3 scene-graph生成）/ モック生成 / sandbox render / コーディングエージェント（Claude Code/Codex）への委譲（ユーザー自身の AI サブスクで実行）。クラウドへ送るのは scene-graph / spec テキスト / PNG のみ（ソースコードは出さない）。
  - **クラウド SoR（Supabase + Vercel）**: spec/decision/QA/design issue の永続、scene-graph 版管理、canvas（Liveblocks）、チーム共有・invite・課金。**これが moat の実体（Sierra プロセスのSoR）**。
- **技術linの根拠**: Claude **Agent SDK**（`@anthropic-ai/claude-agent-sdk`）で Claude Code のハーネスを埋め込み、SDK更新で新モデル/tool-useループ/MCP/hooks を自動継承（=「Modelを足すだけ」問題の解）。third-party は claude.ai ログインを代理提供できないが、local/OSS モデルではそれが前提なので制約にならない。Codex は等価SDKなし → Claude Code 先行、agent-agnostic 抽象化は後。
- **影響**: ISSUE-001 の「生成テスト=APIキー待ち」は**ユーザーの Claude Code サブスクで実行**に変更し解消。`spike/extract.mjs` を CLI に昇格（→ ISSUE-002）。enterprise security（コードがクラウドに出ない＋監査可能OSS）が差別化に。

---

## DEC-001 (2026-06-04) — continuum 設立・会社OS採択

- **プロダクト**: AI-native PdM+Design ツール。Spec→Design→Mock→QA を一人の maker が回す。Personal-first → dogfood → SaaS。
- **アーキ**: ピュア Web SaaS（Next.js/Vercel + Supabase + Claude API `@anthropic-ai/sdk`）。Day1 からマルチユーザー/チーム共有/課金前提。
- **楔**: 既存 repo → コンセプトモック（実パーツ流用 → Figma風canvas編集）。
- **コードネーム**: `continuum`。置き場所 `~/Workspaces/Personal/projects/continuum/`。
- **会社OS**: 本ディレクトリ構成 + エージェントチーム（COO + 専門家5 + ペルソナ4）を採択。
- **根拠**: 起ち上げプラン `~/.claude/plans/cuddly-cuddling-crane.md`、戦略 doc `playbook/strategy/2026-06-04_continuum-thesis-v1.md`。
