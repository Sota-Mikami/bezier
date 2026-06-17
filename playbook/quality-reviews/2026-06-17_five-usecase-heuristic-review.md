<!-- 作成日: 2026-06-17 / Owner: UX Researcher + COO -->
# 5ユースケース総合ヒューリスティック分析 — 優先度順の課題と解決案

> **依頼（CEO）**: 現在のペルソナにあらゆる箇所を触ってもらい、5ユースケースでヒューリスティック分析。課題を優先度順に並べ、解決策案を添えて提案。
> **手法**: 各ユースケースを最適ペルソナに割り当て、**実コードを読んで根拠づけ**ながら in-character ウォークスルー（並行5体）。
> - ① LLM 制作 = Mai（solo-maker） / ② 自己レビュー・注釈 = Leo（design-engineer） / ③ 共有 = Kenji（pm-cant-design） / ④ ハンドオフ再評価 = Daniel（handoff-engineer） / ⑤ 複数 Issue 管理 = Tom（agency-designer）
> **状態**: prod app `/Applications/Bezier.app`（16:56 ビルド）に反映済み・git 未コミット（branch `feat/2026-06-15/docs-view-and-quality`）。

---

## 0. 横断インサイト（半分の課題はこの2つの根に集約される）

### A. 「重要な操作が無言で起きる」（5UC 全てに散在・体験を最も損なう）
- エージェント完了の通知なし（①）/ Re-run が会話文脈を無言で消す（①）/ node_modules コピー・autoConfigure・ビルドが無言（①③）/ デザインFB送信が waiting 中エージェントを無言 kill（①②）/ プレビュー LRU eviction が無言（⑤）/ 別repo選択でアクティブrepoが無言切替（⑤）。
- **共通解の型**: 「結果が重い操作は、進行・完了・破壊を必ず可視化し、不可逆は確認を挟む」。通知・進捗行・確認ダイアログの3点セットを横展開すれば多数が一気に解消。

### B. 「完了・承認の偽シグナル」（品質を core 価値にするツールとして最も危険）
- 注釈の「done」が「直った」を意味しない（②）/ QA 未実行でも共有・ハンドオフで「テスト済」に見える（③）/ 受入基準が空でも merge/PR できる（①④）/ mock/local env で「承認」される（④）。
- **共通解の型**: 「緑/済/承認は、人またはエビデンスが裏付けるまで出さない」。未検証は明示的に未検証と見せる。

---

## 1. 優先度順の課題と解決案

### 🔴 P0 — 確実なバグ／自分たちの決定との矛盾（すぐ直す・安い）

| # | 課題（UC・実証） | 解決案 |
|---|---|---|
| 1 | **Journey 共有 URL が毎回変わる**（③ BLOCKER・実証: `use-journey.ts:212` は `--prod`/`--project` 無しで deploy しハッシュURLを掴む）。再共有で旧リンクが陳腐化→ステークホルダーが古い内容を誤レビュー。合意形成が断絶 | app publish と同じく **`--prod --project <id-lowercase>`** で deploy し、**安定 alias `<id>.vercel.app`** を返す（`stableAppAlias` と同型）。1リンクが常に最新を指す |
| 2 | **phantom handoff pointer**（④ NEW-BLOCKER・DEC-117 のリグレッション）: `writeHandoffBundle`/commit が best-effort try/catch で無言失敗しうるのに、`buildPrBody` は**無条件で** `docs/handoff/<id>.md` を指す→存在しないファイルへのポインタ | bundle を**commit できた時だけ**ポインタを書く（成否を openPR で受けて分岐）。失敗時は maker に明示。commit メッセージも `WIP: before PR` に巻き込まれないよう保証 |
| 3 | **Re-run が会話文脈を無言で消す**（① BLOCKER: `handleRerun` は `--continue` 無し）。修正サイクルで「なぜそうなった」が追えない | **soft re-run（`--continue`・既定）/ hard re-run（完全リセット・明示確認）** を分離 |

### 🟠 P1 — 横断テーマA「無言の重要操作」

| # | 課題（UC） | 解決案 |
|---|---|---|
| 4 | **エージェント完了通知が無い**（①）。ターミナル凝視が必要、並行作業で見逃す | agentState が waiting/exited に遷移で**アプリ内通知＋macOS通知**（既存3秒ポーリングをトリガーに） |
| 5 | **進行中アクションが無言**: node_modules コピー進捗ゼロ（①）/ autoConfigure・self-heal リトライが不透明（③）/ **ビルド中ログ非表示**（③） | 各フェーズに進捗行（開始・件数・完了）。`building` 中もログ末尾を薄く表示。リトライは「再試行中(2回目)」を明示 |
| 6 | **デザインFB送信が waiting 中エージェントを無言 kill**（①②: `sendDesignFeedback`→`ptyKillKey` 確認なし） | `agentState==="waiting"` 時は「進行中の対話を中断して送信？」の確認 |
| 7 | **プレビュー LRU eviction が無言**（⑤）。別Issueを開くと裏のプレビューが無通知で停止＝A社デモ中にA社プレビューが消える | eviction 前に該当行へ警告、停止後はインジケータ即時更新（poll 依存をやめる） |
| 8 | **別repo選択でアクティブrepoが無言切替**（⑤ BLOCKER: `selectIssue`→`switchTo`）。A を見ながら B を触れない | `selectIssue` と `switchTo` を分離 or「別repoのIssueです・切替えますか」を明示。理想は cross-repo で現状ビュー維持 |

### 🟠 P1 — 横断テーマB「完了・承認の偽シグナル」

| # | 課題（UC） | 解決案 |
|---|---|---|
| 9 | **注釈の「done」が「直った」を意味しない**（②）。ターン完了でバッチ全注釈が一斉に緑＝見落としも緑 | `done_unverified` を導入し、ユーザーが After 確認で OK するまで緑にしない |
| 10 | **受入基準が空でも merge/PR できる**（①④: `mergeToMain`/`openPR` にゲートなし） | merge/Open PR のプリフライトで空なら**ソフトゲート**（「受入基準がありません。続けますか？」1クリック） |
| 11 | **QA 未実行でも共有/ハンドオフで「済」に見える**（③: `seedQaFromSpec` フォールバック） | 全行 unrun 時は共有ページに「QA 未実行」バナー、handoff にも明示 |
| 12 | **mock/local env で承認**（④・handoff に警告は出した残り） | 「本番で要検証」を spec の受入基準から**具体項目化**（認証/権限境界/エラー系）。未 publish 時の env 不明も警告強化 |

### 🟡 P2 — スケール／throughput（複数 Issue 管理・使うほど効く）⑤中心

| # | 課題 | 解決案 |
|---|---|---|
| 13 | サイドバーで**パイプライン状態が分からない**（PR済/レビュー待ち/merged）。`prUrl`/`IssueStatus` はあるのに非表示 | Issue 行に PR アイコン（`prUrl`時）＋ステータスラベルを追加 |
| 14 | **ステータス/ラベルで絞れない**（フロントマターに labels はある） | 検索に `status:` `label:` フィルタ追加（データ工事不要） |
| 15 | **merged が一覧に残りノイズ化** | repoグループに「完了を隠す(N)」トグル or アーカイブ折り畳み |
| 16 | **Untitled 量産で取り違え**（作成直後は全件 Untitled、自動タイトルは spec H1 後） | 作成時にタイトル入力 or 作成直後の行をハイライト。repoチップを強調 |

### ⚪ P3 — 精度・ポリッシュ

- **element 注釈ツールが UI に無い**（②: 型/`describe()` は実装済だが Toolbar に未露出）→ 最も精度の高い注釈手段を出す。
- **checkpoint `(auto) HH:MM` が無意味**（①）→「ターンN: src/billing +3 -1」等の diff コンテキスト付与。
- **pen ストロークに個別テキストを付けられない**（②）→ pen でも Composer を開く。
- **READY_TIMEOUT 150s 無言待機**（①）→ 30s で「まだ起動中」ヒント、150s でエラー。設定可能化。
- **パスワード確認欄なし**（③）/ **サンドボックス iframe で interactive ワイヤーが死ぬ**（③ `sandbox=""`）/ **共有 lead に文脈が無い**（③）/ **frameBlocked の理由非表示**（①）/ **codex picker 常時表示**（①）/ **Enter 即送信**（①）/ Composer モバイルクリップ（②）/ ソート固定・⌘N が常にアクティブrepo（⑤）。

---

## 2. 推奨アクション
- **まず P0（3件）** を直す＝確実なバグ/自分たちの決定との矛盾、安価。特に #1（共有URL安定化）と #2（phantom pointer）は今セッションの成果（DEC-114/117）の穴埋め。
- 次に **P1 を横断テーマ単位で**：A「無言操作」→通知・進捗・確認の3点セットを横展開、B「偽シグナル」→緑/済/承認の裏付け強制。
- P2 は dogfood が複数 Issue 規模になった時点で効く。P3 は随時。

---

## 3. 各ペルソナ生ログ（要点）
- Mai（①）: 「インフラは整っているが人間が迷子になる点が放置」＝完了通知/再実行/コピー待ち/checkpoint 名。
- Leo（②）: element ツール非露出、done≠修正済み、注釈のターン追跡なし、pen 個別指示不可。
- Kenji（③）: **共有URLが毎回変わる**、共有前プレビュー不在、PW確認なし、進捗不透明、QA偽済み。
- Daniel（④）: DEC-117 で6 blocker は **PARTIAL に前進**するも、**phantom pointer（新規）**・Open PR 必須化されず・受入空ゲートなし・spec 二重化 drift が残る。
- Tom（⑤）: repo 無言切替、Untitled 取り違え、パイプライン状態が一覧に出ない、eviction 無言、フィルタ/アーカイブ不在。
