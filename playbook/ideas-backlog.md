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
  - Before/After の視覚比較。
  - **プレビュー上を直接クリックしてコメント（Figma comment 風ピン）→ Agent にフィードバック**。
  - チャットを生 terminal でなく綺麗な composer（吹き出し＋ `/`コマンド＋ `@`コンテキスト= @spec/@screen/@file）に。terminal は「詳細表示」で展開。
- **位置づけ**: 「Design Agent 用 IDE/Orchestrator」を名乗れるかの分水嶺。

---

## C. IDE 的な速度（idea・後で）

- **コマンドパレット（⌘K）**: 任意の issue/repo へジャンプ＋アクション実行。現状 ⌘N のみ。
- **スプリットビュー（2 issue 並べる）**: Zenbu スクショの形。並行 Agent と相性◎（左で A・右で B を同時に見る）。

## D. 品質・アウトカムのループ（idea・後で）

- **チェックポイント**: worktree 内のスナップショット/ロールバック。今は Discard（全消し）のみ。途中地点に戻せると安心して任せられる。
- **共有プレビューリンク**: デザイナーが PdM/クライアントに「これどう？」を共有する導線。アウトカムを外に出す。

---

## 更新履歴
- 2026-06-12: 初版。IDE/Agent オーケストレータのキャッチアップを受けた CEO 議論から B（着手予定）/ C / D を記録。A（Agent Inbox＋通知）は実装へ（DEC-028 予定）。
