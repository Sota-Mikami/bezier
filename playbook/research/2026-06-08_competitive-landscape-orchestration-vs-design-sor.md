<!-- 作成日: 2026-06-08 / Owner: CEO + Claude / continuum 再評価リサーチ -->
# continuum 再評価 — 競合地図: オーケストレーション層 vs デザイン/プロダクト意思決定SoR層

> **背景**: continuum は 2026-06-05 に PAUSED（DEC-004）。理由 = 楔のエンジン（既存repo→実部品でモック生成→render）が **コーディングエージェントにネイティブ吸収される**（Codex が preview を出した = ハーネス競合リスクの現実化）。
> **再評価のきっかけ（CEO, 2026-06-08）**: 2つのイノベーターの動き — ① **Superset**（vendor-agnostic な複数エージェント・オーケストレーター、急伸）② **Claude デザイナーの働き方**（Meaghan Choi / Dive Club, "designers ship code"）。
> **CEO 追加意思**: 「**基本的にこれは自分用のツールにもなるから、しっかり作り切りたい**」= Founder = First User / dogfood-first を明示。

---

## 1. 2つの示唆が指す同一の結論

> **価値は「エンジン（生成・モデル）」から逃げ続ける。留まるのは (A) 全エンジンの上に立つ中立な調整層、(B) 働き方＝プロセス/設計記憶の層。**

- **Superset の教訓**: エンジンを一切自作せず、Claude Code/Codex/Cursor/Gemini を git worktree で並列に束ねる「指揮者」に陣取る。ベンダーがネイティブ機能を出すほど **束ねる対象が増える＝燃料**になる。continuum が pause した理由のちょうど裏返しの設計。
- **Claude デザイナーの教訓**: "designers ship code, engineers design" / pod = 5 AI Builder + エージェント艦隊。価値は**新しい働き方そのもの**。ただし Anthropic は **Claude Design**（2026-04, claude.ai/design）を公式リリース済 = プロト生成→handoff の「エンジン」は本家がネイティブ提供開始。

→ continuum の pause は正しかった（エンジン層に賭けていた）。だが2つの動きは、**未検証で残した SoR層こそ価値の在処**だと外部から裏書きしている。

---

## 2. 競合地図

### レイヤA: コーディングエージェント・オーケストレーション（= 混雑、ほぼ赤の海）

| ツール | 形態 | 特徴 |
|---|---|---|
| **Superset.sh** | デスクトップ / OSS / **未資金調達**（SF, 2026設立） | 「Code Editor for AI Agents」。100+ 並列、git worktree 隔離、vendor-agnostic（Claude Code/Codex/Cursor/Copilot/Gemini）。注目で伸びているが収益化は未証明（OSS無料） |
| **Conductor**（conductor.build 他） | 複数同名あり | 並列エージェント実行 |
| **Vibe Kanban** | OSS | エージェントをカンバンで管理 |
| **Crystal / Nimbalyst** | — | 並列オーケストレーション |
| **Claude Squad / Emdash / Baton / Agent Kanban / oh-my-claudecode / Superpowers** | OSS 中心 | いずれも**コード**生成エージェントの並走管理 |

**観察**: この層は「ボトルネック = 複数エージェントの協調」という同一テーゼで**急速にコモディティ化＋混雑**。OSS無料が標準で、**収益化の道筋が全員不透明**。ここに新規で入るのは continuum の pause 理由（コモディティ化）を繰り返すだけ。

### レイヤB: デザイン/プロト生成エンジン（= ネイティブが上から侵食）

| プレイヤー | 動き |
|---|---|
| **Claude Design**（Anthropic） | 自然言語→マルチページ・プロト/スライド/LP、Claude Code に handoff bundle |
| **v0 / Lovable / Bolt** | 白紙からの生成（continuum の「文脈生成」が差別化軸だった相手） |
| **Codex preview** | エージェントがネイティブに preview を担い始め（DEC-004 のトリガー） |

**観察**: continuum の楔（既存repo→実部品で文脈生成）は技術的に実証済（ISSUE-002〜005 PASS）だが、**この層自体がネイティブ機能に飲まれつつある**。エンジン単体での事業化は非推奨のまま。

### レイヤC: 設計/プロダクト意思決定の SoR・記憶（= 空白が残っている）★

| 兆候 | 出典 |
|---|---|
| ADR（Architecture Decision Record）＋AI = 「決定台帳を AI が即答」が2026の新価値。「同じ議論の再来コストが消える」 | zenn ADR記事 / Mem ADR guide |
| Claude Code は Plan mode / Agent Teams / persistent memory を吸収したが、**「設計判断を構造化して恒久記録する」部分はまだ統合されていない** | SDD fatigue 記事 |
| **Spec Kit Agents**（arxiv 2604.05278）= orchestrator(状態機械) + PM agent(要件明確化) + dev agent + **人間の承認チェックポイント**。学術だが「PM主導オーケストレーション + 承認ゲート」型の存在証明 | arxiv |
| Mem0 の4スコープ記憶（user/agent/session/org）= **org_id 共有組織コンテキスト**が production gap | mem0.ai |

**観察**: コーディングの ADR/メモリは語られ始めたが、**「デザイン/プロダクトの意思決定（spec・採否・QA・ブランド整合）を、どのエージェントを使っても一箇所に貯める SoR」は誰も占有していない**。ここが continuum の未検証 SoR層と一致する空白。

---

## 3. continuum の再ポジショニング案

| 旧 continuum（PAUSED） | 再定義（landscape を踏まえ） |
|---|---|
| 自作エンジンでモック生成（レイヤB） | エンジンは Claude Code/Codex/Claude Design に**委譲**（Agent SDK で実証済 = DEC-002） |
| 1人 maker の Spec→Design→QA ループ | **maker ループ（intent→spec→design→qa→build）を任意エージェント横断でオーケストレーション + 承認ゲート + 設計判断の SoR/記憶**（レイヤC） |
| 楔 = 「v0 への文脈生成」 | 楔 = **「チームの設計判断・承認・記憶が、どのエージェントを使っても一箇所に貯まるプロセスSoR」**（Sierra「プロセスのSoR」の design/PM 版） |

**Superset との棲み分け**: Superset = **コード**を書く複数エージェントの指揮者。continuum 空白 = **プロダクト/デザインの意思決定**（spec・採否・QA・ブランド整合・なぜそうしたか）を横断で束ねる指揮者 + 台帳。

---

## 4. Founder = First User の事実確認（dogfood の現実性）

CEO は既に **手作業で continuum の SoR層を運用している**:
- `sota-ai-ventures/playbook/decisions-log.md`（DEC-001〜）= 意思決定台帳
- `approval-queue.md` = 承認ゲート
- `*_session-handoff.md` / `memory/MEMORY.md` = プロセス記憶
- 仮想法人（COO + 専門家 + ペルソナ Subagent）= maker ループのオーケストレーション

→ **MEMORY.md が Claude Code メモリ案のプロトタイプだったのと同型**。continuum の SoR層は「CEO が毎日手で回している運用」の製品化＝最短の dogfood。indie-solo doc の成功要因 #1（Founder=First User）に完全合致。

---

## 5. 正直な逆風（固い問題フレーム）

1. **買い手の WTP**: デザイナー/PM ツールは「あったら便利」帯に落ちやすい（saas-challengers メモ「SMB PdM はツールに金を払わない」）。→ **自分用ツール＋OSS open-core なら WTP 問題を後回しにできる**（dogfood で価値が先に立つ）。
2. **レイヤA は混雑＆無収益**: ここには入らない。レイヤC の空白に絞る。
3. **ネイティブ追撃**: Claude Code が「設計判断の恒久記録」をいつ統合するかが最大の時限リスク。今はまだ未統合 = 窓は開いている（Bret Taylor「機会の窓は期限付き」）。
4. **Goal 整合**: Goal1/Goal2 と別の第三の道。リソース原則（独立2027-08、復帰後 週10-15h）と要調整。**自分用ツール定義なら「自分の生産性投資」として正当化しやすい**。

---

## 6. 推奨ネクスト（CEO 判断待ち）

dogfood-first を前提に、段階を分ける:

- **A. 再定義 thesis を1本書く（DEC化）** — engine→「ベンダー横断のプロダクト意思決定オーケストレーター + 設計記憶SoR」。レイヤC 占有を明文化。
- **B. 自分用 v0 を最小で作り切る** — まず CEO 自身の sota-ai-ventures 運用（decisions-log/approval-queue/handoff/memory）を continuum app に載せ替え、毎日使う。エンジンは Claude Code 委譲（既存 spike 資産流用）。
- **C. 窓の監視** — Claude Code の「設計判断記録」ネイティブ統合の有無を定期ウォッチ（時限リスク）。

---

## 出典
- Superset: https://superset.sh/ , https://github.com/superset-sh/superset , https://yuv.ai/blog/superset
- Claude designer: https://www.youtube.com/watch?v=hKeDfupbA4U , https://creatoreconomy.so/p/full-tutorial-from-design-to-code-with-claude-code-meaghan-choi
- Claude Design: https://www.anthropic.com/news/claude-design-anthropic-labs
- Orchestration landscape: https://www.augmentcode.com/tools/open-source-agent-orchestrators , https://agentconn.com/blog/best-ai-agent-orchestration-tools-2026/ , https://www.appintent.com/software/ai/agentic-orchestration/
- Decision SoR / memory: https://zenn.dev/kosk_t/articles/adr-lightweight-decision-records-for-ai , https://mem0.ai/blog/state-of-ai-agent-memory-2026 , arxiv 2604.05278 (Spec Kit Agents)
