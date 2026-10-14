# Bezier ポジショニング — 「ツール」でなく「チームの場」になる

> 2026-07-15 ／ 発端: Herdr/Orca 等「個人の AI 開発ツール」爆発を見て、CEO が「我々（オンラインIDE＋チーム協働の場）はどう進化すべきか」を問うた。
> 関連: `strategy/2026-07-14_master-plan-cloud-studio.md`（背骨）／ `cloud-studio/2026-07-15_cto-architecture-decision.md`（技術決定・Supabase=SoR）
> 一行: **道具（Herdr/Orca/Claude Code）は持ち込み自由。Bezier は "チームの合意・記憶・承認" を持つ場になる。**

## 1. 構図 — ここで戦わない
Herdr / Orca / Cursor / Claude Code は全部「**個人の開発ループを速くするツール**」（ターミナル/デスクトップ・1人×N agent）。混雑・高速・大手。**この層で戦うと負ける、かつレイヤーが違う。**

背骨（master-plan）: **Building が 0 に近づくほど、ボトルネックは「実行」→「alignment（チームで何を作るか）」に移る。** ∴ **Herdr が個人を速くするほど、価値は上（チーム層）に押し上がる＝Herdr の進化は追い風。**

## 2. 進化の4方向（特に 2・3 を狙う）
1. **ツールでなく「場(space)」になる** — Herdr は個人が回す道具。Bezier はチームが集まる共有クラウド（presence・共同編集・共有文脈・監査）。"AI 開発版の Google Docs"。
2. **★ Herdr/Orca を"エンジン"として抱える（BYO tool）** — 各自が好きなツールを持ち込め、その diff/preview/spec が **チームの spec→review→PR→監査ループに流れ込む**。Bezier はエディタを作らず、"どんな道具の成果もこの場に流れ込む配管"を作る。
3. **★ チームの資産を持つ（＝コピーできない堀）** — spec（合意した意図）・review（人の収束）・監査（誰が/何を/なぜ）・共有コンテキスト（うちのやり方）。個人ツールは stateless で持てない。**Supabase=SoR に溜まる org 文脈がスイッチングコスト。**
4. **ガバナンスの追い風** — AI が速い＝コード多い・人の目減る＝レビュー/監査需要 増。JP-HITL/監査ポジションが Herdr が速いほど relevant に。

## 3. 例え（非エンジニア向け）
- **Herdr =「天才の外注さん」**: 何でも爆速で作るが、終わると全部忘れ、あなたの会社を知らない。取り替え可能。
- **Bezier =「会社の脳・オフィス」**: 何を決めたか・誰が承認したか・うちのやり方を覚えている。取り替え不能＝堀。
- **BYO tool = Google Docs**: 端末やキーボードを問わず、みんなが集まる1枚を提供する。
- **一番大事な一文**: *Herdr はあなたのボタンやエディタを一晩でコピーできる。でもチームが2年かけて溜めた spec・決定・履歴はコピーできない（あなたの "データ×時間" だから）。*

## 4. GitHub の位置づけ — 競合でなく "別の正本"。併存が正解
**GitHub = コードの正本＋リリース配管**（git 履歴・CI/Actions・PR マージ・タグ）。誰も離れられない。触らない。
**Bezier = 意図・決定・監査の正本＋リアルタイム協働**（spec・レビュー・presence・"なぜ"の記憶）。GitHub が弱い層。

= **別々のものの "正本" が2つ**: GitHub は「コードが何か」、Bezier は「何を決めた・なぜ・誰が承認したか」。

**橋渡し＝PR（握手）**: Bezier の空間で agent が作業 → **PR として GitHub に提案** → **人が GitHub でマージ**（リリース/マージの門は GitHub のまま）。master-plan「DB 正本・git read-only・agent は PR」と一致。
- 併存が**強み**: ①乗り換え不要（GitHub 残す＝採用の恐怖が下がる・`git pull` で元に戻せる可逆性）②GitHub が難しく退屈な部分（ホスティング/CI/リリース/セキュリティ）を無料で担う③**PR の境界＝HITL 承認ゲート**（制約でなくガバナンス機能）。
- **やらない**: "より良い GitHub"（コードホスティング/CI）は作らない。勝てないし不要。
- Bezier が持つのは GitHub が弱い層: **意図(spec)のリアルタイム共同編集・presence・"なぜ"・道具横断の調整・決定/監査の蓄積記憶**（GitHub Issues/Discussions は非同期・コード中心でここは薄い）。

## 5. プロダクトとして作る/作らない
- **作る**: ①共有スペース（presence/共同編集/preview）②どんな道具の成果も流れ込む spec→review→PR→監査の配管 ③溜まる正本＝Supabase（spec版・決定・監査）
- **作らない/借りる**: エディタ核（CodeMirror→将来 Monaco・借）／AI エンジン（Herdr/Orca/Claude Code＝持ち込み）／コード正本・リリース（GitHub）

## 6. 弱点・要検証（§0）
1. **チームの痛みが薄い可能性** — 各自 Herdr＋Slack/GitHub で足りるかも。→ mikan/Sotas dogfood で「その場が本当に要るか」を作る前に検証。
2. **個人ツール/GitHub が collab を吸収しうる** — Orca は SSH/multi-agent を追加済み、GitHub も Copilot Workspace 等。→ moat を UX でなく **データ(蓄積する org 文脈・監査)＝スイッチングコスト**に置く（本メモ §3）。**道具横断(BYO)** は Copilot を推す GitHub がやりにくい差分。
3. **"ツールの上の場"は薄くなりがち** — 固い資産(Supabase の SoR)を最初に握らないと commodity 化。∴ 次の一手は「home を Supabase で実アプリ化」＝正本を握りにいく。
