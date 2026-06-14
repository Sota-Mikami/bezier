<!-- 作成日: 2026-06-12 / Owner: COO -->
# Bezier — アイデア backlog（未着手・将来検討）

決定（decisions-log.md）とは別に、「やりたい/やるかも」を温める場所。CEO が後で見返す。

---

## B. Designer/PdM ネイティブな Review（moat・**Phase 1 着手＝DEC-045**）

> CEO:「元々やりたいと思っていた」。**最優先の差別化投資**。**2026-06-12 にプレビュー注釈→Agent修正の Phase 1 を実装（DEC-045）**。残: ペン矩形リージョン / before-after / 要素ピックの精密セレクタ。

- **参照プロダクト**: https://www.agentation.com/ （Agent の作業を visual に review/annotate する体験）
- **CEO 構想**: agentation 的な体験 ＋ **Figma の Comment のような体験**。プレビュー上の任意の場所にピンを刺してコメント → それが Agent へのフィードバックになる。
- **狙い**: デザイナー/PdM は unified diff を読まない。レビューを **視覚（レンダリング結果）起点** にする。
  - Design タブをデフォルト&主役へ（terminal/diff は上級者向けに格下げ）。
  - ~~Before/After の視覚比較 / IDE タイル比較~~ → 実装→**撤回・保留（DEC-086）**。CEO は非エンジニアで「動くものを触る」志向、比較は今は不要（要るとしても **Preview のみ・軽量**）。**先回りで作らない**。再要望時に Preview 限定で。
  - **プレビュー上を直接クリックしてコメント（Figma comment 風ピン）→ Agent にフィードバック**。
  - チャットを生 terminal でなく綺麗な composer（吹き出し＋ `/`コマンド＋ `@`コンテキスト= @spec/@screen/@file）に。terminal は「詳細表示」で展開。
- **位置づけ**: 「Design Agent 用 IDE/Orchestrator」を名乗れるかの分水嶺。

---

## C. IDE 的な速度（idea・後で）

- ~~**コマンドパレット（⌘K）**: 任意の issue/repo へジャンプ＋アクション実行~~ → **実装＝DEC-082（2026-06-14）**。残: fuzzy ランキング・全 repo 横断 Issue 検索・アクション拡充。
- **スプリットビュー（2 issue 並べる）**: Zenbu スクショの形。並行 Agent と相性◎（左で A・右で B を同時に見る）。← §C 残

## D. 品質・アウトカムのループ（idea・後で）

- **チェックポイント**: worktree 内のスナップショット/ロールバック。~~今は Discard（全消し）のみ~~ → **手動 MVP 実装＝DEC-080（2026-06-14）**。残: 自動（毎ターン前）＋ squash on merge / 保存時ラベル / 間 diff。
- **共有プレビューリンク**: デザイナーが PdM/クライアントに「これどう？」を共有する導線。アウトカムを外に出す。
  - **2026-06-14 判断＝後回し**。接地: Design 別案は self-contained HTML（file 共有は容易）、Preview は localhost dev サーバ（外部公開は不可）。**「外から開ける公開リンク」はホスティングのバックエンド連携が要る大物**。CEO「**本物のホスティングを設けることになり、この機能を使うなら有料課金が必要、という形になりそう**」→ **open-core の収益機能候補**（無料＝ローカル export / 有料＝ホスト共有リンク。[[DEC-002]] open-core と整合）。実装は SaaS 期に。当面の安価な代替（self-contained HTML export / スクショ）は必要になったら。

---

## E. Skills / Agents マーケットプレイス・配布（idea・GTM 候補 / 2026-06-13）

> CEO:「このツールを使うにあたって、**skills のマケプレというか配布する仕組み**って結構便利かつ喜ばれると思ってる。マーケにもいきそう。skills とか agent とかもかな。**より良いデザインや実装を作ったり拡張したりするための skills/agent を配布する**施策」。

- **核**: Bezier 上で動く **skills / subagents / agent 設定** を、ユーザー間で **配布・インストール・共有できる仕組み**（マーケットプレイス／パック／レジストリ）。「より良いデザイン・実装を作る」「Bezier を拡張する」ためのノウハウをパッケージとして流通させる。
- **なぜ刺さるか**:
  - **便利＆喜ばれる**: 良い skill / agent を自作する手間を、入れるだけに変える。即戦力化。
  - **マーケ/GTM になる**: 配布物そのものが入口（「この design-review skill いいよ」→ Bezier を触る動機）。コンテンツ＝獲得チャネル。バイラル性。
- **既存資産と直結（重要）**: Bezier は **ユーザー自身の repo の中でユーザー自身のエージェントに委譲**するため、`CLAUDE.md`/`AGENTS.md`/`design.md`/custom skills/subagents/MCP/memory が **そのまま土台として継承される**（→ [[bezier-inherits-repo-conventions-moat]] / DEC-050）。マーケプレ＝**この"継承される土台"を共有可能にする**こと。Clarify/Design(別案)/Build/Verify の各段で効く skill を配れる（例: 「DS 監査 skill」「Verify 採点を厳しくする skill」「特定フレームワークの Build agent」）。
- **戦略フレームとの整合**:
  - Sierra ロックイン① **ドメイン知識の深さ** / ③ **ワークフローによるロックイン** を、**コミュニティ供給**で増幅（自前で全部作らない）。
  - open-core（DEC-002・fair-code）と相性: 無料配布のOSS skill ＋ 有料 curated パック/private レジストリ/チーム配布、という課金面も置ける。
- **想定フォーム（要検討）**: ① DS 接地の "design pack"（skill＋テンプレ）② agent テンプレ（特定スタックの Build/Verify 用）③ インストール導線（repo の `.claude/` に入れる or Bezier 内カタログ）④ キュレーション/署名/安全性（任意コード実行のレビュー）⑤ 無料 vs 有料・公式 vs コミュニティ。
- **未決**: いつやるか（dogfood の core が固まってから）。まずは「自分用に作った skill を別 repo へ持ち回る」最小の配布から芽が出せるか。
  - **着手済**: コマンドの **UI マネージャ＝DEC-078**（編集/追加/削除）、**export/import パック＝DEC-081**（JSON 1ファイルで持ち回り/共有）。「最小の配布」の芽は出た。残: URL/レジストリ取得・署名/安全性・有料 curated・skill/subagent もパック対象に。

---

## 更新履歴
- 2026-06-12: 初版。IDE/Agent オーケストレータのキャッチアップを受けた CEO 議論から B（着手予定）/ C / D を記録。A（Agent Inbox＋通知）は実装へ（DEC-028 予定）。
- 2026-06-13: **E. Skills/Agents マーケットプレイス・配布** を追加（CEO idea・GTM 候補）。repo 継承 moat（DEC-050）の延長＝"継承される土台を共有可能にする"施策として位置づけ。
