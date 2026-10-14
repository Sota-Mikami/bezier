# Cloud Studio — マスタープラン（思想・戦略・実行計画）

> **作成日**: 2026-07-14 ／ **ステータス**: 実行計画・CEO レビュー待ち
> **2026-07-15 更新**: 製品定義を「汎用クラウドIDE」→「**チーム制作室(team studio)**」に改訂（§10・`core/memories/decisions.md` D13-D15／詳細 `cloud-studio/2026-07-15_positioning-consult.md`）。§9 の 07-14「プロダクト定義／設計方向」2項は §10 で supersede。
> **一行**: studio-skills（既存・MIT）と LightSprint の思想を土台に、**spec 駆動・alignment 先行・クラウド共有**の開発体験をプロダクト化する。**まず mikan / Sotas で実現**し、日本語コミュニティを moat にする。
> **supersedes**: `2026-07-14_pivot-to-team-sync-thesis.md`（moat 分析は生きているが、GTM は "enterprise 営業" から "コミュニティ主導" へ更新）
> **supporting**: 市場/競合 evidence `../research/2026-07-14_competitive-and-jp-enterprise-scan.md`

---

## 1. 思想（背骨）— LightSprint 4記事 + shared-skills + software-factory の統合
**「Building が 0 に近づくと、全部が spec を中心に再編される」**
1. ボトルネックが 実行 → **alignment** に移る（"作れるか" でなく "何を作るか"）
2. **spec が中心の成果物**になる（diff/ticket/Figma でなく）→ 投資は上流の spec 精度へ
3. レビューが 事後(diff 行単位) → **事前(コード前に plan で合意)**
4. **GitHub が unbundle**（storage/PR/review/CI/issues が spec 中心に再編。issues=作業が起きる場所 / storage=クラウド共有 / CI=継続ビルド+live preview）
5. 役割が **"the new product builder"(PdM/designer/hybrid)** に収束。engineer は「唯一実装できる人」→「チーム全体が安全に高品質実装できるようにする人」
6. ∴ **クラウド＋共有コンテキストが必須**（各自 agent だとチームで考える力が侵食される。shared skills＝知識が組織を渡り複利する）

## 2. あなたの立ち位置（差別化＝競争でなく "自分の色"）
- **実践者の声** — n=1 で回してる PdM/デザイナー。マニフェストのほつれ（下記）を実体験ベースで書ける。
- **JP-HITL / 監査寄り** — 「2人レビューを消せ」の逆。日本は人のレビュー・監査証跡を増やしたい → **agent-native だが人が収束する日本流**。studio DOCTRINE は既にゲート/HITL 過多＝JP には feature。
- **オープン & agent 非依存** — studio-skills は MIT・素の markdown。LightSprint の閉じたクラウドの「開いた対」。
- **マニフェストのほつれ2つ（差別化コンテンツの種）**: (a)「agent が one-shot できる spec」は書くのが重い＝難しさは消えず上流に移動するだけ／(b) spec 精度は要件変化・edge case で目減りする。

## 3. 戦略モード
- **コミュニティ主導**: オープン方法論 ＋ 日本語コンテンツ → コミュニティ → （必要なら）商用。dev tool の実証済みプレイブック。
- **LightSprint とは競争しない**: 彼らが市場を作る。技術は思い切り真似てよい。差分は **セールス/DevRel/日本コミュニティ**。
- **モード（D2 確定）**: **商用を目指す（段階ラダー）** — 個人 repo で確認 → mikan/Sotas で試す → 他社に導入実験 → 商用化。business-selection §6 の通り、各段の gate で「収益化の道筋」を具体化していく。コミュニティ/コンテンツはその全段を貫く獲得エンジン。

## 4. プロダクト概念（スコープ）
**クラウド完結の studio** — repo を読んでクラウドに載せ、そこで spec 駆動の studio フロー（P0-P6）を回し、**エージェントもクラウドで動く**。共同編集・プレビュー・コメント→修正・PR まで。ローカルには `git pull` でいつでも戻せる（可逆）。
**まず自分の repo（mikan / Sotas）** に絞る＝環境再現の壁を "他社 Sales" の段まで先送り。

## 5. アーキテクチャ（buy / build）— 技術調査に基づく
| コンポーネント | 方針 | 採用 |
|---|---|---|
| クラウド sandbox（repo+dev+agent 実行） | **Buy** | E2B（Firecracker・Enterprise は BYOC/on-prem 可） |
| エージェントループ | **Build(薄)** | Claude API(@anthropic-ai/sdk) が **studio-skills の markdown をそのまま実行** |
| 協働ドキュメント編集 | **Buy** | BlockNote + Liveblocks Yjs（既存スタック） |
| コメント収集→agent | **Buy+Build(薄)** | Liveblocks Comments 3.0 → Supabase Edge Function webhook → Claude |
| ライブプレビュー | **Buy** | sandbox のポート公開 |
| 多人数で観察/介入 | **Buy（後）** | sshx / VNC |
| 監査証跡 / run records | **Build** | 実行ログを永続化（JP ガバナンスの feature） |
| **doc ⇔ repo ファイル同期** | **Build（唯一の難所・後回し可）** | DB を正本・git は read-only・agent の変更は PR で提案→人がマージ（＝DOCTRINE の HITL と一致） |

## 6. 実行計画（value 先・自分の repo スコープ・難所は後回し）

### Phase 0 — 価値 spike ※ **skip（D3）**
「コメント→良い修正」は既に**実運用で検証済み**（人の input が甘い時は skill 側で AI にヒアリングさせて精度を上げる設計で確認済み）。かつ alignment 重視の思想では「コメントはちゃんと書く」前提 → 独立検証は不要。

### Phase 1 — 薄いクラウドループ（1 repo・数週間）※**現在ここ**
- **目的**: **個人 repo `Sota-Mikami/prototypes`（D1）** で、repo 取り込み〜studio ループがクラウドで回る（ローカル不要・git pull で戻せる）。実験場 = `Personal/projects/cloud-studio/`。
- **分解（риск順）**: **M1** sandbox が clone→install→dev→**preview URL**（agent 無し・最初の未知）／ **M2** sandbox 内 Claude API agent ループが studio skill 実行→1変更→preview 反映／ **M3** commit→**PR**。（Liveblocks コメント=P1.1・薄い UI=P1.2 は後）
- **IN**: E2B sandbox / Claude API agent ループ（studio-skills の markdown をそのまま実行）/ preview URL / PR 出力 / run record。
- **OUT（後回し）**: 協働 spec 編集(doc⇔file 同期) / 複数 repo・マルチテナント / 任意 repo の環境再現 / 端末観察 UI / Liveblocks コメント(P1.1) / 課金。
- **ゲート**: `prototypes` の実変更が本ループで PR まで到達する。

### Phase 2 — 協働の深さ + 監査 + 2組織目（数週間）
- 追加: 協働 spec 編集（BlockNote+Liveblocks Yjs / 同期は DB-正本・PR-HITL）／監査証跡の充実／多人数の観察・介入（sshx or UI）／mikan・Sotas **両方**で運用。
- **ゲート**: 両組織で実 issue を回せる。監査＋HITL レビューが堅牢（JP-ready 姿勢）。

### Phase 3 — 一般化 + コミュニティ/商用
- 自分以外の repo の環境再現（採用の壁）／方法論の一部 OSS 化／**日本語コンテンツ・コミュニティを本格化** → 必要なら商用（SIer チャネル / コミュニティ→顧客）。dogfood 実証を gate に。

### 並行スレッド — コンテンツ/コミュニティ（P0 から）
- **背骨①〜⑥＋実践者のほつれ**を日本語で連載（build-in-public）。コミュニティ moat は年単位で複利＝**今日から始める**。コスト低・待つ理由なし。

## 7. リスクと緩和（§0）
1. **コメント→指示の品質**（生命線）→ P0 spike で先に潰す。
2. **継続/焦点**（コミュニティ+製品は長期・あなたは多プロジェクト）→ P1 を小さく・dogfood 駆動・コンテンツは軽く複利。
3. **doc⇔file 同期の複雑さ** → P2 まで先送り、DB-正本+PR-HITL で割り切り。
4. **環境再現の long-tail** → 自分の repo に絞り P3 まで先送り。
5. **sandbox コスト** → dogfood 規模では小・P3 で監視。
6. **モード曖昧（信念 vs 商用）** → CEO が明示。計画は両対応、商用判断は P3 で gate。

## 8. 確定した判断（2026-07-14・CEO）
- **(D1) ✅ 対象 repo = `Sota-Mikami/prototypes`（個人）** — mikan/Sotas でなく、まず環境を完全制御できる個人 repo で「repo 取り込み〜クラウドで回るか」を実験。
- **(D2) ✅ モード = 商用を目指す（段階ラダー）** — 個人 repo で確認 → mikan/Sotas で試す → 他社に導入実験 → 商用化。
- **(D3) ✅ P0 skip** — 「コメント→良い修正」は実運用で検証済み（input が甘い時は skill が AI ヒアリングで補完／alignment 思想はコメント精度を前提）。

## 9. 次アクション（P1・実験場 `Personal/projects/cloud-studio/`）
- **M1 ✅ 達成（2026-07-14）**: E2B sandbox が `Sota-Mikami/prototypes` を clone→install→**next build**→静的 serve→**preview が 200**。クラウド完結ループ実証。
  - 学び: default sandbox=512MB で Next build が OOM → **RAM 2GB のカスタムテンプレ `cloud-studio-node`（node:20）** で解消／prototypes は `output:'export'` ＝ `next start` 不可、`out/` を `serve` 配信／op は自動シェルで通らず **`.env`(gitignore) 経由**で回す／**preview を人に見せるには sandbox を実行スクリプトから切り離して"置き去り生存"させる**（kill しない・serve に長 timeout＝既定 60s だと落ちる）＝ `serve-preview.mjs`。
  - 目視確認済み（2026-07-14）: `_template` の Cafe Explorer 画面がクラウド preview で描画・人が開いて操作できた。
  - ナビ検証で判明した製品論点: (a) **preview 寿命**＝sandbox 15分で消滅→レビュー中ずっと生かす/再起動が要る（ロードマップ）／(b) **配信忠実度**＝repo は nginx `try_files $uri $uri.html /index.html` で配信、serve とほぼ等価だが deploy に合わせる方針／(c) `/cafe` は client-side 例外（アプリ側の実バグ・nginx でも出る）→ **M2 のデモ題材**（エージェントに console 読ませて修正）。
- **M2 ✅ 達成（2026-07-14）**: sandbox 内で Claude API(Opus 4.8) の manual agent ループ（tools: bash/read_file/write_file）が `_template` の hero 見出しを編集→ rebuild→ **build 成果物に反映**を自動検証。`spike/agent-loop.mjs`。
  - 学び: 検証は client-render 画面を curl-HTML で見ると false FAIL → **source と build 成果物(out/)を grep**で判定／`e2b commands.run` は非ゼロ exit で throw → catch して `e.result` を返す／エージェントに「編集後に自己 grep 確認しろ」を指示すると堅い。
- **M3（次）**: sandbox から commit→PR（gh in sandbox）。
- **M2.1（デモ）**: `/cafe` の実 client-side バグをエージェントに直させる（browser 検証込み）。
- **反復基盤**: `.env` ＋ テンプレ済み → 私のシェルから `node --env-file=.env <script>.mjs` で自走（op 不要・M1=run-cloud-loop / preview=serve-preview / M2=agent-loop）。
- **P1.1 ✅ 達成（2026-07-14・本命コラボ層）**:
  - P1.1.0: 複数レビューコメント→エージェントが全部反映→ preview（`comments-loop.mjs`）。
  - P1.1.1a: インタラクティブ console 化＝ウォーム sandbox ＋ iframe ＋ コメント ＋ Apply（`console-server.mjs`）。
  - P1.1.1b ✅: **Liveblocks 真マルチプレイヤー**（共有コメント LiveList・presence・複数タブ同期）→ Apply で全員のコメントをエージェント反映。**CEO の本物の雑な日本語レビュー2件（Compare右Drawer削除・Budgetチップ削除）で閉じた**＝「messy コメント→良い修正」の核が実証。
- **⇒ 技術リスクは "作れるか" を脱した。次フェーズ＝プロダクト UI 設計。**
- **プロダクト定義の確定（2026-07-14・CEO 訂正）**: cloud-studio ＝ **汎用の「クラウド開発 IDE」**。肝3つ = ①AI Agent をクラウドで動かす ②issue ごとに preview 環境 ③ファイル（特に md）をオンライン共同編集。**studio-skills はプロダクトに埋め込まない**（配布はするかも・開発プロセスは各社が設計）。エージェントは **BYO（実 CLI: Claude Code/Codex 等を sandbox で走らせ terminal ストリーム／ユーザーの API キー）**。ローカルの skills 等もクラウドに持ち込む。
- **設計方向 確定（2026-07-14・CEO 承認「方向これで良い」）**: **オンライン IDE（Orca 風 ADE）** — タブ式・左に task=worktree（agent 状態ドット）・右アクティビティバー4パネル(Explorer/Agent/Source Control/**Check=CI結果→エージェント差し戻し**)・editor｜preview 分割＋terminal・パネル自由配置。**差別化 vs Orca = ①クラウド（Orca はデスクトップ）②リアルタイム human 共同編集＋presence（Orca は 1人×N エージェント型で human 共同編集なし）**。エージェント切替はドロップダウン廃止→「新タブで選ぶ or terminal で起動」。モック: `cloud-studio/design/2026-07-14_online-ide-mockup.html`（初版3ペイン=`..._issue-workspace-mockup.html`）。Orca 調査: `bezier/playbook/research/`（未保存なら別途）。
- **次**: 残り画面設計（board/home・run records・ship・agent 起動フロー・empty/error）→ 実装（console を IDE に置換・same-origin proxy でピン留め・ホスティング）→ mikan/Sotas dogfood(P2)。並行でコミュニティ/コンテンツ。

## 10. プロダクト定義 改訂（2026-07-15・CEO 相談で収束）— §9 の 07-14「汎用IDE」を supersede

- **重心 = 「チーム制作室(team studio)」。オンライン IDE ではない**（decisions **D13**）。ローカル(個人の深い開発)と GitHub(コード正本)は残し、その上に「**合意 → agent委任 → preview → みんなで直す → 承認・監査**」の *チームで作る瞬間* だけを載せる（併存。"全部 Bezier に持ってこい" ではない）。狙う位置=「速くチームで作るなら絶対 Bezier」。moat=協働(Liveblocks)＋JP-HITL/監査。
- **編集の境界**（decisions **D14**）: 全ファイル同時編集可。ただしオンラインのコード編集は "軽微修正まで"、ローカル並みの賢さ(補完/エラー検出/大改修)は追わない。非エンジニアの主動線は「agent に頼む→preview」、直接編集は静かなオプション。→ 副作用: 重いエディタ(Monaco)は不要かも（07-15 ADR の Monaco parity は "追わない" に傾く）。
- **呼称 = Bezier**（decisions **D15**）。cloud-studio は P1 実験場の working name。
- **superseded**: §9 の「プロダクト定義の確定（2026-07-14）＝汎用クラウドIDE」「設計方向 確定（2026-07-14）＝オンラインIDE(Orca風ADE)」。肝3つ(①クラウドagent ②issue別preview ③md共同編集)と「エンジニア=レビューで立ち寄る」は生きる。"IDE" という枠と「BYO 全振り」は撤回（agent は基本 Bezier が動かす＝監査・コスト観測のため）。
- **詳細**: `cloud-studio/2026-07-15_positioning-consult.md`（立ち位置の地図・3ギア・wedge・弱点・マネタイズ方向）。
