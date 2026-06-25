<!-- 作成日: 2026-06-25 / エンジニア向け AI Agent Orchestrator の訴求リサーチ -->
# エンジニア向け AI Agent Orchestrator はどう売っているか（2025–2026）

> 目的: Bezier を「**Superset/cmux のような orchestrator をデザイナー向けに再設計したもの**」として売るため、
> 既存エンジニア向け orchestrator の **打ち出し方（コピー・トロープ）** を現物で押さえ、デザイナー向けに翻訳する。
> 出典: 各社 LP / GitHub / docs の直接取得（2026-06）。引用は verbatim。

---

## 1. 各社の hero コピー（verbatim 抜粋）

| ツール | hero / 位置づけ | 主要バリュープロップの言い回し |
|---|---|---|
| **Superset** (superset.sh) | "The Code Editor for AI Agents." / "Orchestrate 100+ coding agents in parallel." / GH: "Run an army of Claude Code, Codex…" | run multiple simultaneously / isolate each task in its own git worktree / monitor from one place + get notified / built-in diff viewer / one-click handoff |
| **Conductor** (conductor.build) | "Run parallel coding agents on your Mac." | "Create parallel … agents in isolated workspaces. See at a glance what they're working on, then review and merge their changes." |
| **Sculptor** (Imbue) | "the missing UI for parallel coding agents." | run agents in parallel / "spin up the moment you think of something" / safe containers (vs worktrees) / instantly test / merge without conflicts |
| **Crystal→Nimbalyst** | "Run multiple Codex/Claude Code sessions in parallel git worktrees." | **test, compare approaches** / worktree isolation / stream edits / "Approve, reject, edit, iterate" |
| **cmux** | "The terminal built for multitasking…" | vertical tabs / **notification rings: panes light up when agents need attention** / programmable |
| **Vibe Kanban**（sunsetting） | "Get 10X more out of Claude Code, Codex or any coding agent." | plan(kanban) / run in workspaces / **review diffs + inline comments** / preview app / switch 10+ agents / PR & merge |
| **Cursor** | "your coding agent for building ambitious software." / "Delegate implementation to focus on higher-level direction." | hand off tasks / works autonomously, runs in parallel / cloud agents in isolated VMs / "for you to review" |
| **Devin** (Cognition) | "the AI software engineer." | "Assign a **fleet of agents** to migrate all repos in parallel" / "**army of Devins**" / organize diffs for review / tribal knowledge |
| **Factory.ai** (Droids) | "Build Your Software Factory." / "One prompt to PR." | delegate / adjustable autonomy / "review every modification" / background while you move on / thousands in parallel |
| **Claude Code** (Anthropic) | "Meet Claude Code." | "10s to 100s of parallel subagents, **checking its work before anything reaches you**" / **Agent view: dispatch & manage many sessions from one screen**（Needs input / Working / Completed）/ team lead・teammates・mailbox / worktrees |
| 他 | Jules「Autonomous Coding Agent」/ Codex「Delegate to Codex in the cloud」/ GitHub Agent HQ「mission control… orchestrate a fleet」/ AgentsRoom「Running agents in parallel is chaos → one screen」/ Tembo「Assign a ticket. Get it done. At 3am. While you sleep.」 | |

> ⚠️ category の churn 注意: Terragon=shutdown / Crystal=Nimbalyst へ rebrand / Vibe Kanban=sunsetting。打ち出しは似通うが生存は別。

---

## 2. 共通トロープ（普遍度順）

1. **並列／大量に同時に**（≈100%）— カテゴリの定義そのもの。"in parallel" "simultaneously" "100s" "army" "fleet"。
2. **最後は人間がレビュー→merge**（≈95%）— diff を見て approve/reject→PR。"review and merge" "inline comments" "checking its work before it reaches you"。
3. **隔離＝安全プリミティブ**（≈90%）— git worktree / 安全コンテナ。"agents don't interfere" "edits don't collide" "machine stays safe"。
4. **一画面で全部見える**（≈85%）— "one screen" "mission control" "see at a glance" "get notified when they need attention"。
5. **エージェント中立／any agent**（≈75%）— モデル戦争の上に立つ中立レイヤー。"no vendor lock-in"。
6. **委任／放置（while you sleep）**（≈70%）— "delegate" "fire-and-forget" "At 3am"。
7. **チーム/スケールの比喩**（≈65%）— fleet / army / squad / team lead+teammates / Droids / Conductor。
8. **必要な時だけ呼ばれる**（≈50%）— "panes light up" "Needs input"。

**売っている約束（JTBD）**
- 実利: 「**1個ずつ待つのをやめ、並列で N 倍。ぶつからない。レビューで主導権は保つ**」。
- 情緒: **chaos → calm command**。「忙しい機械の、落ち着いたオペレーター」になれる＝**主導権を失わずレバレッジ**。

**売っている自己像シフト（最重要・最も移植可能）**
- **coder/typist → orchestrator/director/reviewer**。価値が *キーストローク* から *判断・方向づけ・taste* へ。
  - Cursor「focus on making decisions / higher-level direction」/ Devin「army を率いる」/ Factory「Software Factory のオペレーター」。

---

## 3. カテゴリの盲点（＝Bezier が取れる whitespace）

- **成果物が常に *コード(PR)*、*動く体験* ではない。** 成功＝merged diff であって、クリックできる物ではない（Devin の Visual QA が稀な例外）。
- **レビューが *差分を読む* 前提。** = 全コントロールループが「ユーザーはコードを読める」を仮定 → **デザイナー/PM 最大の障壁**。
- **git リテラシー前提**（worktree/branch/merge/PR を無説明で使う）。
- **terminal/IDE が住処**。
- **「何を作るか／ユーザーに正しいか」は scope 外。** 実行スループットの最適化であって、課題定義・デザイン判断は扱わない。
- **ステークホルダー／デザインレビューの概念がない。** エンジニア同士のレビュー前提。

---

## 4. デザイナー向けへの翻訳（リポジショニングは「2語の差し替え」）

> 一手 = **①働きの単位**（diff/PR/code → **画面/フロー/プロト**）と **②レビューの所作**（読む/merge → **クリック/注釈**）を差し替える。文体（短い断定＋並列語＋制御語）は踏襲。

| エンジニアのトロープ | なぜデザイナーに効かない | デザイナー・ネイティブ置換 |
|---|---|---|
| Review the diff | コード差分を読まない | **動いてる画面をレビュー**（クリックして触る・Figma 的に注釈・ズレてるピクセルを指す） |
| Merge to main / open a PR | git が脳内モデルにない | **Ship / 共有リンクを publish**（成果＝クリックできるプロト） |
| git worktree / sandbox | jargon | **アイデアごとに専用の live preview**／「選ぶまで各案は分かれたまま」 |
| It compiles / runs commands | 証明にならない | **もう動いてる・スマホで開ける**（成果＝体験） |
| fleet / army / swarm | craft 層に off-tone | **studio of agents / your design team / 3案を並列で**（協働的・軍隊的でない） |
| terminal / CLI / keyboard | 住処が違う | **canvas / board / preview ファースト**（Linear 的に静かだが視覚的） |
| checking its work | コード正しさ | **意図／デザインシステムに照らして画面を確認** |

**そのまま使えるトロープ**: 並列（「3案同時に」はデザイナーの native desire＝variants/divergent。Discovery の "必ず3案" と一致）/ 一画面で俯瞰（=live preview のボード）/ 通知 / 自己像シフト（**pixel-pusher → director** はエンジニアより刺さる、craft の天井がこれまで手作業速度だったから）。

---

## 5. ヘッドライン候補（同ジャンル・同ボイス／名前比喩なし）

**自己像シフト系（Cursor/Factory 的）**
- "From pixel-pusher to product director."
- "You don't write code. You direct the product." / 「コードは書かない。プロダクトを指揮する。」
- "The orchestrator for people who design products, not codebases."
- 「つくる人から、導く人へ。」

**差別化＝動く画面でレビュー系（whitespace）**
- "Review the running screen, not the diff." / 「差分じゃなく、動く画面でレビュー。」
- "From mockups to a running app — review by clicking, not reading code."
- "Describe the experience. We'll have it running for you to react to."

**並列・calm-from-chaos 系（Conductor/AgentsRoom 的）**
- "Run three product directions in parallel. Keep the one that feels right." / 「3つの案を同時に。気に入った1つを残す。」
- "Every idea, running, on one screen." / 「アイデアを並列で、一画面に。」
- "You direct. The agents build. You review the running screen."

---

## 6. Bezier の実機が裏づける点（誇張なしに言える）
- **並行 issue＝並行 worktree・隔離**（`product/specs/2026-06-11_ia-and-issue-model.md` §3.7 / J3）→「並列」「隔離で安全」OK
- **Product Board（タイル＋状態）**（同 spec §新規UI）→「一画面で俯瞰」OK
- **N-max プレビュー同時起動上限**（DEC-040）→「複数を同時に動かす」OK
- **エージェント完了/共有 ready/プレビュー起動でデスクトップ通知**（README）→「必要な時だけ呼ばれる」OK
- **注釈（要素ピック＋ペン）でレビュー**（README / spec）→「差分でなく動く画面でレビュー」OK
- **共有リンク（Design/Preview/QA）・clean PR・main 無汚染**（README）→「Ship/共有」「安全」OK
