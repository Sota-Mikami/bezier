<!-- 作成日: 2026-06-04 / Owner: COO -->
# Bezier — 決定ログ（DEC-###）

CEO が承認・決定した不可逆な事項を記録する。**二度聞かない。** 新しい決定は最上部に追記（逆時系列）。

---

## DEC-093 (2026-06-14) — 共有 Preview は viewer インストール不要＝拡散ループ（Made with Bezier バッジ / white-label 課金）

> CEO「Preview を見てもらうのに Mac App を入れさせるのは良くない。シンプルな URL で開けて、その URL が拡散ツールになって Bezier 自体への興味→install/利用開始に誘導できると最高」。[[DEC-092]] の GTM 面を明文化。詳細＝[[2026-06-14_preview-saas-scope]] §5.5。

- **設計事実（既に満たす）**: viewer は **ブラウザで URL を開くだけ**。Mac App が要るのは maker 側のみ＝local-first の必然（worktree dev server/agent/build は手元）。**非対称は狙い**＝見る=摩擦ゼロで拡散／install=起こしたい転換（viewer→maker）。Figma/Loom/Notion と同じ PLG 構造。
- **拡散ループ**: 共有 preview に **「Made with Bezier」バッジ → CTA → landing（UTM 計測）**。**open-core 整合＝無料はバッジ付き（拡散税）／有料でバッジ消去（white-label）**（[[2026-06-05_monetization-open-core]]）。viewer のコメント/注釈 → maker の agent に fix 還流（moat 連結）。
- **フェーズ**: Phase 1/2（自分 infra）＝served ページに安価なバッジ注入で拡散成立／ Phase 3（SaaS）＝フル Bezier viewer ページ（chrome＋CTA＋コメント＋計測ファネル＋white-label）で productize。
- **計測**: バッジ CTA の UTM→landing→install のファネルを Phase 1 から仕込む（拡散ループの唯一の signal）。

## DEC-092 (2026-06-14) — Preview SaaS 化のスコープ確定（live→publish／自分 infra 先／アクセス制御 L1→password→CF Access）

> CEO「SaaS 化を進める。**Preview が一番価値が高い（特に僕にとって）**。設計・ヒアリング・技術調査・選定・開発計画を」。ヒアリング＋Principal Engineer 技術調査を統合。詳細＝[[2026-06-14_preview-saas-scope]]。

- **狙い**: Preview を「外から開ける URL」に＝① CEO 自身の dogfood 価値（人に見せる）即上げ、② ペルソナ churn「作ったものを外に出せない」を塞ぐ、③ open-core の最初の課金面（[[ideas-backlog]] §D）を立てる、の3点が一点で重なる楔。
- **ヒアリング結論**: ① 最優先＝**クライアント/経営に成果提示**（非同期・固定 URL が本命）／ ② 形＝**両方（普段ライブ→「公開」で固定）**＝ live→publish の additive 実装／ ③ ホスト＝**まず自分の infra → Bezier ホスト型 SaaS は後**。
- **技術選定（自分 infra に載せる）**: ライブ＝`cloudflared` トンネル（初手 trycloudflare → 安定版は CEO の CF zone で Named Tunnel `*.preview.duong-sm.com`）／ 公開＝`next export`→ CEO の S3+CloudFront、SSR は Dockerfile→Coolify／ メタは Supabase `preview_links`。**コードはクラウドに出さない（[[DEC-002]] 整合）**。
- **auth を2層に分離**: **(a) アプリ自身のログイン**＝**dev/demo クレデンシャルで解決**（バイパスしない＝Vercel/Netlify preview と同型。shim 不要）。**(b) プレビュー到達制御**＝Figma/Notion/Google 準拠の **WHO（L0公開→L1リンク→L2ドメイン→L3招待）× HOW（無し/パスワード/サインイン）**。L1・パスワードは自分 infra で trivial、**L2/L3 は Cloudflare Access（CEO の CF アカウント・~50人無料）で“自分 infra のまま”到達**、productized ネイティブ版は Phase 3。
- **フェーズ**: Phase 0 de-risk スパイク（S0-a 静的build／S0-b トンネル越し dev ログイン）→ Phase 1 ライブ共有（L1）→ Phase 2「公開」固定（L1＋password＋期限・**CEO の #1 価値**）→ Phase 2.5 CF Access（L2/L3・需要次第）→ Phase 3 SaaS（Bezier ホスト＋課金 gate）。
- **正直な留保**: #1 を真に満たすのは Phase 2。R1(auth) は dev クレデンシャルで格下げ済、残る分岐は static↔SSR（=R2 build 再現性）。当面 CEO 自身/受託 repo に限定、任意 repo は Phase 3。
- **次**: Phase 0 スパイクを着工前に実行 → 結果で build/auth を確定 → Head of Product が Phase 1 PRD 起票。

## DEC-091 (2026-06-14) — 無題 issue の folder/branch 名から「-untitled」を消す（ULID のみ）

> CEO「branch（`issue/<ulid>-untitled`）とパス（`.bezier/drafts/<ulid>-untitled/spec.md`）の untitled、ULID だけで良い。要は untitled って表示にならないように」。チャットfirst で issue は基本無題作成→ slug は常に "untitled" でノイズ。

- **方針**: slug が空なら `-<slug>` を付けない。`slugify` は空タイトルで **`""`** を返す（従来 "untitled"）。新ヘルパ **`issueFolderName(id, slug)` = `slug ? id-slug : id`** を folder/branch 名の全箇所に適用。
  - 新規（無題）→ `<ulid>` フォルダ / `issue/<ulid>` branch（**untitled なし**）。タイトル付きで作成→ `<ulid>-slug`（稀）。
  - **後方互換**: 既存 issue は slug "untitled"（旧フォルダから parse）を持つので `issueFolderName` で従来名のまま＝壊れない。`splitFolderName` は dash 無しを `{id, slug:""}` で処理済み。
- **適用**: `createIssue` / `moveIssueToRepo` / `trashIssue` / restore / purge / `branchName`。`slugify` は createIssue のみで使用＝安全。
- **スコープ**: 前向きの修正。**既存の "-untitled" issue はそのまま**（フォルダ＋branch＋worktree の改名は risk 大なので migrate しない。テスト issue は discard で OK）。`page.tsx` 等で title 表示の「Untitled」は別物・維持（無題のプレースホルダとして妥当）。
- **配管（Rust 変更なし）**: `issues.ts` のみ。tsc 0・eslint 0。

## DEC-090 (2026-06-14) — 小粒の磨き込み（バッチ）

> CEO「小粒の磨き込み、ぜひ」。本番反映（DEC-087/088/089 を /Applications へ）後、bounded な改善をまとめて。

- **① ⌘K を全 repo 横断 Issue 検索に**（DEC-082 後続）: パレットを開いたとき **`recents` 全 repo の `listIssues`** を読み、各 Issue を `{issue, repoPath, repoName}` でタグ付け。選択時に **repo が違えば `switchTo` してから遷移**。Issue 行に repo 名を hint 表示。`command-palette.tsx`。
- **② 自動チェックポイントの on/off 設定**（DEC-087 後続）: `Settings.autoCheckpoint`（既定 on）を追加（`settings.tsx` interface/default/coerce）。session の `autoCheckpoint` が `getSettings().autoCheckpoint` を見て早期 return。設定画面に「チェックポイント」セクション（オン/オフ）。オフ時は手動「いまを保存」のみ。
- **本番反映**: DEC-087/088/089 を /Applications へ（13:40 ビルド）。DEC-090 はその後。
- **未着手（CEO に確認してから）**: Issue 行メニューの拡充（Finder/IDE/複製/別repo移動＝何が要るか要確認）／ 残り `title`→Tooltip（小粒・任意）／ ⌘K の fuzzy ランキング。

## DEC-089 (2026-06-14) — サイドバー: repo 行から「+」撤去・「…」を見出し行へ・Issue 行に「…」メニュー追加

> CEO「ここの UX 変えよう。Plus は不要。… の icon button は folder 名の高さに合わせて（toggle の上部に）。＋ Sidebar の Issue に hover で … を出して、削除など Issue 単体のアクションをサイドバーからもできるように」。

- **バグ（位置）**: repo の hover アクション（`+` と `…`）が `absolute … top-1/2 -translate-y-1/2`＝**RepoGroup 全体（見出し＋Issue 一覧）の中央**に配置され、**一覧の真ん中に浮いていた**。
- **修正**:
  - **`+`（その repo に新規 Issue）を撤去**（新規は `…` メニュー内の「新規 Issue」と、DEC-084 のヘッダ経路で足りる）。
  - **`…` を見出し行の高さに**（`top-1/2 -translate-y-1/2` → `top-1`）。folder 名（toggle）と同じ高さに揃う。
  - **Issue 行に hover の `…` メニューを新設**（`group/issue`）: いまは **削除（ゴミ箱へ）**。Issue 行を `<button>` 単体から `div > button + 絶対配置の … メニュー` に（button のネスト不可のため）。`pr-7` でタイトルが … に被らないように。
- **配管（Rust 変更なし）**: `app-sidebar.tsx`（RepoGroup の `creating` prop 撤去＝未使用化／`onDeleteIssue` prop 追加／Issue 行再構成／親 `handleDeleteIssueRow`＝confirm→`trashIssue`→`loadIssues`+`loadTrash`、開いている Issue を消したら `/issues` へ／`trashIssue` import）。tsc 0・eslint 0。
- **後続（任意）**: Issue 行メニューに Finder/IDE で開く・複製・別 repo へ移動 等。

## DEC-088 (2026-06-14) — コミット/チェックポイント管理を横断レビュー → 取りこぼし修正＋手動コミット一本化

> CEO「手動コミットや remove 機能との兼ね合いは大丈夫？横断的に見直して、自然・シームレス・エンジニア目線でも違和感ないか確認して」。DEC-087 後の管理周りを点検。

- **発見した違和感（横断レビュー）**:
  1. **〔実害〕Merge が未コミット分を取りこぼす**: `git_merge_to_main` は branch（コミット済み）だけ取り込む。Sync/Open PR は dirty を先に WIP コミットするのに **Merge だけしない**＝不整合。「最後のターンを Commit せず Merge」で**最後の作業が main に入らず worktree に残る**。**DEC-087 の自動 CP で『全部保存済み』の錯覚**が出て悪化。
  2. **コミット入口が3つ**（Ship「Commit」/ CP「いまを保存」/ 自動）で 2 つは実質同一操作（`gitCommitAll`）。
  3. 「Commit」と「チェックポイント」が同一物に2名称。DEC-087 後は「**CP＝進行中の安全網／Ship＝確定**」が自然なのに Ship に Commit が混ざり 2 層が滲む。
- **修正（採択＝必須＋整理を両方）**:
  - **① Merge も dirty を先にコミット**: `mergeToMain` が `gitMergeToMain` の前に worktree dirty を `gitCommitAll(issue.title)`（Sync/PR と揃え・取りこぼしゼロ）。
  - **② Ship の「Commit（チェックポイント）」撤去**＋ `handleAccept` 削除（死にコード）。手動保存は **CP の「いまを保存」に一本化**。Ship = Sync / Open PR / Merge（確定のみ・未コミットは自動でまとめる）。
- **結果のモデル（一箇所一概念）**: **自動 CP ＋ 手動「いまを保存」＋「戻す」＝進行中** ／ **Ship（Sync/PR/Merge、未コミットは自動コミット＋squash）＝確定** ／ **Discard＝破棄**。
- **配管（Rust 変更なし）**: `use-implement-session.ts`（`mergeToMain` dirty-commit・`handleAccept`/interface/return 削除）／ `page.tsx`（Ship の Commit 項目・destructure 削除・trigger ラベル更新）。tsc 0・eslint 0。

## DEC-087 (2026-06-14) — 自動チェックポイント（毎ターン前）＋ main マージ時 squash（DEC-080 後続）

> ideas-backlog §D。CEO 候補から採択。「各ターン前に自動でスナップショット → 覚えてなくても常に1ターン戻せる」。DEC-080（手動チェックポイント）を"安心して任せられる"形に。

- **いつ撮るか＝ターン開始時**（`agentState` が idle/waiting→running）。理由: ターン終了時にコミットすると **未コミット Diff が毎回空** になり、DEC-072 の証拠収集（未コミット前提）とも競合する。**開始時に前ターンの結果をコミット**すれば、**現在のターンは未コミットのまま** → Diff / Commit / 証拠収集はそのまま動く。
- **自動チェックポイント（`autoCheckpoint`・QUIET）**: turn START で worktree が dirty なら `gitCommitAll(… "checkpoint (auto) HH:MM")` → `loadCheckpoints`/`loadBehind`。UI の action/error は出さない（静か）。clean ならスキップ（初回ターン等）。`logEvent` も呼ばない（thread を汚さない）。一覧では subject「checkpoint (auto) …」で手動と区別。
- **main マージ時 squash（Rust `git_merge_to_main`）**: 自動 CP で増える WIP commit を、`git merge --squash` → 1コミットに畳んで base へ（main 履歴をきれいに）。staged 空なら no-op「Already up to date」。3重ガード（clean main・not behind・ドライラン衝突ゼロ）は維持。PR 経路は GitHub 側で squash するので不変。
- **既知の小ズレ**: 開始検知は agent が走り出した直後なので、その瞬間までに新ターンが書いた分が稀に CP に混じりうる（rollback 先が「ターン開始直後」≒「前ターン末」）。実害小。
- **配管**: `use-implement-session.ts`（`autoCheckpoint`＋turn-start effect）／ `src-tauri/src/lib.rs`（`git_merge_to_main` を squash 化）。tsc 0・eslint 0・cargo Finished。
- **後続（任意）**: 設定で auto on/off ／ チェックポイント間 diff プレビュー ／ ラベル自動命名（ターン要約）。

## DEC-086 (2026-06-14) — §B 方向転換: Before/After スライダーを撤回 → 「ライブ localhost を触れる＋IDE 的タイルで現状 vs 更新版を比較」

> CEO「Before/After の機構は不要かな。代わりに: ①現状のものを **localhost で起動して探索・操作したい** ②**自由に IDE 的に縦横に並び替えるアクション**があれば、現状の localhost とアップデートした localhost を比べられる」。DEC-085（スライダー）は**撤回**。

- **撤回**: `preview-pane.tsx` の before/after（capture/slider/overlay/toolbar）を全削除。スクショ静止画比較でなく、**ライブ same-state を触って比べたい**というのが CEO の本意。
- **新方向（要 spec）**: 
  - **ライブ localhost の探索性を上げる**（プレビューは既に live iframe＝操作可。より主役に／別窓 or 触りやすく）。
  - **IDE 的タイル**: Implement のペイン（Preview / Diff / Code / もう一つの Preview 等）を**縦横に自由分割・並べ替え**。
  - **狙い**: 「現状の localhost」と「更新版の localhost」を**横/縦に並べてライブ比較**。
- **最終結論（同日）= 一旦すべて不要・クローズ**。CEO「やっぱいらないかな。自分はエンジニアではないので、並べて見比べるなら **Preview 版のみ**。**タイル化も一旦不要**。必要を感じたらまた相談」。
  - 学び: **§B 系（before/after・preview 比較・IDE タイル）は CEO の実利ニーズに今は刺さらない**。CEO は非エンジニアで、diff やコード並置より「動くものを触る」志向。比較が要るとしても Preview のみ・軽量。**moat だからと先回りで作らない**（build≠検証）。再要望が来たら Preview 限定の軽い形から。
- 関連: ideas-backlog §C スプリットビュー（2 issue 並べる）も同様に保留。

## DEC-085 (2026-06-14) — Before/After 視覚比較スライダー（§B moat の本丸・MVP）〔→ DEC-086 で撤回〕

> ideas-backlog §B「Designer/PdM は diff を読まない → レンダリング結果起点の review」。最優先の差別化。AskUserQuestion で **スライダー（重ねてドラッグ）** を採択。

- **接地で判明**: プレビュー領域のスクショ機構が**既存**（注釈→Agent修正 DEC-045/046 の `captureShot`／`loadImageDataUrl`／`ShotViewer`）。`getBoundingClientRect`→ウィンドウ位置＋DPR→`captureRegion`→PNG、で "before"/"after" 概念まである。→ §B は再構築不要、スライダー UI を足すだけ。
- **MVP（Preview に実装）**: ツールバーに **「Before/After」** → いまのプレビューを `before-after/<ts>-before.png` にキャプチャ → **比較モード**。frame 内に **before 画像を重ね、中央の仕切りを左右ドラッグ**（左=before 固定画像／右=ライブ after）。`clip-path: inset(0 N% 0 0)` で before を左側だけ表示。ハンドルは pointer drag＋←→キー。**再固定 / 解除**。比較中は iframe を `pointer-events-none`（cross-origin の pointermove を frame に通す）＋ AnnotationLayer は隠す。
- **配管（Rust 変更なし）**: `preview-pane.tsx`（`frameRef`・capture/drag/state・overlay・toolbar）／ 流用 `loadImageDataUrl`(annotations)・`captureRegion`(ipc)・`getCurrentWindow`。`capture_region` は親dir自動作成。tsc 0・eslint 0。
- **スコープ/後続**: 今は Preview（実装結果）の手動 before。後続＝**ターン開始時に自動 before 取得**（撮り忘れ防止・チェックポイント DEC-080 と連動）／ after も固定して画像×画像比較（scroll ズレ回避）／ Design タブの A/B ／ 横並び・トグル表示の切替。
- **既知の制約**: before は静止画・after はライブなので、**スクロール/リサイズ/デバイス変更でズレる**（同じ表示状態で撮る前提）。

## DEC-084 (2026-06-14) — Issue の repo 紐づけを「入り口」から「開いた後・作業開始前まで変更可」へ（DEC-083 を supersede）

> CEO「入り口で制御するより、開いた後に default 表示＋切替の方が、選び忘れも防げて良い。デフォルトは現在 repo、後から切替。①開始前は切替可 ②ヘッダに repo 表示 ③ホバーで切替 ④チャット/ファイル作成後はロック。ついでにファイル作成を遅らせられる？」

- **ファイル作成遅延への回答**: 不可ではないが**侵襲大**（データ層が「issue＝ディスク上のフォルダ」前提。一時 issue・サイドバー一覧・永続化を作り替え）。**同じ UX を安く**＝即作成は維持し、**作業開始前は drafts フォルダを別 repo へ移動**。データ構造的にも「開始前は drafts だけ／開始後は thread・worktree が repo に紐づく」と一致するので、移動可/ロックの境界が自然。
- **採択（AskUserQuestion）**: 即作成＋ヘッダーで移動。
  - **入り口ピッカー（DEC-083）を撤回** → `handleNew` は**現在 repo に即作成**に戻す（`app-sidebar.tsx`、`repo-picker.tsx` 削除）。
  - **Issue ヘッダに repo チップ**（`IssueRepoChip`、タイトル/StateBadge の隣）。**作業開始前**（worktree 無し＆`thread.length===0`＝エージェント未実行）はドロップダウンで **別 repo へ移動**（`moveIssueToRepo` = `movePath(drafts/<id>-<slug>)` → `switchTo` → route が新 root から再読込）。**開始後はロック**（読み取り専用＋🔒）。
  - 全経路（⌘N / New / ⌘K）が現在 repo に作成 → チップで後から変更、に統一。「現在」repo に ✓。
- **配管（Rust 変更なし）**: `issues.ts`（`moveIssueToRepo`）／ `page.tsx`（`IssueRepoChip`・`repoLocked = !!ref || thread.length>0`・ヘッダ配置・import）／ `app-sidebar.tsx`（picker 撤回）。tsc 0・eslint 0。
- **後続（任意）**: ロック後も「複製して別 repo へ」／ チップから新フォルダを開いて移動／ ホバーで dropdown 自動オープン（現状は hover で affordance＋click）。

## DEC-083 (2026-06-14) — 新規 Issue の作成先 repo を作成時に確認/指定（repo ピッカー）〔→ DEC-084 で supersede・撤回〕

> CEO「複数 repo があると、shortcut で起票したとき望みの repo に作れない時がある。確認 or 指定 or 変更したい」。現状/理想を明文化 → AskUserQuestion で **作成時ピッカー** を採択。

- **現状 UX の問題**: ⌘N / 上部「New」/ ⌘K「新しい Issue」は全部 `handleNew` → **アクティブ repo（`root`）に黙って作成**。明示指定できるのは各 repo の「+」だけ（遅い）。アクティブ repo＝最後に切り替えた repo なので、複数あると見失い**意図しない repo に起票**。作成後に移す手段も無い。
- **理想**: 速い経路でも作成先を確認/指定/変更でき、かつ **1 repo なら摩擦ゼロ**、「今いる repo に作る」は最短手数のまま。
- **実装**: `handleNew` を分岐 — repo 無→フォルダを開く / **1 repo→直接作成** / **複数→`RepoPicker` を開く**。ピッカー＝中央 modal（⌘K と同型）、**アクティブ repo を既定選択**（＝⌘N→Enter で現 repo 作成を維持）・type で絞り込み・↑↓/Enter/Esc・「現在」バッジ＋path 表示。選択で既存 `createIssueIn(path)`（switchTo＋遷移＋サイドバー refresh 込み）を再利用。
- **全経路に効く**: ⌘K の「新しい Issue」も `bezier:new-issue`→`handleNew` 経由なので自動でピッカーが出る。
- **配管（Rust 変更なし）**: 新 `components/repo-picker.tsx`／ `app-sidebar.tsx`（`pickerOpen` state・`handleNew` 分岐・fragment で mount）。open 中だけ render＝毎回 fresh mount で reset-effect 不要（react-hooks 順守）。tsc 0・eslint 0。
- **後続（任意）**: 作成後に別 repo へ移す（issue フォルダ移動）／ ピッカーから新フォルダを開いて作成。

## DEC-082 (2026-06-14) — コマンドパレット ⌘K（任意の Issue / リポジトリ / アクションへ）

> ideas-backlog §C。CEO「§C コマンドパレット ⌘K」。WKWebView はアドレスバー/タブ無し → 「どこかへ行く」単一エントリの価値が高い。現状 ⌘N のみ。

- **グローバル modal**（`command-palette.tsx`、layout に常駐。`ShortcutsDialog` と同型）。**⌘K で開閉**（Esc 閉じ。modifier 付きなので入力中でも誤発火しない）。`openCommandPalette()` イベントで他所からも。
- **中身（検索＋↑↓/Enter）**: 
  - **アクション**: 新しい Issue（`bezier:new-issue` を dispatch → sidebar の handleNew を再利用＝作成+遷移+一覧更新）／フォルダを開く（`openRoot`）／設定／ショートカット（`openShortcuts`）。
  - **リポジトリ**: `useWorkspaceRoot().recents`（現在を除く）→ `switchTo` ＋ `/issues`。path を hint 表示。
  - **Issue**: 現在 repo の `listIssues(root)` → `/issues?issue=<id>`。開いたときに非同期ロード。
  - クエリで部分一致フィルタ、グループ見出し付きで表示。
- **配管**: 新 `components/command-palette.tsx`／ `layout.tsx`（常駐）／ `app-sidebar.tsx`（`bezier:new-issue` リスナを ⌘N effect に追加）／ `shortcuts.ts`（チートシートに ⌘K 追記）。**Rust 変更なし**。tsc 0・eslint 0。
- **react-hooks 順守**: open 時の reset は effect 本体でなくイベントハンドラ（openFresh）で。issue ロードは await 後 setState。focus は別 effect。
- **バグ修正（即時）**: 初回 mount を `WorkspaceRootProvider` の**外**に置き `useWorkspaceRoot()` が throw → **全ルート SSR 500・本番なら白画面**（dev overlay で発覚）。`CommandPalette` をプロバイダ**内**へ移動して解消（/issues・/settings とも 200 確認）。教訓: `useWorkspaceRoot` を使う常駐コンポーネントは provider の内側に mount する。
- **後続（任意）**: fuzzy ランキング ／ 全 repo 横断 Issue 検索（今は現在 repo のみ）／ アクション拡充（Ship/Discard 等）／ スプリットビュー（§C 残）。

## DEC-081 (2026-06-14) — コマンドパックの export / import（マケプレ配布の最小形）

> ideas-backlog §E。CEO「§E マケプレ配布」。DEC-078 の続き＝**自分用 skill を別 repo/人へ持ち回る最小の配布**。「まず最小の配布から芽が出せるか」(§E 未決) に対する第一歩。

- **配布の単位＝JSON パック**: `{ bezierCommandPack:1, commands:[{name,description,body}] }`。1ファイルでコピー/コミット/共有でき、別マシンでインポート → `~/.claude/commands/bezier/` に展開。[[skills-agents-marketplace-idea]] の portable unit。
- **接地**: dialog プラグインは `open/confirm/message` 許可済・**`save` 未許可** → `capabilities/default.json` に `dialog:allow-save` 追加（clipboard プラグイン未導入なので file ベースが筋）。
- **エクスポート**: 保存ダイアログ（`saveFileDialog`）→ `bezier-commands.json` を書き出し（`buildPack`）。
- **インポート**: ファイル選択（`pickFile` filter=json）→ `readPack`（JSON 検証・無効エントリは drop・name は slug 検証）→ `writePack`。**非破壊（既存はスキップ）がデフォルト**、衝突時のみ `confirmDialog` で上書き可否。結果は「追加/上書き/スキップ」件数で報告。
- **UI**: コマンドマネージャ下部に **「共有」行**（エクスポート / インポート）。エクスポートは空のとき無効。
- **配管**: `capabilities/default.json`（`dialog:allow-save`）／ ipc `pickFile`・`saveFileDialog`（`@tauri-apps/plugin-dialog` の `save` を追加 import）／ `bezier-commands.ts`（`buildPack`/`readPack`/`writePack`・`PackCommand`・`ImportSummary`）／ `bezier-commands-manager.tsx`（共有行＋handlers）。tsc 0・eslint 0・cargo Finished。
- **後続（任意）**: URL/レジストリからの取得（真のマケプレ）／署名・安全性レビュー（任意コード実行）／有料 curated パック（open-core）／ skill・subagent もパック対象に。

## DEC-080 (2026-06-14) — チェックポイント（worktree スナップショット / ロールバック・手動 MVP）

> ideas-backlog §D。CEO「**チェックポイント**: 今は Discard（全消し）のみ。途中地点に戻せると安心して任せられる」。**作られ方は手動**を採択（AskUserQuestion。自動・毎ターン前＝WIP commit が増え main マージ時 squash も要る → 後続）。

- **モデル**: チェックポイント＝**issue branch の commit**（`git_commit_all` が作る既存概念を可視化）。Discard の上位互換（全消し → 任意の点に戻せる）。
- **Rust（新規・登録）**: `git_log(worktree, base)` ＝ `<base>..HEAD` の commit を新しい順に（sha/short/subject/iso、US 0x1f 区切り。base 無効時は `HEAD -n50` フォールバック）。`git_reset_hard(worktree, sha)` ＝ commit 検証後 `reset --hard`（後続 commit＋未コミットは破棄・**reflog 復元可**・main 不触）。
- **session**: `checkpoints` state ＋ `loadCheckpoints`（entry/base 解決/commit/rollback 後に更新）。`makeCheckpoint(label?)`（current を commit。label 無→時刻。clean は「保存する変更がありません」）。`rollbackTo(sha)`（async `confirmDialog` で確認→ reset）。SessionAction/ThreadEventType に `checkpoint`/`rollback` 追加。
- **UI**: ヘッダの Ship 隣に **「チェックポイント」ドロップダウン**（worktree 時のみ）。「いまを保存」＋一覧（subject・short・時刻）・各行「戻す」（最新＝現在地は無効）。件数バッジ。
- **実装（app/、tsc 0・eslint 0・cargo Finished）**: `src-tauri/src/lib.rs`（`git_log`/`git_reset_hard`/`Checkpoint`）/ `git.ts`（`gitLog`/`gitResetHard`/`Checkpoint`）/ `issues.ts`（ThreadEventType＋2ラベルマップ）/ `use-implement-session.ts`（state/handlers/公開）/ `page.tsx`（`IssueCheckpoints`＋ラベル）。
- **後続（任意）**: 自動チェックポイント（毎ターン前）＋ main マージ時 squash ／ ラベルを保存時に入力 ／ チェックポイント間 diff プレビュー。

## DEC-079 (2026-06-14) — dev ビルドをロゴで一目で判別（grey 化＋「dev」タグ）

> CEO「dev と本番の見た目がわかりにくい。dev はそれとわかるようにロゴをちょっと変えて（色をグレーに）」。dogfood は本番 `.app`、ビルドは `tauri dev` の二刀流なので、取り違え防止。

- 判別フラグ `IS_DEV = process.env.NODE_ENV !== "production"`（`lib/utils.ts`）。`tauri dev`＝next dev＝development、出荷 `.app`＝static export＝production。build 時にインライン。
- **dev のとき**: `BezierMark` を `text-muted-foreground`（グレー）にし、ブランド名の後ろに枠つき小さな **「dev」タグ**。本番は従来通り（着色マーク・タグ無し）。
- 適用箇所: **タイトルバー**（常時表示）＋ **サイドバーヘッダ**の2か所。tsc 0・eslint 0。

## DEC-078 (2026-06-14) — `/bezier:*` コマンドの UI マネージャ（marketplace 入口）／ codex は将来

> CEO「codex は将来対応に。一旦 Claude Code 最適化で OK。**マケプレの入り口まで作っちゃおう**」。DEC-076 後続。

- **codex は defer（接地で確定）**: agents.ts で codex は `comingSoon:true`（未 wired）・`which codex` 未インストール・`~/.codex/` は別物（OpenAI Codex CLI でない・`prompts/` 無し）。配っても起動/検証不能 → **codex が実エージェントになった時に実 CLI 機構を確認してから**。推測実装はしない。
- **UI コマンドマネージャ（claude 向け・marketplace 入口）**: 設定の読み取り専用一覧を**編集できる管理 UI** に。**disk = 真実**（`~/.claude/commands/bezier/*.md` を直接読み書き）。
  - **一覧**: `listInstalledCommands(home)` が各 `.md` の frontmatter description＋body をパース（組み込み→canonical 順、カスタム→alpha）。組み込み/カスタムを判別表示。
  - **編集**: 行を開いて description／body を直し保存（ファイル書き戻し）。組み込みは **「既定に戻す」**（Bezier 最新 body を復元）。
  - **追加**: `name`(slug 検証 `[a-z0-9-]`)＋description＋body で新規 `/bezier:<name>` 作成（衝突チェック）。
  - **削除**: per-file。Rust **`remove_bezier_command(name)`**（name を slug 検証・path は Rust 側で `~/.claude/commands/bezier/<name>.md` に固定＝任意パス不可）。「すべて削除」は既存 `uninstall_bezier_commands`。
  - **空状態**: 「組み込みをインストール」CTA（`installBezierCommands` 非破壊）＋「コマンドを追加」。確認は async `confirmDialog`（DEC-076 の freeze 教訓）。
- **配管**: Rust `remove_bezier_command`（登録）／ ipc `removeBezierCommand`／ `lib/bezier-commands.ts`（`listInstalledCommands`・`writeCommand`・`removeCommand`・`parseCommandFile`・`BUILTIN_NAMES`・`builtinDefault`・`isValidCommandName`・`InstalledCommand`／ `renderCommandFile` を `{description,body}` 受けに）／ 新 `components/settings/bezier-commands-manager.tsx`／ `settings/page.tsx` は `BezierCommandsField`→`BezierCommandsManager` に差し替え。
- **実装（app/、tsc 0・eslint 0・cargo Finished）**。
- **後続（任意）**: コマンドの import/export・共有（真の marketplace 配布）／ codex 実装後の同等機構／ BEZIER.md ガイドを実コマンド一覧に動的化。

## DEC-077 (2026-06-14) — OPEN-001 merge 安全層は実装済みと判明 → 唯一の実バグ（BASE ハードコード）を修正して close

> CEO「OPEN-001 からやろうか」。着手前にコード調査 → **OPEN-001（merge 安全層）は既に実装済み**（Ship IA = DEC-052/058 期に作られた。`decisions-log` の OPEN-001 エントリ 2026-06-12 は陳腐化していた）。指示通り**思いつきで断定せず深く読み**、再構築でなく**正しさのレビュー**に切替。

- **既存実装（Rust + UI 完備・確認済み）**: `git_behind_ahead`（behind/ahead）/ `git_sync_main`（dirty を WIP commit→base を branch に取り込み・衝突は中断せず残す）/ `git_merge_conflict_check`（`merge-tree --write-tree` のメモリ内ドライラン）/ `git_merge_to_main`（**3重ガード**: main 作業ツリー clean・branch not behind・ドライラン衝突ゼロ）。UI = Ship メニューに behind バッジ・Sync ボタン・Merge は `behind===0 && mergeClean` でゲート・衝突は `resolveConflictsWithAI` でエージェントに委譲。
- **唯一の実バグ**: `use-implement-session.ts` の `const BASE = "main"` が**ハードコード**。一方 `git_merge_to_main` は**メインリポの現在ブランチ**（`current_branch(repo)`）を merge 先にしている。→ デフォルトが `master`/`develop` 等のリポジトリで behind/ahead・衝突チェックのバッジが壊れる（merge は通るのにバッジが出ない不整合）。**Bezier は任意ユーザー repo を対象にする楔**なので実害。
- **修正**: base を `git_merge_to_main` と同一の真実源（メインリポの現在ブランチ）に統一。
  - Rust **`git_base_branch(repo)`**＝`current_branch(repo)`（登録）。ipc/git.ts **`gitBaseBranch`**。
  - セッションに **`baseBranch` state ＋ `baseBranchRef`** を追加。`root` から live 解決し、未解決時は `DEFAULT_BASE="main"` フォールバック。解決後に worktree があれば re-probe（非 main repo でバッジが追従）。
  - `loadBehind`/`gitSyncMain`/衝突プロンプトの `BASE` を `baseBranchRef.current` に置換。UI ラベル（「{base} より N 遅れ」「Sync with {base}」「Merge to {base}」）を `baseBranch` に。
- **実装（app/、tsc 0・eslint 0・cargo Finished）**: `src-tauri/src/lib.rs`（`git_base_branch`＋登録）/ `git.ts`（`gitBaseBranch`）/ `use-implement-session.ts`（base 解決・置換・公開）/ `page.tsx`（ラベル）。
- **OPEN-001 → CLOSED**（①behind 可視化 ②Sync ③衝突チェック付き merge すべて実装＋base 一般化。④運用規律はコード外ルールとして継続）。
- **後続（任意）**: behind/ahead を origin と比較する選択肢（現状はローカル base＝local-first 設計で意図的）／ Ship トリガの title 属性など残りの "main" 文字列。

## DEC-076 (2026-06-14) — composer を撤回し、ショートカットを **agent-native スラッシュコマンド**として配布

> CEO「このUXはどうなんだろう。terminal へのチャット欄が2つあるみたいに見える。既存サービス調べて良い案は？**skill 配布で良い説**も感じる」。調査の結論：DEC-075 は chat-native の入力（composer）を terminal-native の面（自前プロンプトを持つ live pty）に重ねたため**入力が二重**になった。業界は2陣営（A: chat-native = 生ターミナルを隠し会話を構造化／自前ランタイム所有が前提＝Cursor・Lovable・v0・Zed、B: terminal-native = CLI 自身のプロンプトが入力・`@`/`/` はネイティブ＝Claude Code 本体・Warp・Aider・cmux）。Bezier は他人の CLI を pty で動かす構造上 **B 陣営**。よって composer は claude が元々持つ `@`/`/` の劣化再実装だった。

- **composer を撤去**（`agent-composer.tsx` 削除 / `issue-agent-panel` はターミナル単体に戻す / `use-implement-session` の `termPidRef`・`sendToAgent` 削除）。**入力は claude 自身のプロンプト1つ**に。
- **DEC-075 の `@`/`/` の価値は “skill 配布” に移管**: Bezier 提供のショートカットを **本物の agent-native スラッシュコマンド**として配る（`~/.claude/commands/bezier/<name>.md` → `/bezier:<name>`）。
  - `/bezier:verify`（受入基準に根拠を1行・採点しない）/ `/bezier:spec`（spec 読み直し同期）/ `/bezier:alt3`（別案3つ）/ `/bezier:precommit`（型・lint・動作）。
  - 設置先は**グローバル `~/.claude/commands/bezier/`**（リポジトリ外。worktree はリポ外に作るので main repo の `.claude` は claude の探索経路に乗らず、worktree 内に置くと `git add -A` でコミット混入する → グローバルが唯一クリーンで発見可能）。`bezier/` で名前空間化。
  - **claude 専用**（codex は `~/.claude/commands` を読まない）。クロスエージェントの土台は従来通り `BEZIER.md`（prose、opt-in 文言に修正）。`/bezier:*` はその上の claude エルゴ層で、無くても劣化なし。
  - **戦略的含意**: UI 内だけの飾りでなく、**ユーザーの素のターミナルでも効く持ち出し可能な資産** ＝ [[skills-agents-marketplace-idea]] / [[bezier-inherits-repo-conventions-moat]] の楔。
- **配布ポリシー（重要・セルフレビューで修正）**: 初版は **claude 起動時に無言・自動・グローバル・毎回上書き**で設置していた → CEO「勝手に配布される？」。実際この Claude Code セッションの skill 一覧にも漏れ出した。AskUserQuestion で **「明示インストール＋編集尊重」** を採択。
  - **自動設置は撤廃**（`launchAgent` から削除）。**設定画面の明示操作でのみ**インストール。
  - **非破壊**: 既存ファイル（maker の編集）は上書きしない。`installBezierCommands(home,{overwrite})` の既定は **不足分のみ書き込み**。`overwrite:true`（=「最新に更新」）だけが上書きで、UI で confirm。
  - **削除可**: 専用 Rust `uninstall_bezier_commands`（path を Rust 側で算出＝任意パス削除不可。`remove_path` は `.bezier` 配下しか消せないため別コマンド）。
  - 旧挙動で入っていた4ファイルは**この場でクリーンアップ**（`~/.claude/commands/bezier/` を削除）し、opt-in 状態に戻した。
- **配管**: Rust `home_dir` ＋ `uninstall_bezier_commands`（登録）／ ipc `homeDir()` ＋ `uninstallBezierCommands()`／ `lib/bezier-commands.ts`（`BEZIER_COMMANDS` ＋ `bezierCommandsStatus` ＋ 非破壊 `installBezierCommands` ＋ `uninstallBezierCommands`）／ **設定画面に「Bezier コマンド」セクション**（状態表示・インストール/最新に更新/削除・パス明示・中身一覧）／ `bezierGuide`(BEZIER.md) は opt-in 文言に。
- **実装（app/、tsc 0・eslint 0・cargo check Finished）**: 削除=`agent-composer.tsx`／変更=`issue-agent-panel.tsx`・`use-implement-session.ts`・`issues.ts`(`bezierGuide`)・`ipc.ts`・`src-tauri/src/lib.rs`・`app/settings/page.tsx`／新規=`lib/bezier-commands.ts`。
- **バグ修正（設定が固まる）**: 初回実機で「設定ページから他ページへ移動できない＝サイドバーも含め全クリック無反応＝**メインスレッド凍結**」。原因＝設定の確認に **同期 `window.confirm()`** を使っていた。`ipc.ts` が明記する通り **WKWebView の `window.confirm()` は不安定で、未配信の native panel を開いてメインスレッドを deadlock させる**（再起動まで復帰しない＝症状と一致）。アプリ全体は async `confirmDialog`（dialog plugin）で統一済みだった。設定の3確認（**最新に更新 / 削除**＝今回追加、＋既存の**初期化**）を `confirmDialog` に置換。`grep` で src 内の生 confirm/alert は 0（残りは app-close-guard の async plugin confirm）。
- **後続（任意）**: コマンドの追加/編集を UI から（marketplace 入口）／ codex 向け同等（AGENTS.md or codex の機構）／ 設置先を repo-scoped でも選べるように。

## DEC-075 (2026-06-14) — 左チャットを composer 化（@ コンテキスト / クイックコマンド）

> 承認キュー #37（DEC-052 / backlog §B）。「生ターミナル → 綺麗な composer」。設計方針を相談 → AskUserQuestion で **@ コンテキスト＋/ クイックコマンド**を採用（自分の送信の吹き出し履歴は今回スキップ）。

- **方針**: xterm（生ターミナル）は **会話の transcript として残す**（エージェント出力を ANSI parse して吹き出し化するのは重いのでやらない）。その下に **Bezier の composer（入力）** を常設し、生ターミナルに直接打つ代わりにここから送る。
- **配管**: `handleTermReady` が受け取る pty id を **`termPidRef` に保持**し、セッションに **`sendToAgent(text)`**（`ptyWrite(pid, text+CR)` = stdin 投入）を追加。composer はこれを呼ぶ。
- **composer**（`agent-composer.tsx`、`issue-agent-panel` のターミナル下に dock）:
  - textarea（**Enter 送信 / Shift+Enter 改行**）。
  - **`@` コンテキスト**: `@` 入力 or ボタン → インラインメニュー（Spec / Design 案 / 変更(diff) / 受入基準）→ 参照フレーズを差し込む。
  - **`/` クイックコマンド**: `/` 入力 or ボタン → 定型（検証して / 別案を3つ / diff を要約 / コミット前チェック）を展開。エージェント自身の slash とは別系統。
  - メニューは値から派生（effect なし）・↑↓/Enter/Tab/Esc 操作。
- **実装（app/、tsc+eslint green・実機 200）**: `use-implement-session.ts`（`termPidRef`＋`sendToAgent`）/`agent-composer.tsx`（新）/`issue-agent-panel.tsx`（dock）。
- **後続（任意）**: 自分の送信を吹き出し履歴表示 / `@案NN` の動的列挙 / `/` にアプリアクション（タブ移動等）。

## DEC-074 (2026-06-14) — Preview 拡張: 任意幅 / デバイス枠 chrome / 外部ブラウザで開く

> DEC-064 後続（承認キュー #36）。

- **任意幅（カスタム）**: デバイス切替に **「カスタム幅」**（`Ruler`）を追加。選択時は中央に **幅×高さ(px) の数値入力**（最小160）。`isFluid/isCustom` でビューポート寸法を分岐（プリセットの回転・寸法表示はそのまま）。
- **デバイス枠 chrome**: 枠の角丸をデバイス別に（**mobile=`rounded-[1.75rem]` / tablet=`rounded-2xl` / その他=`rounded-lg`**）＋ **mobile 縦向き時にノッチ**（装飾・`pointer-events-none`）。寸法は変えない（iframe = 実寸を維持）。
- **外部ブラウザで開く**: 中央群に `ExternalLink` ボタン → 現在の URL（パス込み）を既定ブラウザで。Rust **`open_external(url)`**（**http(s) 限定・`open` に直接 arg＝シェル不使用**で注入なし）＋ ipc `openExternal`。
- **実装（app/、tsc+eslint green・実機 200・Rust 再ビルド）**: `src-tauri/src/lib.rs`（`open_external`＋登録）/`ipc.ts`（`openExternal`）/`preview-pane.tsx`（custom 寸法・chrome・外部ボタン）。

## DEC-073 (2026-06-14) — ショートカットの可視化: 本物の Tooltip ＋ Kbd ＋ 一覧チートシート（`?`）

> DEC-058 後続。これまで `title` 属性だけだったヒントを、本物の Tooltip に。＋ 触って学べるよう**ショートカット一覧**を用意（CEO「触りながら学べるように・一覧ページも作る」）。

- **`Kbd` 部品**（`ui/kbd.tsx`）: キーキャップ。`data-slot="kbd"`（Tooltip 側に既存スタイルあり）。`border-current/30 text-current` で**明（ダイアログ）/暗（Tooltip）両対応**。`KbdKeys`（keys 配列 → キャップ列）も。
- **ショートカット一覧**（`shortcuts-dialog.tsx` ＋ データ `lib/shortcuts.ts`）: 中央モーダル。**`?` キーで開閉**（入力中・CodeMirror 中は無効）、Esc/背景で閉じる。`openShortcuts()` で他所からも開ける。2カラム（ビュー切替 / タブ / Code / 注釈 / アプリ）。layout に常駐。
- **本物の Tooltip 適用**: `SegmentedControl`（中央 Spec/Design/Implement）を browser `title` → **base-ui Tooltip**（`TooltipTrigger render={btn}` で既存ボタンをトリガ化・ref はサム計測用と合成）。Title `▾` メニューに「キーボードショートカット `?`」項目も追加。
- **データ**: 既存の実体（`use-tab-shortcuts`・view-cycle・code-browser・reload/close-guard・sidebar）から ⌘⇧[] / ⌘1-9 / ⌘⌥←→ / ⌃Tab / ⌘F / ⌥G / ⌘/ / ⌘S / ⌘W / ⌘N / ⌘B / ⌘R / ⌘Q / ⌘Enter / `?` を集約。
- **実装（app/、tsc+eslint green）**: 新 `ui/kbd.tsx`・`shortcuts-dialog.tsx`・`lib/shortcuts.ts`／`layout.tsx`（常駐）／`segmented-control.tsx`（Tooltip 化）／`page.tsx`（メニュー項目）。
- **後続（任意）**: 他の `title` ヒント箇所（Ship・Code ツールバー・Preview）も順次 Tooltip 化。

## DEC-072 (2026-06-14) — Verify を「UI パネル」から「Spec インライン根拠」へピボット

> CEO「（DEC-071 の右レール）今みたいに UI の箇所を用意するのも微妙。**Spec に直接、各受入基準の“根拠”を付与**できれば良いんじゃない？」。Bezier の思想（Spec=SoR・余計な UI を持たない）にも合致。

- **VerifyPanel（右レール）撤去。** 検証は **Spec マークダウンそのもの**が面。`page.tsx` の Spec ペインは `SlotEditor` 単体に戻す。
- **2系統の証拠を spec.md に書き込み**（パネルでなく Spec 内）:
  - ① **各受入基準の“根拠”はエージェントが付与**: Implement ハンドオフに「実装後、各受入基準の直下に `- 根拠: <どこに/どう実装したか・関連ファイル・機微領域>` を1行付す。**採点はしない**」を追加（`buildImplementHandoff` の BEZIER ガイド）。
  - ② **客観的な機械証拠は自動**: ターン終了（running→idle）で `collectEvidence`（変更スコープ・機微フラグ＝git 由来で“嘘をつけない”）→ `## 検証ログ` 管理ブロックへ。トリガーは `page.tsx` IssueWorkbench のターン終了 effect（パネル不要に）。
- **採点は maker**: 根拠＋機械証拠を Spec エディタで読み、`## 受入基準` のチェックを自分で付ける（プレーンな md 編集）。
- **整理**: `verify-panel.tsx` 削除、`verify.ts` から panel 専用の `parseCriteria/toggleCriterionText/Criterion` を撤去（`collectEvidence/syncVerifyBlock/renderEvidenceBlock` は維持）。
- **実装（app/、tsc+eslint green・実機 200）**: `page.tsx`（パネル撤去＋ターン終了収集 effect）/`verify.ts`（整理）/`issues.ts`（根拠付与の手引き）。

## DEC-071 (2026-06-13) — Verify → Spec（証拠ベース検証 / 自己採点をやめる）

> DEC-058/059 で「AI 自己採点」Verify を撤去（4ペルソナが不信）。その置き換え。CEO「Spec に集める／自己採点は maker／verify.md は持たない」。AskUserQuestion で**配置＝Spec タブに統合**を選択。research = `playbook/research/2026-06-13_verify-ux-discovery-and-direction.md`。

- **原則**: AI は**採点しない**。Bezier が**証拠を自動収集**し、**maker が証拠を見て受入基準をチェック**（自己採点の構造は残すが、証拠で裏打ち）。verify.md は廃止、**データは spec.md に集約**。
- **配置**: Spec タブの**右レール**（`VerifyPanel`）。左＝ToC / 中央＝md エディタ / 右＝検証。lg+。
- **データモデル（spec.md）**: 既存 `## 受入基準` のチェックボックス（maker がトグル＝spec.md を書き換え）＋ アプリ管理の `## 検証ログ` ブロック（`<!-- bezier:verify:start/end -->`、自動更新）。
- **証拠（MVP）**: ターン終了（running→idle）＋ worktree 生成時＋手動「再収集」で自動収集 — **変更スコープ（files / ±行）/ 機微領域フラグ（auth・DB/スキーマ・env・RLS を触ったか）/ 変更ファイル一覧**。机上でなく `git diff/status` から。
- **実装（app/、tsc+eslint green）**: 新 `lib/verify.ts`（collectEvidence・syncVerifyBlock・parseCriteria・toggleCriterionText）/`verify-panel.tsx`（右レール）/`page.tsx`（Spec ペインに配線）/`settings.tsx`・`issues.ts`（ハンドオフ/テンプレ文を「採点は maker・AI はしない」に更新）。
- **後続**: before/after スクショ、機械チェック（型/lint/build）、各基準の ✅機械/👁要目視 自動分類、独立 supervisor（Constellation）、不変監査ログ。**デッドコード掃除**（旧 `buildVerifyHandoff`/`handleVerify`/`canVerify` は無参照）。

## DEC-070 (2026-06-13) — 🐛 重大バグ修正: 完了(merged) Issue で `gh pr view` 無限ループ → 激重

> CEO「完了済み Issue がある時だけ激重。普通に使う分には問題ない。原因をしっかり特定して（憶測で断定するな）」。**プロセスツリーの実測**で犯人を確定（思いつきでなく証拠）。

- **誤った初期仮説（訂正）**: dev ビルドが重い説は外れ（本番でも再現）。CPU サンプリングは bezier 本体/WebContent/GPU/claude 子プロセスとも**毎回 idle**で空振り。← **CPU で見えない＝ブロッキング I/O** の症状だった。
- **確定方法**: 重い状態の最中に bezier の**プロセスツリー全体**を `ps` スナップショット → 子プロセスに **`gh pr view ... --json state`（PR マージ確認＝GitHub ネットワーク呼び出し）** が常駐しているのを発見。
- **根本原因（無限ループ）**: `use-implement-session.ts` の「PR が merged か確認」effect が、`ghPrState()==="MERGED"` のとき `onStatusChange("merged")` を呼ぶ。`handleStatusChange`（page.tsx）は `setIssue(prev => ({...prev, status}))` で**毎回新しい `issue` オブジェクト**を生成。effect の依存配列に `issue` が入っているため **issue 変化 → effect 再実行 → 再び `gh pr view` → MERGED → onStatusChange → …** と無限ループし、`gh`（ネットワーク待ち）プロセスを生成し続ける。
- **完了 Issue だけで起きる理由**: in-progress は `state!=="MERGED"` で早期 return（onStatusChange を呼ばない）→ ループしない。merged だけ毎回呼ぶ → ループ。CPU が低いのは各周回が `gh` のネットワーク待ち（bezier 自身は sleep）だから＝「待てば動くが激重」と一致。
- **修正（1行ガード）**: effect 冒頭に `if (issue.status === "merged") return;`。既に merged なら再確認しない → ループ遮断（プラットフォーム側 merge の自動検知という本来の目的は in-progress 時のみ動けば足りる）。
- **実装（app/、tsc+eslint green）**: `use-implement-session.ts`。診断用に作った `dev-perf-probe.tsx` は削除。

## DEC-069 (2026-06-13) — Annotation を Design/Preview で完全パリティに（element-pick 削除・テキスト編集 中止）

> CEO「Design と Implement.Preview で**同じ Annotation を使いたい**。片方にあって片方に無いのは避ける。→ **テキスト編集モードはやめる**」。これを受け、同じ非対称だった **element-pick も削除**（AskUserQuestion で「削除して完全パリティ」を選択）。

- **原則**: 注釈ツールは Design と Preview で**完全一致**させる。cooperating preview（`bezier-inspect.js`）が要るツールは Design の `sandbox=""` srcdoc で動かない＝非対称になるので**置かない**。
- **テキスト直接編集（旧 Slice C）= 中止**（cooperating 必須のため）。
- **element-pick = 削除**: ツール／postMessage 連携（ping/pong/picked）／`elementPick` surface フラグ／`MousePointerClick`・`Banner`・`hint` 一式を撤去。`iframeRef` も AnnotationLayer から外した（iframe 要素側の ref は維持）。「ここ」を指す用途は **comment クリック＋スクショ**で Agent が識別可能なので実用上カバー。
- **結果のツール**: **cursor / comment（点・範囲）/ pen** の3つだけ。Design も Preview も同一。
- 互換: `element` という注釈 KIND 自体は型に残し旧データは描画可（新規生成はされない）。`public/bezier-inspect.js` は現状未使用（将来用に残置）。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: `design-annotations.tsx`（element/hint/Banner/iframeRef 撤去）／`preview-pane.tsx`・`design-variants.tsx`（surface から elementPick・呼び出しから iframeRef 撤去）。

## DEC-068 (2026-06-13) — Annotation 体験の磨き込み（Lovable/Figma 参照）: Comment 統合 / Pen まとめ送信 / ツールバー畳み

> CEO（Lovable スクショ参照）「Design と Implement.Preview の Annotation を磨く。①ツールバーは Top でOK（Bottom は見つけづらい）②畳む機構（Lovable は右、我々は**上に畳む**）③**テキスト直接編集**④**Pen を何度も描いて一度にまとめて送信**⑤Comment は現状維持」。追って「Comment の**点コメントと範囲コメントを1つに統合**（Figma 方式：クリック＝点 / ドラッグ＝範囲）」。

- **Comment 統合（Figma 方式）**: `rect` ツールを廃止し **comment に吸収**。press→tiny move=**点ピン** / press→drag=**範囲（rect）**。閾値 1.5%。`rect` は KIND としては残る。ツールは cursor / comment / pen / element の4つに。
- **Pen まとめ送信**: 描画後にツールを解除せず**ペンのまま連続描画**。ペンは text 不要の視覚マークなので**未送信バッチに常に含む**。ピン番号バッジは pen には出さない（線自体がマーク）。
- **アクションバー（top 下・統合）**: `未送信 N ＋ まとめ指示入力（任意・Enter 送信）＋ 元に戻す / やり直し / クリア ＋ 送信`。1回でまとめて Agent に送る。`send(batch, note)` で全体指示を先頭に付与。undo/redo/clear は未送信ドラフトに作用（redoStack）。
- **ツールバー畳み（上）**: ツールバー右に「畳む」（`Minus`）→ 上部の小ピル（`PanelTop`）に。タップで復帰。
- **据え置き = ③テキスト直接編集**（Slice C）: cooperating preview 必須＝**Implement.Preview のみ**（Design は `sandbox=""` srcdoc でスクリプト不可）。`public/bezier-inspect.js` に text-edit モード追加＋新 KIND が要るため次スライス。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: `design-annotations.tsx`（Comment 統合・Pen 連続・アクションバー・畳み）。

## DEC-067 (2026-06-13) — Design タブの高さ/下線を Implement に合わせる＋ ToC の現在地ラインを単純な縦線に

> CEO「ToC / Design タブ / Implement タブを一貫させる。Design と Implement のタブは**高さも下線も同じ**に（Implement の方が良いので Design を合わせる）。ToC の現在地ラインは **radius 不要・同じ px 太さの単純な縦線**に」。

- **Design タブ高さ**: タブ列の外側に付いていた `h-9` を撤去（中の `UnderlineTab` は h-10 なので 36px 枠と 40px タブが食い違い、下線が枠線とズレていた）。Implement と同じ「タブ高がそのまま列高」に。内側パディングも `px-1.5` に合わせた。
- **ToC 現在地ライン**: `inset-y-1 rounded-full bg-primary` → **`inset-y-0 w-0.5 bg-foreground`**（radius 撤去・フル高さの単純な 2px 縦線・色もタブ下線と同じ foreground）。
- **実装（app/、tsc+eslint green・実機 200）**: `design-variants.tsx`／`slot-editor.tsx`。

## DEC-066 (2026-06-13) — Implement タブにも Chrome ショートカット（共有 hook）＋ タブ/ToC のサイズ統一

> CEO「Implement の Preview/Diff/Code も Design 候補タブと同じショートカットで移動させて。あと Design 配下タブと ToC のサイズが若干小さい・Tab 的役割なのでバランス良く合わせて」。

- **共有 hook**（DRY）: `lib/use-tab-shortcuts.ts`＝`useTabShortcuts({active, ids, currentId, onSelect})`。Chrome 準拠（⌘1-8 / ⌘9 / ⌘⌥←→ / Ctrl+Tab）。`active` で**見えているタブ列のみ反応**（二列が ⌘1-9 を取り合わない）。最新値は ref 経由で読み、リスナ登録は `active` 切替時のみ（churn 無し）。
- **適用**: `build-review.tsx`（Implement に `active` prop＋REVIEW_TABS で hook）／`design-variants.tsx`（自前の keyboard effect を hook に置換＝約40行削減）。`page.tsx` が BuildReview に `active={tab==="build"}` を渡す。
- **サイズ統一（design-token）**: タブ的役割の3要素を統一。**最終的に 14px（text-sm）＋当たり判定を拡大**（CEO「小さすぎるととっかかりづらい・もう少し大きく」→ 13px から再調整）。`UnderlineTab` ラベル **text-sm**・行 h-9→**h-10**・pill `px-3 py-2`、Implement タブのアイコン size-3.5→**size-4**、Design id バッジ **text-xs**、Spec ToC 項目 **text-sm・py-2**・見出し text-xs。Implement/Design/ToC のサイズ感を揃えた。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: 新 `use-tab-shortcuts.ts` ＋ `build-review.tsx` / `design-variants.tsx` / `page.tsx` / `underline-tab.tsx` / `slot-editor.tsx`。

## DEC-065 (2026-06-13) — タブを Facebook 風の下線タブに統一（Implement / Design 候補）

> CEO「Implement の Preview/Diff/Code タブを Facebook 風に：**フォーカス中は下線＋色**、**hover は今の focus 時みたいにグレーの囲み**。Design の候補タブも Chrome 風をやめて**この下線タブに戻す**。ただし **Chrome ショートカットでの移動**と **+ 追加**は維持」。

- **共有コンポーネント**（DEC-058 の集約方針）: `components/ui/underline-tab.tsx`＝`UnderlineTab`。**active＝text-foreground＋下線バー**、**inactive＝hover でグレーのピル（角丸 bg-muted）**。`<div role="tab">` なので **× や バッジを内包**できる（button-in-button 回避）。
- **Implement サブタブ**（`build-review.tsx`）: 3つの Button → `UnderlineTab` に。Diff の Refresh は右端（`ml-auto`）に残す。
- **Design 候補タブ**（`design-variants.tsx`）: Chrome ブラウザタブ風（角丸上タブ＋枠）をやめ `UnderlineTab` に。**id バッジ / タイトル / 採用 ✓ / 生成フラッシュ点 / hover の × / + 追加 / 採用ボタン**は維持。**Chrome 風ショートカット（⌘1-9 / ⌘⌥←→ / Ctrl+Tab）も維持**。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: 新 `underline-tab.tsx` ＋ `build-review.tsx` ＋ `design-variants.tsx`。

## DEC-064 (2026-06-13) — Implement プレビューにレスポンシブ確認（Lovable 風）＋ Stop を「稼働中」バッジに内包

> CEO「Preview でレスポンシブを確認したい。稼働中/Stop/Reload のエリア中央に、Lovable のデバイス切替や root（パス）を置けると良い。あと Stop は表に常時要らない＝奥のメニュー、または『稼働中』に Hover で停止に変わる形でも」。

- **レスポンシブ・ビューポート切替**: ツールバー中央に **フィット（全幅）/ デスクトップ1280×800 / タブレット768×1024 / モバイル390×844** のデバイス切替＋**回転**（縦横入替）＋**寸法表示**。プリセット時は iframe を実寸で**中央寄せ・muted 背景・スクロール可能なデバイス枠**に。fluid は全面。
- **パス（root）入力**: 中央に `/…` 入力（Enter で iframe をそのパスへ移動）。※ iframe 内クリックのパス追従は cross-origin で不可（書き込み専用）。
- **Stop を表から外す**（CEO 案採用）: **「稼働中」バッジ自体が hover で赤い「停止」に変化**しクリックで停止（`RunningBadge`）。ツールバーは Start（停止時）/ Reload（稼働時）/ 設定 のみ。
- **注釈の整合**: iframe と `AnnotationLayer` を**同じデバイス枠（relative）に内包**したので、%基準のピンがどの幅でもズレない。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: `preview-pane.tsx`（DEVICES プリセット・`RunningBadge`・中央コントロール・デバイス枠ボディ・path/src）。
- **後続（任意）**: 任意幅のカスタム入力／デバイス枠のノッチ等の chrome／別ブラウザで開く。
- **追補（同日・CEO FB）**: 回転アイコンが reload と紛らわしい → **`RotateCwSquare`**（四角を回す）に変更。**Reload を右側でなく中央のビューポート群に集約**（device/rotate/dims/path/reload を一列に）。

## DEC-063 (2026-06-13) — ⌘Q も突然終了でなく確認を挟む

> CEO「⌘Q の時も突然終わらないで Confirm して」。

- **Rust**: 定義済み `.quit()`（即終了）を**カスタム Quit 項目**（id=`quit-confirm`・⌘Q）に差し替え。`on_menu_event` で **`bezier://quit-requested` を emit**するだけ（自動終了しない）。
- **Frontend（`AppCloseGuard`）**: `@tauri-apps/api/event` の `listen("bezier://quit-requested")` で受けて **「終了しますか？」確認**→ OK で `win.destroy()`。ウィンドウクローズの `onCloseRequested` と**確認ロジックを共有**（`confirming` フラグで二重ダイアログ防止）。
- 結果: **赤ボタン／⌘W（Code 非表示時）／⌘Q のすべてが確認を経由**して終了。Code 表示中の ⌘W のみタブ閉じ（DEC-062）。
- **権限（重要）**: `window.close()`/`destroy()` は ACL 許可が要る → `capabilities/default.json` に **`core:window:allow-close` / `core:window:allow-destroy`** を追加（無いと `window.close not allowed` で確認フロー自体が動かない）。
- **実装（app/、tsc+eslint green・Rust 再ビルド）**: `src-tauri/src/lib.rs`（custom quit＋`on_menu_event`＋`Emitter`）/`capabilities/default.json`（window 権限）/`app-close-guard.tsx`（quit イベント listen＋確認共有）。

## DEC-062 (2026-06-13) — ⌘W を「Code を見ている時だけ」タブ閉じに、それ以外はアプリ終了（確認つき）

> CEO「Code タブを**見ている時だけ** ⌘W の対象を変えたい。見ていない時は普通にアプリが落ちる方で良い（確認は欲しい）」。DEC-061 では Code 以外で ⌘W が無反応になっていた（ネイティブ ⌘W を外したまま代替を置いていなかった）ので是正。

- **可視判定で振り分け**: `CodeBrowser` がルート要素の `getClientRects().length`（＝中央=Implement かつ サブ=Code で実際に画面に出ている時のみ非ゼロ・`hidden`/display:none で 0）で「Code を見ているか」を判定。
- **capture フェーズで claim**: Code 可視時のみ `window` の keydown（capture）で ⌘W を `preventDefault`＋`stopImmediatePropagation`→ アクティブタブを閉じる。Code 非可視なら何もしない（イベントを通す）。
- **フォールバック＝アプリ終了**: `AppCloseGuard` が `window` の keydown（bubble）で ⌘W を拾い `win.close()`→ `onCloseRequested`→ **確認**。capture 側が claim した時は stopImmediatePropagation で bubble に来ないため二重発火しない。
- 結果: **Code 表示中＝⌘W はタブ閉じ／それ以外＝⌘W はアプリ終了（確認つき）**。Code 可視で開いているタブが無い場合は ⌘W を握りつぶす（終了させない）。
- **実装（app/、tsc+eslint green・実機 200・Rust 変更なし）**: `code-browser.tsx`（capture リスナ＋`rootRef` 可視判定）/`app-close-guard.tsx`（⌘W→close フォールバック追加）。

## DEC-061 (2026-06-13) — ⌘W で Code タブを閉じる／アプリ停止に確認

> CEO「⌘W で Code のタブを消そうとしたら**アプリごと消えた**。⌘W を適切に。あとアプリ停止は突然でなく Confirm を挟みたい」。

- **根本原因**: macOS デフォルトメニューの「Close Window」が **⌘W を占有**し、最後のウィンドウを閉じる＝アプリ終了。
- **Rust（メニュー差し替え）**: `.setup` で **`close_window()` を持たないカスタムメニュー**に置換（App＝About/Services/Hide/Quit、Edit＝Undo/Redo/Cut/Copy/Paste/SelectAll、Window＝Minimize）。Edit を残すので WKWebView の**コピー/ペースト等は維持**。⌘W がメニューに無くなり**webview に届く**ように。`#[cfg(target_os="macos")]`。
- **⌘W → アクティブな Code タブを閉じる**: `CodeBrowser` のルート div の `onKeyDown` で処理（**フォーカスが Code 内にある時だけ**発火＝ツリー/エディタ/検索からバブル）。他のビューでは何もしない。
- **停止に確認**: `AppCloseGuard`（layout に常駐）が `getCurrentWindow().onCloseRequested` を `preventDefault` → **「終了しますか？」確認**→ OK で `destroy()`。赤ボタン等のウィンドウクローズを捕捉。※ ⌘Q（明示的 Quit）は従来どおり即終了。
- **実装（app/、tsc+eslint green・実機 200・Rust 再ビルド済）**: `src-tauri/src/lib.rs`（setup＋カスタムメニュー）/`app-close-guard.tsx`（新・layout 常駐）/`code-browser.tsx`（⌘W ハンドラ）。

## DEC-060 (2026-06-13) — Code Editor の使い勝手（IDE は目指さない範囲で）

> CEO「IDE は目指さないが、一般的にできた方がいい編集体験を上げたい。**ターゲットユーザーから逆算**して提案、承認したものだけ実装」。**ユーザー分析**: Code を触るのは Mai（即時ちょい直し）/Leo（流暢・ただし深掘りは実IDE）/Kenji・Priya（読む＋探す）/Tom（軽修正）→ エディタの仕事＝**確信を持って読む＋文脈を保って素早く安全に直す＋探す**。フル IDE ではない。AskUserQuestion で**全項目承認**。

- **線引き（入れない）**: LSP/IntelliSense・定義/参照ジャンプ・デバッガ・minimap・blame・フォーマッタ・エディタ内ターミナル・拡張。**深掘りは「実 IDE で開く」に逃がす**（moat を守る線）。
- **Tier1（定番・小粒）**: ⌘F **検索/置換**＋Alt-g 行ジャンプ（`@codemirror/search`）／⌘/ **コメントトグル**／**括弧自動補完＋入力時オートインデント**（closeBrackets / indentOnInput）／**実 IDE・Finder で開く**（`openInEditor`/`revealInFinder` の既存 Rust・Leo の逃げ道）／**Revert**（未保存を破棄してディスクに戻す）。
- **Tier2（承認で全採用）**: **折りたたみ**（code folding + foldGutter）／**行折り返しトグル**（永続）／**AI 変更行マーキング**（worktree diff を解析し新規/変更行を緑アクセントで・diff 変化で再計算・repo-as-SoR と直結）／**複数ファイルのタブ**（ブラウザタブ比喩・×で閉じる・dirty は閉じる時に確認・タブ別 dirty・全タブ mount 維持で編集/スクロール/状態保持）。
- **データ依存**: `@codemirror/search` を追加。`session.diff` を `CodeBrowser`→`FileViewer` に渡し AI 変更行を算出。検索クリックは `gotoLine`+nonce でタブを開いて該当行へ。
- **実装（app/、tsc+eslint green・実機 200）**: `code-browser.tsx` 全面強化（tabs/検索/編集作法/folding/wrap/AI 行/IDE 逃げ道/Revert）。Rust 変更なし。
- **後続（任意）**: ブランドに寄せた構文テーマ、ショートカット一覧ページへの追記。

## DEC-059 (2026-06-13) — Implement に Code サブタブ（worktree 実コードを閲覧＋編集）／Verify サブタブ撤去

> CEO「Lovable みたいに Code を扱えると価値ある。`/issues` 配下の成果物と worktree の実コードを整理して見せ、編集も許せると最高」。COO 推し＝**Implement のサブタブに Code を最小で**。CEO「file 見えるなら編集したくなる。Phase2（編集）も最初からやる前提で良い」。＋ CEO「Implement の Verify、無くすんじゃなかったっけ」→ 同時に撤去。

- **配置**: Code は **Implement の3つ目のサブタブ**（Preview / Diff / **Code**）。Code＝worktree（＝"実 repo" ドメイン）なので最上位 SegmentedControl は Spec/Design/Implement の3つに保つ（Lovable は最上位だが Bezier は Implement 内が自然）。
- **Code ビュー（`code-browser.tsx` 新規）**: 左＝worktree の**遅延ファイルツリー**（クリックで展開）、右＝**CodeMirror エディタ**（`@codemirror/language-data` で拡張子から言語ロード・行番号・構文ハイライト）。画像は blob プレビュー、バイナリ/2MB 超はプレースホルダ。
- **ツリーの根＝開いたフォルダ**（CEO 確認・monorepo 対応）: repo ルートでなく **`<worktree>/<subPath>`**（＝元々開いたパッケージ＝エージェントの cwd）を根にする。monorepo でサブパッケージを開いた場合、monorepo 全体でなくそのパッケージだけを表示。git 操作（diff/commit）は従来通り worktree 全体。`subPath` を session に公開。
- **In-files 検索**（CEO「Lovable の検索体験が良い」）: ファイル名でなく**内容 grep**（Rust `grep_files`・case-insensitive・dotfiles/SKIP_DIRS/>1MB/バイナリ除外・総一致 400・1ファイル50・行240字で上限）。UI＝Lovable 風＝**ファイル別グルーピング＋一致数バッジ＋展開で一致行＋クエリ黄ハイライト＋クリックで該当行へジャンプ**（`scrollToEditorLine`）。200ms デバウンス。
- **Phase 2＝編集（最初から）**: **⌘S / 保存ボタンで `write_file`** → worktree の未コミット変更に → **既存の git-status ウォッチャが Implement をパルス → そのまま Commit/Ship に乗る**（新しい配管不要）。
- **レース対策**: ①**エージェント実行中はエディタを read-only ロック**（`action!==null || agentState==="running"`）②エージェント settle 時、**バッファがクリーンならディスクから自動リロード**（AI が書いた内容を反映）③**dirty は決して握り潰さない**（ファイル切替時は確認ダイアログ）。
- **Verify サブタブ撤去（DEC-058 の実現）**: AI 自己採点は全ペルソナ不信 → Implement UI から Verify を削除（`VerifyView`/`parseVerify`/verdict 一式撤去）。検証＝**証拠を Spec に集約**する方針は別タスク（evidence 収集の本実装は未着手）。当面は検証 UI 不在で OK（誤誘導する自己採点より無い方が正）。
- **Rust**: `list_dir_all(path)` 新設（`classify_ext` allowlist を**通さず全ファイル**を raw ext で返す・dotfiles と node_modules/target/.next/out は除外・遅延1階層）。`list_dir`（Design ボード用）は不変。`tauri dev` が自動再ビルド（binary 更新を確認）。
- **実装（app/、tsc+eslint green・実機 200・Rust 再ビルド済）**: `src-tauri/src/lib.rs`（`list_dir_all`＋handler 登録）/`ipc.ts`（`listDirAll`＋`TreeEntry`）/`code-browser.tsx`（新）/`build-review.tsx`（Verify 撤去・Code 追加・`key={ref.path}`）。
- **後続**: ①ツリー検索 ②**統合 Files エクスプローラ**（`/issues` 配下の Spec/ログ/画像/html も同じツリーに出し、各ファイルは最適な面＝Spec/Design/Code へルーティング）＝大相談の論点 ③Verify→Spec の証拠収集本実装。

## DEC-058 (2026-06-13) — Issue 詳細の情報設計（Lovable 参照）＋ SegmentedControl ＋ ショートカット ＋ Verify→Spec 方針

> CEO dogfood バッチ。「Navigation や Button の情報設計を Lovable 参照で見直す」「タブを SegmentedControl に（動きも）」「ショートカットは触って学べるよう hover で」。AskUserQuestion で Verify 改名＝**Implement**／Commit-Ship 形態＝**Ship▾ に全集約**を選択。

- **共通コンポーネント化（token 戦略の転換）**: CEO 指摘「アプリで独自 type-scale token を増やすのはしんどい」→ **独自トークン量産をやめ、頻出 UI を共有コンポーネントに集約**する方針へ。第1弾＝**`SegmentedControl`**（macOS 風・スライドするサム／imperative 配置で再レンダ state なし／`motion-reduce` 対応）。中央 Spec/Design/Implement をこれに置換。
- **Lovable 風トップバー統合**: ヘッダーを1本化。**左＝Title（幅キャップ）＋ `▾` メニュー＋状態バッジ**、**中央＝SegmentedControl を一段上げて配置**（狭い時は `lg:hidden` でバー直下にフォールバック）、**右＝`Ship▾`**。キャンバス独立タブヘッダーは撤去。
- **`▾`（Issue メニュー）に集約**: 活動ログ / 実装エージェント切替（radio）/ 編集後 Spec で再 Implement / 変更を破棄 / Issue をゴミ箱へ / branch / git 警告。→ **左チャットパネルから ⋯ を撤去、純粋なチャットに**（ヘッダー＝「チャット＋branch」だけ）。
- **`Ship▾` に finalize 全集約**（CEO 選択, Lovable Publish 相当）: 先頭＝**Commit（チェックポイント）**、下グループに **main 同期状況 / Sync with main / Open PR / Merge to main**、PR リンク、衝突時は **AI に解決を依頼**。
- **ビュー切替ショートカット**: **⌘⇧[ / ⌘⇧]** で Spec↔Design↔Implement を循環。Design タブ内は **実 Chrome 準拠**に修正（⌘1–8＝タブ / ⌘9＝最後 / ⌘⌥→・← ＝次/前 / Ctrl(+Shift)+Tab。※当初の `[ ]` は Safari と判明し撤去）。
- **ショートカットの可視化**: 各セグメント・`▾`・`Ship` の `title`（hover ヒント）に操作とショートカットを明記（触って学べる）。**後続＝Tooltip コンポーネント＋ショートカット一覧ページ**。
- **Design タブのブラウザタブ化**: Chrome 風タブ（id＋title／× 閉じる／＋ 新規）、新規パターンは自動で開く、幻の「生成中…」表示を撤去（`+` ボタンは `action==="variant"` の時だけスピナー）。
- **Spec の自動ジャンプ**: エージェントが Spec を編集したら、その**変更セクションの先頭行へ自動スクロール**（`MarkdownEditor.scrollIntoView`）。ToC は読みやすさを weight/contrast で確保（文字は大きくしない・`##` 以降のみ・active 強調）。
- **Verify→Spec 方針（決定・実装は次段）**: 4ペルソナ discovery（`playbook/research/2026-06-13_verify-ux-discovery-and-direction.md`）の結論＝**AI 自己採点は全員不信**。方針＝**自己採点をやめ「証拠」を集めて Spec に集約**（verify.md は持たない／受入基準にインラインで status＋証拠リンク／機械が決められる所は機械・機微は目視）。**設計合意済み・実装は別タスク**。
- **実装（app/、tsc+eslint green・実機 200）**: 新規 `components/ui/segmented-control.tsx`／`page.tsx`（トップバー統合・`IssueMenu`・`IssueShip`・⌘⇧[] 循環・narrow フォールバック・`DetailHeader` 撤去）／`issue-agent-panel.tsx`（純チャット化・⋯撤去）／`design-variants.tsx`（ブラウザタブ・Chrome ショートカット・幻表示撤去）／`markdown-editor.tsx`・`slot-editor.tsx`（ToC・自動ジャンプ）。

## DEC-057 (2026-06-13) — dogfood バッチ: html 表示バグ / Implement 改名 / Design 演出 / title・ハーネス / Spec ToC

> CEO dogfood の小issue連打を捌いたバッチ。「うまく捌いて」。

- **🐛 Design が表示されない（最重要・根本）**: Rust `list_dir` の `classify_ext` が `md/mdx/yaml` のみ許可で **`.html` を黙って捨てていた** → ワイヤーが Design ボードに届かず、Spec 同期も AI 演出も動かなかった。`html/htm` を追加（要 Rust 再ビルド・tauri dev 自動適用）。これ1つで Design 表示／Spec 追従／演出が連鎖的に有効化。
- **🐛 タブが全部同じ内容**: `<iframe>` と `<AnnotationLayer>` が**同じ `key={shown.id}`**（兄弟で重複キー）→ React 差分が壊れ iframe が切替らず。`frame-…`/`anno-…` に分離して解消。
- **Build → Implement に改名**（CEO: エンジニアが CI build と混同する懸念）: タブ/ボタン/活動ログ/spec テンプレ/コピーを一括リネーム。ループ＝**Spec / Design / Implement**、仕上げは Ship。AskUserQuestion で Implement を選択。
- **A. Design「AI が作った感」演出**: 新規/改訂パターンに**シマー＋「✨ Bezier が生成」チップ**（一度・reduced-motion 対応）、変更タブに**パルスドット**、**新規は自動で開く**（タブ自動切替）。Spec 側は同期書込時に既存の AI フラッシュが出る。
- **B. Spec の AI 変更表示**: 左の**ガターバー（outline）を撤去**、**ハイライト＋シマーは維持**（CEO: ハイライトだけで OK）。
- **D. title 未更新**: エージェント settle 後に **issue.md を再読込して title を自動反映**（事実駆動）。
- **D. プロンプト肥大ハーネス**: 定型（生きた Spec/DoD/タイトル/デザイン規約/検証）を **`<issue.dir>/BEZIER.md` に外出し**、毎ターンの handoff は**参照する薄い指示**に（`bezierGuide`）。→ 指示の取りこぼし低減。
- **Spec ToC（新規）**: Spec タブの左に**読み取り専用 ToC**（md 見出しから自動生成・編集不可・内容追従）。見出しクリックで**エディタを該当行へスクロール**（`MarkdownEditor.scrollToLine` 追加）。lg+ 表示・見出し2つ以上で出現。スクロール連動の active 強調は後続（任意）。
- **実装（app/、tsc+eslint green・実機 200）**: `src-tauri/src/lib.rs`（html 許可）/`design-variants.tsx`（key 分離・演出・自動切替）/`markdown-editor.tsx`（outline 撤去・`scrollToLine`）/`issues.ts`（`bezierGuide`・handoff スリム化）/`page.tsx`（Implement 改名・title 再読込）/`slot-editor.tsx`（ToC）/`settings.tsx` ほか一括リネーム。

## DEC-056 (2026-06-13) — Design を注釈駆動に（Build と共通化）＋パターンタブ＋Spec 追従

> CEO 要件:「Build と同様、Design 側は **Chat でなく Annotation で指示**（注釈コードは Build と共通化）。Design に chat は不要。Design タブの要素＝**パターン切替タブ / 追加導線 / HTML 表示 / Annotation / 確定アクション**。確定したらそれを元に Build。＋ Spec に **Design パターンを常に表記**し、**採用が決まったら Spec 側も追従**。」AskUserQuestion で「+ ＝ ボタンで1案追加」「Spec 追従 ＝ アプリが自動同期」を選択。

- **Annotation 共通化（DEC-045/046 を一般化）**: `DesignAnnotations` → **`AnnotationLayer`** に。`surface`（`{key, elementPick, canSend, buildPrompt, send}`）で **Build＝worktree コード修正 / Design＝該当 `design/NN.html` 改訂** を切替。注釈ストアは **surface 別キー**（`.bezier/issues/<id>/annotations/<key>.json`）。要素ピックは live preview のみ（静的 srcdoc は off）。`preview-pane` は build surface を渡すだけ（Build は不変）。
- **Design タブ再構成**（ギャラリー＋テキスト composer を撤去）: **①パターン切替タブ（01/02/03、採用は ✓）②+ 追加（エージェントが新方向を1つ）③HTML 1枚表示（sandboxed srcdoc）④Annotation オーバーレイ（design surface）⑤「この案で確定 → Build」**。指示は注釈で／新案は + か主チャット（DEC-055）。
- **確定 → Build ＋ 決定の記録**: `handlePickVariant` が **採用 id を永続化（`design/.adopted`）→ spec.md の管理ブロックを同期 → 実 Build**。注釈→改訂は `reviseDesignPattern`（cwd=worktree or issue フォルダ）。
- **Spec↔Design 自動同期**: spec.md に **マーカー付き管理ブロック**「## デザイン方向」を、パターン生成/確定のたびにアプリが書き換え（一覧＋✅採用）。`syncSpecDesignSection`（変更時のみ書込・idempotent）。
- **実装（app/、tsc+eslint green・実機 200）**: `annotations.ts`（surfaceKey）/`design-annotations.tsx`（`AnnotationLayer`+`surface`）/`preview-pane.tsx`（build surface）/`use-implement-session.ts`（`reviseDesignPattern`・pick で adopt/sync）/`variants.ts`（adopted+`syncSpecDesignSection`）/`design-variants.tsx`（全面再構成）。**未 commit（feat/build-design-loop ブランチに積む想定）**。
- **後続**: nice-to-have の左チャット context チップ（@Spec/@Build/@案NN）は次段（注釈が Design 指示を担うので優先度低）。spec 管理ブロックのエディタ即時リロード確認。

## DEC-055 (2026-06-13) — Design をメインチャットのステップに（会話駆動・別プロンプト不要）

> CEO:「左のメインの Chat でやり取りしていて、**ステップとして Design を作って**欲しい。今のやり方だと、それぞれの Design のために**再度プロンプトを手動で書かないといけない**よね？」

- **狙い**: Design 生成を Design タブの専用プロンプトに閉じ込めず、**メインチャットの会話の流れの中で**「デザイン案を3つ」と言えば作れるように（二度手間の解消・境界が溶ける体験）。
- **仕組み**: エージェントは既に `--add-dir issue.dir` で `design/` に書け、Design ボードは `design/*.html` を polling 表示している。足りなかったのは **チャット側のエージェントが Design 規約を知らない**こと。→ **`designConventionBlock`（フォルダリング/命名＋スタック非依存グレースケールワイヤーの規約）を共通化**し、`buildImplementHandoff`（チャットの seed）に**常駐注入**。これで会話中に頼めば、規約どおりの `NN-slug.html` を書いてボードに自動表示（別プロンプト不要）。
- **フロー**: チャット開始の手順を **Clarify → Spec → Design（UI なら 2〜3 案のワイヤーを提示して方向を選んでもらう・非UIはスキップ）→ 実装 → 要約** に。ロジック中心は Design を飛ばせる。
- **Design タブは併存**（明示的に「N 方向を作る」ボタン）。会話駆動とボタンは同じ `design/` に書き、同じボードに出る。
- **実装（app/、tsc+eslint green・実機 200）**: `issues.ts`（`designConventionBlock` 新設・`buildImplementHandoff` のチャット手順に Design ステップ＋規約注入）。**未 commit**。

## DEC-054 (2026-06-13) — Design はスタック非依存＋蓄積（フォルダリング/命名規約・参照はユーザーに委ねる）

> CEO:「Design は **repo の技術スタックに影響せず**に作れるように。`designidea-01.html` 的にどんどん増やす。フォルダリング規約を設けて。」＋「Mobbin の使う/使わないは **ユーザーが CLAUDE.md 等に書く**で良い気もする。他案は？MCP 設定 UI？でもユーザーに傾けて良いかな」。

- **規約（確定）**：`<issue>/design/NN-<kebab-slug>.html`。NN=2桁連番（使い回さない＝蓄積）／slug=方向の短名／**スタック非依存の自己完結 HTML（inline CSS のみ・repo の framework/部品に依存しない）**。`@01` 参照。詳細＝分析 doc §7.5。
- **スタック非依存を明確化**：Design 生成プロンプトから「repo の DS を読んで接地」を**撤去**し、「**repo を読まない／真似ない／依存しない・Spec から自由にビジュアルを出す**」に。実スタックは Build（収束）でのみ効く。＝役割分離が明確に。
- **参照ソース（Mobbin 等）= ユーザーに委ねる（CEO 合意）**：エージェント＝ユーザー自身の Claude Code なので、**ユーザーの参照 MCP / CLAUDE.md のデザイン指針がそのまま継承**される（[[bezier-inherits-repo-conventions-moat]]）。よって Bezier は**特定ツール（Mobbin）を hardcode しない**：生成プロンプトは「参照ツールやデザイン指針が**あれば**使う」だけの汎用記述に。MCP 設定 UI は Claude Code が既に持つので**作らない**方針（重複回避）。将来は「design-references skill」を配る案＝skills マケプレ（[[skills-agents-marketplace-idea]]）と接続。
- **実装（app/、tsc+eslint green）**：`variants.ts`（`NN-slug` parse・index 連番 `nextVariantIds`・sort）／`issues.ts`（`buildVariantHandoff` 改訂＝スタック非依存＋命名規約＋汎用参照＋`@NN`）／`design-variants.tsx`（slug 表示・蓄積文言）。**未 commit**。
- **未決の2点 → CEO 回答で確定**：
  - **① worktree 不要化 = やる（実装済）**。Design 生成は **Spec と同じ立て付けで Build 前でも可**。worktree が無い時はエージェントを **issue フォルダ（`.bezier/drafts/<id>`）で走らせる**（スタックに触れず安全に隔離／CLAUDE.md は上方向に継承）。**「この案で進める」を押した時に初めて worktree を作って Build に昇格**（`handlePickVariant` の promotion）。hosting 不要＝HTML は `srcdoc` 描画（CEO 指摘どおり）。`canGenerateVariant` から ref 要件を撤去。
  - **② fidelity = 一旦グレースケールのワイヤー継続**（CEO）。スタック非依存ゆえ将来「色付きリッチな自己完結モック」に上げる余地は温存（オプション）。
  - 既知の UX エッジ（レビュー対象）：pre-Build に design エージェントが左チャットを占有する／直接 Build したい時は案採用 or エージェント停止が要る／pre-Build の会話継続はアプリ再起動で途切れる（design ファイルは残る）。

## DEC-053 (2026-06-13) — Design タブを「ハイブリッド（ワイヤー発散→実DS収束）」に作り直し

> CEO dogfood FB:「Design タブが全然使えていない。パターンを見て・考えて・相談する体験が無い。分析して提案して」。AskUserQuestion で **fidelity=H（ハイブリッド）／参照パターン=入れる** を選択。分析 doc = `playbook/research/2026-06-13_design-tab-analysis-and-proposal.md`。

- **実機の証拠**: 別案は **1 枚も生成されていなかった**（design/ 無し・variant handoff 無し）。Build/Verify は動作。Design だけ空回り＝「機能していない」。
- **根本原因（致命の2つ）**: ① **成果物のミスマッチ** — 実 repo は React+Tailwind なのに別案は「自己完結インライン CSS・JS/CDN 禁止・`sandbox=""`」を強制 → Tailwind class が sandbox 内で無効＝**崩れた無スタイル HTML**。「実部品に忠実」という楔に反していた。② **生成が会話を殺す**（fresh 起動で"相談"の連続性が消える）。＋ chat↔board 分断 / ラウンド構造なし / 入口が逆順。
- **再設計 = ハイブリッド（DEC-051 の3タブが自然に収まる）**: **Design=ワイヤー（発散・W）/ Build=実 DS プレビュー（収束・R）/「この案で進める」が橋渡し**。
  - **ワイヤー化（①の修正）**: `buildVariantHandoff` を全面改訂。**グレースケールの構造スケッチ・プレーン inline CSS・Tailwind/外部依存なし**（sandbox と purpose が一致）。"ピクセル忠実は不要、それは Build で実物を見る"と明言。
  - **会話継続（②の修正）**: `handleGenerateVariant` を **`--continue`（resume:true）** に。生成は今のチャットの続き＝相談が成立。
  - **一括発散＋ラウンド**: 1 ターンで **N 方向（既定3・2/3/4 選択）** を別方向で生成。空 input でも"色々な方向"を出す。
  - **@参照（相談）**: 各カードに **@で参照** ボタン → composer に `@B` を前置 → 「@B を密に」「@A の余白＋@C の構成」が言える（agent は design/<ID>.html を読む）。
  - **参照パターン**: 生成プロンプトに「Mobbin 等の参照ツール（MCP）が使えれば実例を見て方向の引き出しを増やし、`<title>` に参考にした型を併記」を内蔵。
  - **収束**: 「この案で進める」→ 実 DS で実装（Build プレビュー＝実物）。HTML は throwaway・採用方向が資産（thread に variant イベント）。
- **実装（app/、tsc+eslint green・実機 /issues 200）**: `variants.ts`（`nextVariantIds`）/`issues.ts`（`buildVariantHandoff` 改訂）/`use-implement-session.ts`（`handleGenerateVariant(ids, context)`・resume）/`design-variants.tsx`（N枚 composer・@参照・ワイヤー文言）。**未 commit（CEO レビュー待ち）**。
- **後続候補**: 参照パターンの専用ブラウザ（今は生成プロンプト内で接地）/ 採用理由の decision 明示記録 / @参照のオートコンプリート。

## DEC-052 (2026-06-13) — 左パネルを純チャット化（動詞は"効く場所"へ・配管は隠す）

> CEO:「左の Chat、ボタンが多くてわかりにくい＆難しそうに見える。基本は chat しながら右を見て判断・レビューして完成を目指す流れをシームレスにしたい」。AskUserQuestion で **「右に寄せる（左＝純チャット）」** を選択。

- **診断**: 操作スタックが会話と場所を取り合い（最大 55%）、「進める動詞」と「git の配管」が**フラットに同列・常時表示**→ git クライアントに見えて難しい。3 クラス（会話／進める動詞／配管）が混在。
- **原則 = 「左＝会話だけ。動詞は"それが効く場所"に置く。配管は隠す」**。
- **左パネル（issue-agent-panel.tsx）= 純チャット化**: ヘッダ（チャット＋branch＋**⋯**）／ターミナル（会話本体・高さ最大）／薄い status 行（error/info）のみ。**⋯ メニュー**＝実装エージェント選択・「編集後の Spec で再 Build」・Discard・branch 表示（＝たまにしか使わない配管）。Build/再Build の専用ボタンは廃し、**着手＝チャットに書いて送る**、直し＝チャットで言う、に一本化。
- **動詞を右へ移設**:
  - **Verify** → **Build タブ（Verify サブビュー）の「検証する」ボタン**（見て判断している場所で検証）。
  - **Commit / Ship（Sync・Open PR・Merge）** → **Issue ヘッダの finalize クラスタ**（`[Commit]` ＋ `[Ship ▾]`）。Ship ▾ に main 差分ステータス・Sync・Open PR・Merge・PR リンク・衝突→AI 解決を集約。
  - **Design の 別案を作る / この案で進める** は既に右（Design タブ）。
- **実装（app/、tsc+eslint green・実機 /issues 200）**: `issue-agent-panel.tsx`（全面スリム化＋⋯ DropdownMenu）／`build-review.tsx`（Verify サブタブに「検証する」）／`app/issues/page.tsx`（`IssueFinalize` 追加＝Commit＋Ship▾、ヘッダに配置）。base-ui DropdownMenu を使用。**未 commit（CEO レビュー待ち）**。
- **後続候補（ideas-backlog §B と接続）**: 生ターミナル → 綺麗な composer（吹き出し＋`/`コマンド＋`@`コンテキスト）への置換は別途（今回は配管整理のみ・ターミナルは会話面として維持）。

## DEC-051 (2026-06-13) — 中央を 3 タブ化（Spec / Design=HTML別案 / Build=実repo）

> CEO:「右側の要素は Spec / Design（HTML パターン出し）/ Build（実 repo を使った本当のデザイン）になるのかなと思っていた」→「理想系まで作り進めて。完成系をレビューする」。DEC-050 で「実装」を Build に概念統一した続き。提案 doc の三層（Spec=md / Design=使い捨て HTML / Build=実コード）を中央タブとして実体化。

- **中央タブ = Spec / Design / Build の 3 枚**（旧 Spec/Design の 2 枚から）。`DetailTab = "spec" | "design" | "build"`。旧「Design」タブ（実 repo プレビュー⇆Diff）は **Build** に移設・改名。
- **Design（新設）= 使い捨ての HTML 別案 = 考える層**：`<issue.dir>/design/<A,B,C…>.html` を presence-driven で並べ、**fully sandboxed iframe**（インライン CSS のみ・JS/CDN 非依存）で見比べる。「別案を作る」→ 生きたエージェントが **repo の DS に接地**した HTML モックを1枚生成（実コードは書かない）。「この案で進める」→ その方向で実 Build を実装。HTML は throwaway、**採用方向だけが資産**（活動ログに `variant` イベント）。
- **Build = 実 repo の結果**：Preview ⇆ Diff ⇆ **Verify** の3サブビュー。Verify は DEC-050 の `verify.md` を読み、**PASS/FAIL/BLOCKED/SKIP をチップ＋色付きチェックリスト**で表示（コードを読めない人が"検証済みの結果"を承認できる）。
- **自由往復（非ウォーターフォール）**：spec 編集→spec pulse、別案出現→design pulse＋auto-switch、コード変更→build pulse＋auto-switch（DEC-012 §7 の信号を3タブに拡張）。全ペインは hidden トグルで mount 維持（iframe/caret が切替で消えない）。
- **実装（app/、tsc+eslint green・実機 /issues 200）**：`lib/variants.ts`（新・presence-driven list/parse/nextId）/ `issues.ts`（`buildVariantHandoff`・`variant` イベント）/ `use-implement-session.ts`（`handleGenerateVariant`/`handlePickVariant`/`canGenerateVariant`）/ `design-variants.tsx`（新・Design タブ：ギャラリー＋composer＋拡大）/ `design-review.tsx`→`build-review.tsx`（改名＋Verify サブタブ）/ `app/issues/page.tsx`（3タブ・pulse・ラベル）。**未 commit（CEO レビュー待ち）**。
- **設計判断**：別案生成は **生きた worktree エージェントを再利用**（DS 接地＋issue.dir へ書き込み）するため、worktree 必須（Verify と同ゲート）。実フロー＝Build 開始→Clarify→Spec→別案を作って見比べ→採用→実 Build→Verify。別案は presence-driven なのでロジック中心の Issue では素通り可。
- **後続候補**：別案への注釈（pen/要素ピックの再利用）/ 採用理由の decision 記録強化 / 内製 eval ハーネス（層B）。

## DEC-050 (2026-06-13) — Build ループ＋evals 層（Clarify → Spec(DoD) → Build → Verify）

> CEO:「なるほど、Build って概念にするのね。それは良いかもね。evals の層を持つのもとっても良さそう。その方針で一気に進めて」。出典＝Zenn 記事（Code with Claude Extended Tokyo）の4核を Bezier の Issue ループに落とした提案 `playbook/research/2026-06-13_agent-loop-from-zenn-article.md`。人＝入口（Spec）と出口（承認）に責任、間は AI で爆速。

- **「実装」→「Build」に概念統一**：エージェントが worktree で実コードを作る段を **Build**（UI: 「Implement with AI」→「Build」/「Re-run AI」→「再 Build」、活動ログ/スレッド・ラベルも刷新）。ループ＝**起票 → Clarify → Spec → Build → Verify → 承認**。Variants（HTML 別案 A/B/C/D）と内製 eval ハーネス（層B）は本 DEC のスコープ外＝後続。
- **Clarify（着手時の曖昧さ除去）= Build ハンドオフに内蔵**：新規チャット開始/通常 Build とも、いきなり実装せず **リポジトリ接地で 3〜5 問・各問に best-guess 既定値併記・誘導尋問しない** 確認をしてから着手するよう handoff に指示（記事 Phase 1）。汎用ツールに勝てる差別化＝**repo を読める質問**。答えは Spec の「受入基準/やらないこと」に凝縮。
- **evals 層A = 受入基準を「完成の定義（DoD）」として Build の前に確定**：`DEFAULT_SPEC_TEMPLATE` を改訂し「受入基準（= 完成の定義 / Build の前に決める・観察可能でチェック可能な文）」を一級セクション化。生きた Spec の handoff にも「受入基準は DoD、Verify が採点する」を明記（記事 evals「成功を先に言語化」）。
- **Verify（自動・spec 駆動・人が読める QA）= 新しいエージェントターン**：Build 後に **受入基準を 1 つずつ PASS/FAIL/BLOCKED/SKIP で採点**し、根拠＋（可能なら）before/after を `issue.dir/verify.md` にチェックリストで書き出し、チャットで総数＋FAIL 要点を要約（記事 Phase 3「検証を最初から」の最小版）。**楔ユーザー（コードを読めない PM）は "検証済みの結果" を承認**＝信頼装置。先日の LP 5秒再テスト発見「PM は diff でなく結果をレビューしたい」と一致。
- **実装（app/、tsc+eslint green）**：`settings.tsx`（テンプレ DoD 化）/ `issues.ts`（Clarify 内蔵 handoff・`buildVerifyHandoff`・`ThreadEventType` に `clarify`/`verify` 追加・ラベル Build 語彙化）/ `use-implement-session.ts`（`verify` action・`handleVerify`・`canVerify`）/ `issue-agent-panel.tsx`（Build/再 Build/Verify ボタン・コピー）/ `app/issues/page.tsx`（`THREAD_EVENT_LABEL` 追従）。**未 commit（CEO 指示待ち）**。
- **戦略的含意（CEO 別件の問い「各社の CLAUDE.md / design.md / 独自スキルは Bezier の上でも自然に使えるか」への回答）= Yes・かつ moat**：Bezier は **ユーザー自身の repo の中で・ユーザー自身のコーディングエージェント（Claude Code 等）に委譲**するため、その repo の `CLAUDE.md`/`AGENTS.md`/`design.md`/custom skills/subagents/MCP/memory が **そのまま Build の土台として継承される**（Bezier 側で再実装不要）。これは Sierra「既存 SoR の上に立つ」現実チェック（Priya の DS 懸念）への構造的回答であり、Clarify が「既存の部品・規約に接地した質問」をできる理由そのもの。→ UI で「この repo の規約（CLAUDE.md / design.md）に沿って Build/Verify しています」と可視化する trust signal を後続で検討。
- **後続（着手順の推奨）**：① Verify 結果ビューア（center に PASS/FAIL＋視覚的証拠を表示・現状は verify.md＋チャット＋スレッドのみ）/ ② Variants（「別案を作る」on-demand＋1 worktree に A/B/C/D）/ ③ 内製 eval ハーネス（層B＝5秒テストの規律を常設）/ ④（本格）`data-verify-*`/`window.__verify` の決定論的検証契約。

## DEC-049 (2026-06-13) — LP を「創刊号（Editorial / Vol. 001）」方針で全面再構築・公開品質に

> CEO:「Editorial の方針良いかも。これで一旦 LP 全体を作ってみて。構成も含めてゼロベースで考えて良い。帰ってきたらそのまま公開できる品質にしておいて」。ヒーロー11案（v1 A–F / v2 Gallery・Editorial・Obsidian・Proof・Signature、FAB 切替）の比較から **Editorial（印刷ブルータリズムの雑誌表紙）** を採用。

- **コンセプト = LP 全体が雑誌の創刊号**: 表紙（巨大マストヘッド "HOLD THE HANDLES." を lit-black ベジェが縫う・四隅の部数表記・下端ティッカー・クーポン CTA）→ 目次（ドットリーダー＋ページ番号）→ 02 特集（ループ3拍・大数字）→ 03 実演（ProofTheater = 注釈→曲線→差分適用の6秒ループ劇場）→ 04 収録機能（索引行）→ 05 読者のみなさま（ペルソナ引用）→ 06 仕様（スペックシート）→ 07 購読（クーポン枠 + WaitlistForm）→ 奥付。印刷文法（2px 罫・mono メタ・P.01–07 folio）で統一。
- **公開品質 QA（4並行レビュアー: desktop視覚/mobile視覚/copy&brand/code監査）→ 33件全対応**: モバイルでフォーム入力欄が 19px に潰れるブロッカー / iOS 自動ズーム / svh 表紙 / a11y（status announce・focus・heading outline・reduced-motion 完全網羅・print 安全）/ 誠実コピー（® 削除・"pr opened"・「コードが Bezier に送られることはない」・6秒表記・JSX 改行スペース除去）/ metadataBase + OG 画像（1200×630 表紙）/ フッター一本化（LP=奥付・docs=SiteFooter）/ GitHub リンクは repo 公開まで gating。
- **成果物**: site repo commit `4b6172d`。tsc/eslint/本番 build green。ヒーロー全11案は `site/src/components/hero-*.tsx` に保存（switcher 含む・未使用）。
- **公開前の残り1タスク（CEO）**: `site/src/lib/site.ts` の `WAITLIST.endpoint` に本物のフォームエンドポイント（Formspree/Tally等）を1行設定（現状はデモモード=localStorage 保存）。`metadataBase` のドメイン確定も同ファイルで。

## DEC-048 (2026-06-12) — ロゴ確定（抽象ペンツール D1）＋ ブランド完全モノクロ化

> CEO:「ロゴをちゃんとデザインして。最終的に D1 で決定。これに合わせて design.md / token / ブランディング関連すべて更新。色は白黒ベースに（indigo 全廃）。」DEC-047 のロゴ/カラー部分を **supersede**（命名・thesis・ポジショニングは不変）。

- **ロゴ確定 = D1**：**抽象ペンツール**のマーク。四角アンカー（中空ダイヤ＝リポの起点）＋ハンドル線＋丸つまみ（中空サークル＝握る制御点）＋曲線（エージェントが描く）。構造ルール：四角と丸は**必ずハンドル線で結ぶ**／曲線はアンカーで**接線一致(collinear)**してから右下へ優雅にスイープ／ノードは**中空＋均一 gap**で境界確保／四角と丸は**視覚的同サイズ**（ダイヤ≒円×1.18）／太さ W13。探索の経緯と全 SVG は `design/brand/logo/explore/`。
- **カラー = 完全モノクロ "lit black"（旧 handle-indigo を全廃）**：マークは全要素 `currentColor`＋1方向の微 sheen グラデ（Typeless 参照＝光の当たりでベタ塗りでない）。UI トークンも indigo(hue266) を全てニュートラル化。`--primary` = ink(light) / near-white(dark)。**唯一の非ニュートラル = 機能色 `--destructive`（赤）**。
- **可読性設計**：app アイコン＝中空ノード（白タイル＋lit-black が既定、Typeless 流）。**favicon は塗りつぶし版**（中空が潰れる ≤24px 用）＋ `icon.svg`（prefers-color-scheme でテーマ反転）＋ `favicon.ico`（mid-tone で light/dark 両タブ対応）。
- **適用（実装）**：`app/`＋`site/` の `BezierMark` コンポーネント差し替え（client + `useId`、テーマ追従 sheen）／`design/brand/logo/` に各 SVG 書き出し／`npx tauri icon` で tauri 全アイコン再生成／site の `favicon.ico`・`icon.svg`・`apple-icon.png`、app の `favicon.ico` 配置。app/site とも **tsc green**。
- **doc 更新**：`design-tokens.md`（全面モノクロ）／`PRINCIPLES.md`（§5/§6/禁則/チェックリスト）／`brand-strategy.md`（§7.5 改訂注記）／`logo/README.md`（D1 仕様）。生成系＝`design/brand/logo/explore/build-locked.mjs`。

---

## DEC-047 (2026-06-12) — リブランド: continuum → **Bezier**

> CEO:「サービス名を Bezier に変更したい。ブランド戦略→CI→ロゴ→トークン→アプリ UI/インタラクション→LP(waitlist)→IDEO レビュー→5 ペルソナ深掘り→IDEO 主導アップデート→ファイル/repo 名まで。奇抜にせず "融けるデザイン"。LP はペルソナがワクワクして登録したくなるもの。機能追加は不要(提案は可)。」

- **命名根拠**: Bézier 曲線（ペンツールの制御点ハンドル）= 工学とビジュアルの交点で生まれた、全デザイナーが毎日触る言語。**「制御点＝人が握る intent/注釈/taste／曲線＝エージェントが描く実装」**で thesis をそのまま内包。タグライン **「ハンドルを握る。曲線はエージェントが描く。」**（Hold the handles.）。`continuum`（抽象）→`Bezier`（具体・手に馴染む）。
- **ブランド資産（SSOT＝`design/brand/`）**: `2026-06-12_brand-strategy.md`（戦略）/ `PRINCIPLES.md`（デザイン原則）/ `2026-06-12_design-tokens.md`（トークン）/ `logo/`（マーク=ペンツール制御点グリフ、曲線=ink・ハンドル=handle-indigo）。旧 `design/design-system.md` は統合・リダイレクト。
- **カラー/モーション**: ニュートラル基調＋**ハンドル1色（handle-indigo ≈ hue 266）**。アクセントは3用途限定（主アクション/アクティブ制御点/agent変更マーク）。**全イージングをベジェに**（linear 禁止・≤240ms・bounce 無し）＝名前をモーションで体現。`--ai` をハンドル色に統一。純白/純黒回避。
- **「黒い画面を溶かす」**: terminal を隠さず脅さない。xterm テーマを #000 でなく ink 背景＋handle-indigo アクセントに。原則4 を実装で死守。
- **適用**: アプリ（titlebar/sidebar に `BezierMark`、favicon/app icon 刷新、interaction polish CSS、terminal-theme）/ LP を **waitlist として再構築**（具体ワークベンチ・ヒーロー＝注釈→エージェントが Filter を描く＋living bézier＋calm な作業ストリップ、`WaitlistForm` はデモ動作・endpoint 1定数で本番化）。
- **レビューサイクル**: IDEO ディレクター批評 ×2 ＋ **5 ペルソナ深掘り**（Kenji/Priya/Tom/Mai/Leo、`persona-design-engineer` 新設）。全員共通の指摘＝①ヒーローが抽象的→**具体ワークベンチに差し替え**②thesis 第2行が muted→**foreground 化**③ロゴのバーベル感→**ペンツール文法に再調整**④アクセント自己違反（青アイコン/純白card）→**是正**⑤名前の検索衝突→**descriptor ロックアップ＋発音キュー（§8.1）**。Priya 洞察「制御点＝ガードレール」を決定ビートに反映。IDEO 最終判定 = **Go（公開品質）**。
- **改名の徹底**: コード（app/src + src-tauri、Rust 安全ガード `.continuum`→`.bezier` 含む）/ localStorage キー（`bezier:*`）/ postMessage プロトコル（`source:"bezier"` + `public/bezier-inspect.js` / `bezier-preview-bridge.js`）/ tauri identifier（`com.bezier.app`）・productName・window title / Cargo（`bezier` / `bezier_lib`）/ 全 docs（`design/brand/` の語源説明を除く）/ README / 既存データディレクトリ `.continuum/`→`.bezier/`（root + site、live issues/threads 移行済）。tsc + eslint green、site build green。
- **残（次サイクル）**: ロゴ線重みの微調整（curve をやや細く・小サイズ専用マーク）/ ヘッダーの descriptor 一語 / dark LP 未対応（意図的 light-only）。**Rust ネイティブ窓は CEO の目視ゲート**（`npm run tauri dev`）。GitHub repo 名 `Sota-Mikami/continuum`→`bezier`、ローカルフォルダ名は live worktree/memory 影響のため CEO 確認の上で。

---

## DEC-046 (2026-06-12) — Design フィードバック Phase 2: 矩形・before/after・要素ピック

> CEO:「次フェーズ、それぞれ進めて」。DEC-045 の続き 3 機能。

- **① 矩形リージョン**: ツールバーに「矩形」追加。ドラッグで領域指定（%保持）。プロンプトに「領域 左上x%,y% / 幅 高」を含める。`Annotation.kind="rect"` + `rect:{w,h}`。
- **② before/after 比較**: 送信時の注釈つきスクショを **before**（=Agent 添付と同一）、ターン終了 1s 後の**クリーンスクショ**を **after** として注釈に保存。done カードに Before/After トグル（`loadImageDataUrl` で data URL 表示）。`captureShot(clean)` で marks を隠して撮影。
- **③ 要素ピック（協調プレビュー限定）**: クロスオリジン iframe は DOM 不可視のため、**postMessage 協調方式**。`app/public/bezier-inspect.js`（配布ヘルパー）をプレビューが読み込むと、ping→pong→pick-start→クリックで `{selector,tag,classes,text,x,y}` を返す。Bezier 側「要素」ツールが受けて element 注釈を生成、プロンプトに CSS セレクタを同梱。**未対応プレビューは 900ms で pong 無し→フォールバック**（コメント/矩形を促すヒント表示）。
- **正直な制約**: ③はプレビューがヘルパーを読み込んでいる時のみ精密化（それ以外は座標＋スクショで Agent が特定）。スクロール非追従・tauri runner 非対応は DEC-045 と同じ。
- 実装: `annotations.ts`(kind 拡張/`loadImageDataUrl`)・`design-annotations.tsx`(全面拡張: rect/element/before-after)・`preview-pane.tsx`(iframeRef 受け渡し)・`app/public/bezier-inspect.js`(新・配布ヘルパー)。

---

## DEC-045 (2026-06-12) — Design フィードバック: プレビューに注釈→Agent修正（ideas-backlog B 着手）

> CEO:「Figma のように iframe に直接コメント / ペンで注釈 → それぞれが Agent への修正依頼になる」。参照: agentation / markloom。論点を AskUserQuestion で確定。

- **CEO 決定**: ① **発火＝明示送信、バッチ既定＋単発も可**（単一 worktree の衝突回避）。② **MVP＝コメント＋ペン同時**。③ **履歴＝チャット＋活動ログのみ**（専用履歴パネルは作らない）。
- **アーキ（クロスオリジン iframe 制約の解法）**:
  - 注釈は**アプリ側の透明オーバーレイ層**（iframe の上）。座標は**%（fraction）**で保持しリサイズ追従。ツール選択時のみ pointer-events を奪い、通常は iframe 素通し。→ **HMR で iframe がリロードされてもピン/記入中コンポーザは消えない**（別レイヤー）。
  - Agent への文脈＝**注釈を描いた後の OS リージョンスクショ**（Rust `capture_region` = macOS `screencapture -R`、点座標）。クロスオリジンでも iframe ピクセル＋ピンを取得。`issue.dir/feedback/<ts>.png` に保存し `--add-dir issue.dir` で Agent が読める。撮影時はツールバー/コンポーザを隠しピンのみ残す。
  - 修正は **worktree → dev server HMR で iframe 自動更新**（再起動不要）。
- **発火/結線**: バッチ（下書きを溜め「まとめて送信」）＝1ターン1diff。`sendDesignFeedback` は handleRerun 同型（`ptyKillKey`→`--continue`＋プロンプトを positional arg）。送信文は Agent チャットに、`thread.json` に `design_feedback` イベント（履歴=両方）。
- **ステータス**: draft→running→done。**ターン終了検知**＝persistent Claude は exit せず "waiting" になるため、`agentState` を session に公開し「送信後に running を見てから waiting/done/idle」でdone化（kill→relaunch の隙間を guard）。
- **annotations.json は生きているピンの作業状態のみ**（`.bezier/issues/<id>/annotations.json`、gitignore）。解決したら消す＝履歴は chat＋log。
- **v1 スコープ外**: tauri runner（別ウィンドウ）／iframe スクロール追従（送信時スクショで担保）。初回は画面収録許可(TCC)。
- 実装: `annotations.ts`(新)・`design-annotations.tsx`(新)・`preview-pane.tsx`・`design-review.tsx`・`use-implement-session.ts`・`ipc.ts`・`lib.rs`(`capture_region`)・`capabilities/default.json`(window getter 権限)。

---

## DEC-044 (2026-06-12) — Spec エディタ磨き込み: checkbox/画像UX/スラッシュ画像/インデント

> dogfood フィードバック連発:「checkbox をもう少し大きく・押しやすく、task の時は `・` を消す」「checkbox の高さが checked/unchecked で変わるのをやめて」「画像は Cmd+V でいけた、D&D と挿入プレビューの UX 改善」「スラッシュで画像追加」「(a) スラッシュのキーワード検索＝既に対応済」「Spec 編集で Tab/Shift+Tab のインデント（上限3-4段）」。

- **checkbox 再デザイン**: ネイティブ `<input>` をやめ **span ベースのカスタム**（WKWebView が styled input に擬似要素を描けないため）。1.2em・角丸・hover で primary・CSS チェックマーク。**task 行では `・` ブレットを隠す**（ListMark を消し、後続スペースも消費）。チェックマークは **絶対配置**にして checked/uncheck で**高さ不変**。
- **画像 UX**（`markdown-images.ts` に共通化＝paste/drop/slash で再利用）: **D&D 修復**（dragover で `preventDefault` しないと drop が発火しない）＋**ドロップゾーンのハイライト**（破線リング＋淡いtint）。保存先 `<issue.dir>/assets/`、`![](assets/…)` 挿入、live preview でインライン表示（DEC-043）。
- **スラッシュ画像**（DEC-044 #b）: `/Image` コマンド追加 → ネイティブ画像ピッカー → 選択ファイルを assets/ にコピーして挿入。スラッシュは `baseDir` 必要なので `makeSlashCommands(baseDir)` ファクトリ化。**(a) キーワード検索は既存実装で対応済**（`/` 以降をクエリに CM がフィルタ）。
- **Tab/Shift+Tab インデント**: 行頭に 2スペース単位で増減、**上限 4 段**。list（bullet/number/checkbox）に最適化、prose でも機能。slash popup 表示中の Tab は補完確定。
- 実装: `markdown-images.ts`(新)・`markdown-editor.tsx`・`markdown-live-preview.ts`・`markdown-slash-commands.ts`・`ipc.ts`(`pickImageFiles`)。

---

## DEC-043 (2026-06-12) — 設定ページ＋repo導線拡張＋Specテンプレ/画像（6件バッチ）

> CEO 6件バッチ:「Spec に画像挿入」「設定を作りたい」「Spec の checkbox が preview できてない」「Spec テンプレを設定でカスタム」「repo の『…』導線に他アクション」「複数 repo 時の issue 作成先指定が微妙」。CEO 回答 = 設定は全カテゴリ / 新規 issue 先 = 各 repo 行に「+」/ 追加アクション = Finderで開く・表示名を変更・IDEで開く。

- **#3 Spec checkbox preview**（先行・DEC-042 で完了）: GFM task-list を live preview でレンダ。
- **#2/#4 設定ページ**（`/settings`、`lib/settings.tsx` = localStorage ストア + `useSyncExternalStore` + 非React用 `getSettings()` 同期 getter）:
  - **テーマ**（light/dark/system）。`.dark` クラス方式。pre-paint スクリプト＋`ThemeKeeper`。端末theme・CodeMirror・Claude TUI(`--settings`)も解決済テーマに追従。
  - **既定エージェント** / **プレビュー上限・自動停止**（DEC-040 の MAX/IDLE を設定化）/ **ゴミ箱 TTL**（DEC-020）/ **Spec テンプレ**（`{{title}}`/`{{id}}` 置換、既定に戻す）。
- **#5 repo「…」メニュー拡張**（`lib.rs`: `reveal_in_finder` / `open_in_editor`〔cursor→code→…の順に PATH 探索〕）: Finderで開く・IDEで開く・表示名を変更（インライン rename、override を `RepoEntry.displayName` に永続）・接続を解除。
- **#6 新規 issue 先指定**: repo 行 hover に「+」ボタン（その repo に issue 作成）。上部の大「New」はアクティブ repo 用に据え置き。
- **#1 Spec 画像挿入**: paste/drop → `<issue.dir>/assets/` に保存 → `![](assets/…)` 挿入 → live preview でインライン表示。Rust = `write_file_bytes`/`read_file_bytes`。
- 実装: `lib/settings.tsx`・`app/settings/page.tsx`・`app-sidebar.tsx`・`workspace-root.tsx`・`use-preview-server.ts`・`use-implement-session.ts`・`terminal-theme.ts`・`lib.rs`・`markdown-editor.tsx`・`markdown-live-preview.ts`。

---

## DEC-034 (2026-06-12) — ターミナル視認性: Claude の TUI テーマを端末背景に同期（best practice）

> CEO:「terminal の色、ライトで視認性悪い。best practice 見つけて」。原因 = Claude Code の TUI は**自テーマ前提の truecolor** を出すため、xterm だけ白くしても文字は暗背景向けのまま薄くなる。

- **best practice = 端末背景に Agent 自身のテーマを合わせる**。Claude Code は `--settings` で `theme`（`light`/`dark`/`*-ansi`/`*-daltonized`）を受ける（実機確認済）。
- **実装**: `agentHookSettings(eventsPath, theme)` に `theme` を追加し、launch 時に **OS の light/dark に合わせて `theme: light|dark` を注入**（hooks と同じ settings に同梱）。
- **限界**: theme は launch 時の CLI arg なので、**現在走っている session には効かず、次の launch/Re-run/resume から反映**。OS テーマを途中で変えた場合も次回起動で揃う（xterm 背景は live 追従）。
- 補足: さらに端末の 16 色に完全一致させたいなら `light-ansi`/`dark-ansi` も選択肢（Claude が xterm の ANSL を使う）。今回は標準の light/dark を採用。

---

## DEC-033 (2026-06-12) — detail レイアウト v2: 左チャット｜右キャンバス＋resizable＋履歴ドロワー＋ターミナルtheme追従

> CEO:「v0 / Figma Make のように左にチャット。右だとチャットがサブに見える。基本 Agent を動かして設計するので IA を見直したい」「各要素を resizable に」「ターミナルにも theme を当てたい（白｜黒｜白 がチグハグ）」。Superset も nav｜agent｜changes で同型。

- **2カラム化（v0/Figma Make 型）**: **左＝Agent チャット（主役・ドライバー）｜右＝Spec/Design キャンバス（結果）**。旧 3カラム（thread｜center｜agent）から転換。
- **resizable**: 左右の境界をドラッグで幅調整（`chatWidth` を localStorage 永続・`--chat-w` CSS var・clamp [320px, 70%]・ダブルクリックで 460 にリセット）。md+ のみ。<md は縦スタック（チャット上）。
- **活動ログ → ヘッダの「履歴」トグル → 右スライドドロワー**（旧 thread カラム廃止）。新しいもの上。
- **ターミナル theme 追従**: xterm を OS light/dark に追従（`terminal-theme.ts` に light/dark パレット＝ANSI16色含む）。OS 切替で live 更新。agent パネルのハードコード dark（`#0a0a0a`/zinc-*）を theme トークン化。→「白｜黒｜白」のチグハグ解消。
- ターミナルは全レイアウトで mount 維持＝セッション継続（DEC-026）。

---

## DEC-037 (2026-06-12) — Spec の AI 変更ハイライトを再デザイン（理解しやすさ＋AI感、しつこくない）

> CEO:「Agent が変更した時の Spec ハイライトを、もっと理解しやすく。AI感もあると良い。自然でしつこくないのが理想。最高の design を」。

- 旧: 変更行に primary（ニュートラル黒）の薄い背景が 2.5s フェードのみ。
- 新（`cm-ai-change`）:
  1. **左ガターのアクセントバー**（box-shadow inset 2px）→ どの行が変わったか一目で分かる（理解しやすさ）。
  2. **一回のシマー・スイープ**（光の帯が左→右に 1.1s 横断）→ AI生成の手触り（AI感）。ループしない。
  3. **やわらかいバイオレットの tint** が 3.2s で settle→フェード → 数秒見えてから自然に消える（しつこくない）。
- 色 = 新規 `--ai`（バイオレット oklch、light/dark 別）。ニュートラルな editor に対し「AI」を示す。
- すべて background ＋ box-shadow のみ＝CM6 の行高さ測定に影響しない。clear timer 2500→3400ms（settle 完了に合わせる）。
- 既存の line-diff（変更行算出）＋ flashLines→StateField→line deco の仕組みは流用、クラスと CSS のみ刷新。

---

## DEC-036 (2026-06-12) — ターミナル入力修正: Shift+Enter で改行 ＋ IME二重対策で xterm 5.5.0 へ

> CEO（チャットで困っている2点）: ①日本語の漢字変換で変換結果が二重に出る ②改行ができない。

- **改行（②）**: xterm は Enter も Shift+Enter も `\r` を送るため、agent TUI が区別できず Shift+Enter も送信になっていた。`attachCustomKeyEventHandler` で **Shift+Enter を `\n`（改行）に**、plain Enter は `\r`（送信）のまま。
- **IME二重（①）→ 真因と修正（追記）**: xterm 6.0.0 を疑って 5.5.0 に下げたが、**真因は別**だった。**best practice = custom key ハンドラは composition 中（`ev.isComposing` / `keyCode 229`）は何もせず IME に委ねる**。日本語変換を確定する Enter は `isComposing=true` の keydown で来るが、xterm は Enter(keyCode 13) を IME 処理キーと見なさず **確定と同時に `\r`（送信）も処理** → 「変換のたびに不自然に改行/送信」「二重」になっていた。
  - 修正: `attachCustomKeyEventHandler` の先頭で **`if (ev.isComposing || ev.keyCode === 229) return false;`**（IME に委譲）。これで確定 Enter が送信扱いされない。**バージョン非依存**の本質修正。
  - xterm は安定の **5.5.0 のまま据え置き**（churn 回避。6.0.0 へ戻すかは後日）。
- 改行（Shift+Enter→`\n`）は確実。Claude が `\n` を改行と解さない場合は bracketed-paste 方式に切替の余地（要実機確認）。

---

## DEC-041 (2026-06-12) — リポ接続の解除（hover「…」メニュー）

> CEO:「サイドバーのリポを解除する機能がほしい。UX を調査・比較して提案を」。Cursor=hover✕ / VS Code・git client=右クリック / Linear・Notion=hover「…」メニュー、を比較。CEO 選択=**hover「…」メニュー**（クリーン・誤クリックしにくい・将来アクション拡張可）。

- **非破壊**: 「接続を解除」= サイドバーのリストから forget するだけ。**フォルダ/git/.bezier(issues) は一切触らない**。再度フォルダを開けば戻る。
- **workspace-root**: `removeRepo(path)`（module `removeRecent`）を追加。recents から削除＋永続化。**外したのが active root なら次の recent に切替**（無ければ root クリア）。
- **UI**: 各リポトグル行を `group/repo relative` 化。hover で右端に **「…」**（件数はフェードアウトして場所を譲る）→ メニューに「**接続を解除**」（Unplug アイコン）。将来「Finderで開く」等を足せる。
- 確認ダイアログ無し（非破壊・可逆なので即実行、メニュー自体が intent ゲート）。

---

## DEC-040 (2026-06-12) — プレビュー dev server を永続化（B案: 永続＋アイドル自動停止）

> CEO:「並行運用時、Design プレビューを毎回止めるのがしんどい。チャット同様に保持したい。懸念込みで提案を」。→ メリデメ提示の上で B（永続＋アイドル停止＋動的ポート＋同時上限）を採用。

- **永続化**: preview の dev server pty を `preview:<issueId>` で keyed 化（agent pty=DEC-026 と同型）。**issue を離れても kill しない**。戻ると **reattach**（pty_lookup→backlog 再生→既知ポートを ping→ready）で**再起動せず即表示**。
- **動的ポート**: Rust `find_free_port`（127.0.0.1:0 bind）で **preview ごとに空きポート**。固定 port 由来の衝突を解消（同一 repo の複数 issue でも並行可）。
- **同時上限**: `MAX_PREVIEWS=3`。start 時に超過なら **LRU（最後に閲覧した時刻が古い）を退避**（現在の issue は touch 済なので退避されない）。
- **アイドル自動停止**: module 単位の sweep（60s 毎）が **10 分閲覧されない preview を停止**。VS Code/Codespaces 的「使ってなければ落ちる」。
- **後始末**: Discard / Stop ボタンは `dropPreview`（ptyKillKey）。アプリ終了時は pty SIGHUP で dev server も終了（ゾンビ低リスク）。
- **Agent Inbox から除外**: `preview:*` キーはエージェントでないので sidebar の inbox/ドット集計から filter。
- registry（port + lastViewedAt）は module 内メモリ。アプリ再起動で preview は死ぬので整合。

---

## DEC-039 (2026-06-12) — monorepo 対応: サブフォルダを開いたら scope して作業

> CEO:「monorepo 運用しているものの root を開くとどうなる？ monorepo 対応もしたい」。DEC-035 では subfolder→「root を開く」に steer していたが、subfolder を first-class に。

- **モデル**: 開いたフォルダ（subfolder 可）= 保存ルート `root`（issues は `root/.bezier`）。`subPath` = root の repo toplevel からの相対（root が toplevel なら ""）。
- **worktree** = git が自動で **repo toplevel から切る**（`git -C subfolder worktree add` の既定挙動）。worktree は monorepo 全体を含む。
- **エージェント cwd ＋ プレビュー = `worktree/subPath`**（開いたパッケージ）。git 操作（diff/commit/merge）は worktree root のまま（変更は subPath にしか出ない）。
- **node_modules / dev**: preview の既存 `packageDir` 機構をそのまま流用。`usePreviewServer(root, workDir(ref.path))` に渡すだけで、source(`root`=subfolder の node_modules) と target(`worktree/subPath`) が一致して通る。
- **handoff**: subPath がある時「この作業は `<subPath>/` に限定」と明示。
- **ガードレール変更（DEC-035 改）**: subfolder → 「root を開く」ダイアログ廃止 → **そのまま scoped に開く**。非 repo → git init は維持。
- `subPath=""`（通常 repo）の時は完全に従来通り（後方互換）。OPEN-002 #3 を解消。

---

## DEC-035 (2026-06-12) — Tier 1 ローカル第一ガードレール（OPEN-002 修正）

> 合意: ローカル第一ハイブリッドの Tier 1。Open PR 認証 UX と Tier 2(GitHub clone) は今回スコープ外（CEO「Open PR はそのままでいい / Tier2 不要」）。

- **フォルダを開いた時に git 状態で分岐**（`openRoot` ＝ 「フォルダを開く」「GitHub から…」全経路）:
  - **repo root** → そのまま開く ✓
  - **repo のサブフォルダ** → 「リポジトリ root を開きますか？」（推奨）。root を選べば toplevel を開く／キャンセルで中止。**黙って親リポ worktree を作らない**（OPEN-002 の核）。
  - **非 repo** → 「git init して開きますか？」→ `git init`＋**初回コミット**（全ファイル）を作成して開く。git を知らなくても素のフォルダが使える。
- **Rust 追加**: `git_repo_status(path)`（isRepo / toplevel / isToplevel を canonical 比較で判定）、`git_init(path)`（init＋`add -A`＋commit。worktree は HEAD ベースなので**初回コミット必須**。identity 未設定なら fallback identity で再試行＝git 初心者でも通る）。
- **JS**: `gitRepoStatus` / `gitInit`（git.ts）、`ensureUsableRepo`（workspace-root.tsx）でダイアログ分岐。`switchTo`（既知 recents）は検証済なのでガード不要。
- 検証: 4ケース（root / site / app/src=subfolder / 素フォルダ）で分類が正しいことを確認。
- 関連: これで「Bezier で Bezier の site を改修」dogfood が素直に回る。

---

## OPEN-002 (2026-06-12) — 開いたフォルダが git toplevel でない / untracked のとき worktree が壊れる（dogfood で発覚）

> CEO が Bezier の `site/`（LP）を Bezier で開いて改修しようとしたら、エージェントが「これは Tauri デスクトップアプリ本体でした」と誤認。

- **原因**: `site/` は (a) 独立 git repo でなく Bezier リポのサブフォルダ ＋ (b) git untracked。Bezier は「開いたフォルダ = git repo root・全ファイル commit 済」を暗黙前提に `git -C <root> worktree add` するため、**親リポ全体の worktree** が作られ、しかも untracked な `site/` はその worktree に存在せず、エージェントが `app/`(Tauri) を見てしまった。
- **暫定対処（実施済）**: `site/` を独立 git repo 化（`git init`＋初回 commit）、親は `/site` を gitignore、`.bezier/` も site 側 gitignore。→ これで Bezier で `site/` を開けば site だけの worktree になる。
- **要対応（本体バグ）**:
  1. 開いたフォルダの **git toplevel を検出**し、root ≠ toplevel（＝サブフォルダ）なら **警告**（黙って親リポ worktree を作らない）。
  2. 対象に **未コミット/untracked** が多い場合の挙動を明示（worktree は HEAD ベースなので untracked は入らない）。
  3. 将来: **monorepo サブフォルダを正しくスコープ**（toplevel で worktree を作り、エージェント cwd＋handoff を subdir に向ける）。
- 関連: ここを直すと「Bezier で Bezier の site を改修する」dogfood が素直に回る。

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

## DEC-031 (2026-06-12) — Issue detail のレスポンシブを 3→2→1 で再設計（横潰れ撲滅）

> CEO:「どのように resize しても一定綺麗に見えるように」。旧設計は center=min-w-0／agent=min-w-340 で、幅を縮めると center が潰れて agent だけ残る横潰れが発生。

- **3 段ブレイクポイント**:
  - **xl+**: 3 カラム（thread | center | agent）。thread は xl のみ（240px・二次情報）。
  - **md–xl**: 2 カラム（center | agent）。thread 非表示。
  - **<md**: **単一カラムに縦スタック**（center=上, agent=下）。横潰れが原理的に起きない。
- **スタックは比率 flex**（center `flex-[3]` / agent `flex-[2]` = 3:2）。固定 vh でなく比率なので**短いウィンドウでも overflow しない**（両ペインが min-h-0 で縮む）。row モードでは agent を `md:flex-none` ＋ `w-[42%] min-w-[340px] max-w-[640px]`、center は `md:flex-1`。
- **agent パネル内のコントロールを `max-h-[55%] overflow-y-auto`**: merge UI＋衝突表示でコントロールが伸びても**ターミナルを 0 高にしない**（特に短い agent ペインで効く）。
- ターミナルは全モードで mount 維持＝セッション継続（DEC-026）。

---

## DEC-030 (2026-06-12) — ゴミ箱の中身プレビュー（worktree 起動なしの読み取り専用詳細）

> CEO:「ゴミ箱に入れたもの、起動せずとも中身を確認した上で完全削除/復元したい。適切な preview/詳細表示を」。

- **trash 行クリック → メインペインに読み取り専用プレビュー**（`?trash=<id>`）。repo を switchTo してから表示。
- `readTrashDetail(root, id)`（issues.ts）: trash store から **issue.md body / spec.md / thread.json** を直接読む（worktree も git も触らない）。`TrashDetail` 型。
- **プレビュー内容**: タイトル＋削除日時＋branch＋PRリンク（`TrashMeta.prUrl` 追加・trash 時に保存）＋Issue 本文＋Spec＋活動ログ（ThreadTimeline 再利用）。
- **その場で操作**: 「復元」（→該当 issue を開く）/「完全に削除」（確認付き・worktree/branch も purge）。
- サイドバー GlobalTrash 行はタイトルをクリック可能化＋選択ハイライト。

---

## DEC-029 (2026-06-12) — waiting 検知を idle ヒューリスティック → Claude hooks で決定論化

> CEO:「8秒沈黙判定は急かしすぎ。明確に判定できないの？ cmux はちゃんと Agent からのアクション待ちの時に通知できている」。正しい。cmux は Claude Code の hooks で検知している（env に `CMUX_CLAUDE_HOOK_CMUX_BIN` があったのが証拠）。

- **実機検証**: `claude --settings '{"hooks":{"Stop":[...],"Notification":[...]}}' -p ...` で **Stop hook が発火し events ファイルに追記される**ことを確認（`--settings` は file/JSON 文字列を受ける、hooks は Stop/Notification/SubagentStop 対応）。
- **方式**: claude 起動時に `--settings` で **Stop/Notification hooks** を注入し、`<root>/.bezier/agent-events/<issueId>` に1バイト append させる（`agentHookSettings()` が JSON 生成）。
  - **waiting = events ファイルが spawn 後に増えた（hook 発火＝ターン終了/入力要求）**。idle 時間は一切見ない。
  - **解除 = user が pty に入力した瞬間**（`pty_write` で awaiting=false ＋ events baseline 更新）。
  - baseline は **spawn 時の events ファイル長**（Rust `pty_spawn`）。前 session の残りで誤発火しない。親ディレクトリも spawn 時に作成。
- **Rust**: `Session` に `awaiting` / `events_path` / `events_seen_len`。`pty_statuses` から `waiting_after_ms` 引数を撤去し hook ベース判定に。`PtySpawnOpts.events_path` 追加。
- **JS**: `agentHookSettings(path)`、`PtySpawnOpts.eventsPath`、`ptyStatuses()`(引数なし)。terminal→use-implement-session→agent-panel に `eventsPath` を配線。`WAITING_AFTER_MS` 撤去。
- **限界**: hooks は claude 専用。codex 等 hook 非対応 agent は waiting を出さない（done/error は exit で出る）。8s 誤検知が無くなるので体験は改善。
- B（visual review / Figma comment 風）= `playbook/ideas-backlog.md` に着手予定で記録。C/D も同ファイルに idea として保存。

---

## DEC-027 (2026-06-12) — status は手動廃止 → 事実から派生する読み取り専用バッジ

> CEO:「status 本当に必要？ 少なくとも手動はやめたい。IDE/Agent オーケストレーションツールだと普通どう設計する？」。整理: 課題管理系(Linear/Jira)は手動＋他人への進捗共有が主目的、Agent オーケストレータ(Cursor/Zenbu)は明示 status を持たず作業の事実から派生。Bezier はソロ×Agent並行なので後者が素直。CEO 選択=「派生バッジ」。

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

- **削除＝ゴミ箱へ退避（可逆）**: `.bezier/drafts/<id>-<slug>` と thread を `.bezier/trash/` に **move（rename）**。**git（worktree/branch）は触らない** → 完全に復元可能。`.trashed.json`（deletedAt / branch / worktreePath）を folder 内に残す。
- **30日 auto-purge**: Issue 一覧マウント時に `expiredTrash`（deletedAt + 30日 ≤ now）を `purgeTrashed` で完全削除。
- **ゴミ箱一覧 UI**: ヘッダの「ゴミ箱（N）」トグルで一覧表示。各エントリに **復元**（move-back）と **完全に削除**（手動・確認付き）。「あと N 日で完全削除」を表示。
- **完全削除だけが破壊的**: worktree `--force` 除去 ＋ branch `-D` ＋ trash folder 削除。これは手動 or auto-purge 時のみ。
- **Rust `move_path`（rename）を新設**: `..` 拒否＋ source と dest parent が **両方 `.bezier` 配下**であることを必須化。`remove_path` と同じ堀。
- 旧 `deleteIssue`（即物理削除）は廃止し `trashIssue` に置換。TTL 定数 `TRASH_TTL_DAYS = 30`。

---

## DEC-019 (2026-06-12) — 起票（Issue）の削除機能を追加

> CEO:「起票の delete 機能が欲しい」。これまで Issue は作成のみで削除導線が無かった。

- **削除導線を 2 箇所**: ① Issue 一覧の各行（hover で trash ボタン）② Issue 詳細ヘッダ（status の隣に trash）。確認ダイアログ付き（不可逆）。
- **削除＝完全パージ**: ① worktree ref があれば `git worktree remove --force` ＋ `branch -D`（in-progress な Issue を消しても worktree を orphan しない）② Issue フォルダ `.bezier/drafts/<id>-<slug>` ③ 活動スレッド `.bezier/issues/<id>` を削除。詳細から消す時は preview を stop してから purge → 一覧へ戻る（unmount で terminal も片付く）。
- **Rust `remove_path`（再帰削除）を新設**: `..` traversal 拒否＋**解決後パスが `.bezier` 配下にあることを必須**化（実 repo ファイルは消せないガード）。不在パスは no-op。
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
- **main 汚染対策**: 高頻度（毎イベント=implement/rerun/sync…）は main に出さない（ローカル `.bezier/`）。**低頻度の確定記録だけ**を残す（issue 1個＝数commit）。
- **共有は "ローカル作業 ⇄ 共有 SoR" の adapter**（runner 抽象化と同型）: 出力先を git / cloud / Notion 等に差し替え可能に。
  - **(短期/solo)**: ローカル `.bezier/` で個人が扱える（今）。git 昇格は必要時。
  - **(本命/team plan)**: 共有バックエンド（Bezier cloud / Notion 等 = DEC-047 P3 / 旧 open-core cloud SoR）。**team plan 実装は後・必要な時**。
- **solo-first**: まず CEO 個人が扱える状態を優先。team 共有インフラは投機的に作らない。
- 現状の実装（全部 `.bezier/` ローカル）は solo には十分。docs/issues 昇格＋team backend は将来の adapter 実装で。

---

## OPEN-001 (2026-06-12) — merge 安全層（Issue branch の衝突対策） → ✅ CLOSED（DEC-077, 2026-06-14）

> **解決済み**: ①behind 可視化 ②Sync with main ③衝突チェック付き merge は Ship IA 期（DEC-052/058）に実装済みだった。2026-06-14 に base ブランチのハードコードという唯一の実バグを修正して close。詳細 = [[DEC-077]]。④運用規律はコード外ルールとして継続。以下は当時の起票内容（履歴）。


> CEO 懸念: 別路線(直接 main commit)と Bezier の Issue branch が並行すると merge 時に衝突しないか / Issue が増えても安全に merge できるか。

- **現状の安全**: Accept=branch に commit のみ(main 不触, DEC-008/G1')・worktree 隔離・Discard 後始末。**Accept 自体は安全**。
- **欠けている安全層**: ①branch の "N commits behind main" 可視化 ②**Sync with main**(worktree で main を取り込み衝突を隔離内で解決) ③衝突チェック付き merge/PR ④運用規律(小さいIssue・早めmerge/discard・2路線で同一ファイル同時編集を避ける)。
- **生の例**: dogfood Issue「themeを増やす」と、直接 main に入れた Light/Dark が二重 → dogfood 実験 Issue(theme/shortcut/remove-setting)は Discard 推奨。
- **Bezier 自己開発の当面ルール**: CoS(直接 main) と CEO(Issue branch) が同じファイルを同時に触らない / Issue branch は早めに merge or discard。
- **→ slice 4 圏で「merge 安全層」を実装**（Issue が大量化する前に）。

---

## DEC-013 (2026-06-12) — Preview = platform 別 pluggable runner / Tauri は「本物の窓」を目標

> dogfood で Bezier 自身(Tauri)の Web プレビューが `__TAURI_INTERNALS__` undefined で落ちた。CEO: web 優先は維持しつつ Bezier を Bezier で改修したいので Tauri を先に対応。

- **ループは platform 非依存**（git＋agent）。platform 依存は **Design プレビュー面だけ** → **Preview Runner を platform 別に additive に足す**（web=iframe ✅ / tauri=本物の窓 ★ / electron / ios / android / fallback=diff+スクショ）。「Mac アプリ＝Tauri だけでない」のでパターン毎に runner 追加。
- **Tauri は iframe モックでなく本物の窓を spawn**：親(3210)と iframe(worktree port)が別オリジン→外からモック注入不可＋native は inert。忠実な preview＝`npm run tauri dev` を worktree で起動（native も実際に動く）。
- **(b) Tauri runner の工事**: ①`src-tauri/target` も clonefile（cargo 再ビルド回避）②dev ポートを worktree 用に上書き（Bezier tauri.conf は 3210 ハードコード）③spawn/kill ライフサイクル＋Design は「別窓起動」status 表示 ④`src-tauri/` 有無で runner=tauri 判定。
- (a) 応急（web 層を Tauri 不在で degrade）は保険として後回し。mobile は web 実証＋需要後。
- 全文 = `playbook/strategy/2026-06-12_preview-runner-roadmap.md`。

---

## DEC-012 (2026-06-11) — ループは「一方通行」でなく「反復」: 作りながら仕様が磨かれる / 仕様も LLM と共同

> dogfood で CEO: 「Spec を書いてから実装、の一方向しかできないのが気になる。実際は作りながら仕様が磨かれる。仕様の検討も LLM と一緒にやりたい」。Bezier の思想（ウォーターフォールでなく**反復ハーネス**）を UI に効かせる。

- **反復ループ**: 「Spec → Implement（一発）」でなく、**(AI支援で)Spec → Implement → Preview(視覚) → Spec を磨く → Re-implement → … → Accept** の**サイクル**。worktree/branch は採用まで持続し、spec・code・decision が**共進化**する。DEC-047 §3.1 の「順序強制しない」を実装で具現化。
- **視覚レビュー（Preview）**: コード diff でなく **worktree の dev server を起動して iframe で実物を見る**（designer/PM の review 方法）。Product Board の preview を前倒し。→ slice 2.5。
- **AI 共同の仕様検討（2-1）**: Spec を **LLM と一緒に探索・記述**（spec エディタ内 AI アシスト＋既存画面参照）。→ slice 3。
- スコープ: **slice 2.5 = Preview ＋ 反復 re-implement**（review↔refine サイクル）。**slice 3 = AI-assisted spec ＋ 画面参照**（2-1）。

---

## DEC-011 (2026-06-11) — Issue slot をスリム化: Design slot 廃止 / Decision は手書きでなく自動

> dogfood で CEO が「Design 用 md は要らないかも / Decision md も本当に要る？」と違和感。AI-native フローでは Design＝コード diff・Decision＝PR+Spec+diff から導出、で手書き slot はセレモニー過多。

- **Design slot 廃止**: デザイン意図は Spec に内包、出力は **PR（コード diff）そのもの**。別途 Design md は二重なので作らない（DEC-047 §3.1 の Design 種別は "コード=デザイン" に統合）。
- **Decision は手書き slot をやめ、自動 draft に**: merge 時に issue+spec+diff から自動生成（DEC-047 §3.5 の「自動下書き」を正とし、手で `+Decision` する導線は削除）。
- **結果、Issue = `issue.md`（何を/なぜ）＋ `spec.md`（要件・任意で画面参照）＋ 実装（branch/PR）＋（自動）`decision.md`**。slot UI は Spec 中心にスリム化。
- 根拠: Bezier thesis「意図→AI実行→記録」。記録(Decision)は自動、デザインは実装に融合。slice 2（実装ループ）の中で確定。

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

## DEC-047 (2026-06-11) — IA（メニュー）& Issue モデル確定（一人Designer+PdM / repo-output / 非stepperフォルダ規約）

> 現状プロダクト（IDE 風）への CEO 違和感を起点に「メニューから決める」要件定義を実施。Concept A（改善ループ軸）を採択し Issue モデルまで合意。
> 全文・図・Issue詳細レイアウト・データモデル素案 = `product/specs/2026-06-11_ia-and-issue-model.md`。DEC-008 の docs/ レイアウトを issue 中心に精緻化する。

- **メニュー（Concept A）**: `Product`（実画面 Board・ホーム）/ `Issues`（改善の spine・Spec 内包）/ `Decisions`（ADR 集約）/ `Repo` ＋ `Agent` 常駐ドロワー。**Specs は top nav に出さない**（Issue 内）/ Inbox・Today 入れない / Product は Board（タイル）。ターミナルは常駐ドロワーへ降格。
- **P1 一人 Designer+PdM 第一**: 主ユーザー = Designer+PdM 兼務の一人（=ペルソナ楔=CEO）。チーム協業機能は後回し（形だけ拡張可能に）。
- **P2 repo-output でエンジニア協業が無料**: Bezier は「エンジニア用機能」を作らない。output=実 repo のコード+docs ＝ repo が統合面。下流（リリース品質）は既存 PR/git でエンジニアへ手渡し。**設計原則に格上げ**。
- **P3 SoR adapter（repo 既定 / Notion 後日）**: repo-files が canonical（agent ネイティブ読み・決定がコードと同 commit・drift harness の3強み）。Notion は後日の任意バックエンド/ミラー（正本化時は3強みを意識的に手放す）。**今は実装しない**。
- **P4 Issue が spine**: 旧「Improvements」→ **「Issues」改名**。全ては Issue 起点。**注釈は "起点" から "Issue 内で使う道具" に降格**。
- **P5 非 stepper = フォルダ規約 presence-driven**: Issue=フォルダ。slot（spec/design/decision…）が在れば表示・無ければ `+` で作る。順序強制なし（旧 Spec/Mock/QA/Build タブの waterfall 批判を踏まない）。status は軽い dropdown（open/in-progress/merged）。
- **データモデル確定（F1/F2/F3 + G1'/G2）**:
  - **採番=ULID**（F2・time-sortable/並行衝突なし・UIはタイトル表示）/ **issue.md を spec と別持ち**（F1）/ **design/ は必ずフォルダ**（F3）
  - **durable（PR経由で main へ）**: `docs/issues/<ulid>-<slug>/{issue.md, spec.md, design/, decision.md}`。**起票で main に直 push しない**＝ durable は実コード(src/…)と同じ reviewed PR で着地（レビュー/CI/branch protection を通る・why が what と同 commit）
  - **ephemeral（gitignore のローカル作業ストア）**: `.bezier/{drafts, issues/<ulid>/{status, annotations, worktree.json, thread}}`。**status は main に持たない**
  - **issue⇄PR（G2）**: branch 規約 `issue/<ulid>-slug` / durable リンクは issue.md frontmatter / volatile は .bezier worktree.json
  - **Issue一覧** = main の docs/issues/（共有）＋ local drafts（作業中）を UI 合流。**Decisions** = 全 decision.md 横断集約
  - **CTO 懸念で改訂**: 「main 直書き」は branch protection 破り/履歴汚染/status churn/PM状態とコード結合/monorepo競合 の問題 → durable=PR経由・ephemeral=local に分離して解消。**DEC-008 を精緻化**（.bezier=gitignore local / docs=issue中心 / durable=PR経由のみ）
- **既存差分**: Plate/terminal+handoff/Canvas iframe/fs は転用。ナビ刷新・file-tree起点廃止・terminal降格・Issues/Board/注釈/Decisions集約/git worktree(Rust)新規・Onlook除去(DEC-007)。

---

## DEC-008 (2026-06-11) — repo-as-SoR データモデル確定（docs/ 第一級 + .bezier/ 機械 / worktree / drift harness）

> 「実 repo に docs が溜まり、その上に見やすい UI を提供し、worktree で作業して生成物を repo に貯める」という CEO のメンタルモデルを、**共進化（オープンプロトコルで継ぐ）**の要請と整合させて確定。
> 全文・図・B監査・v0.5作業リスト = `playbook/strategy/2026-06-11_coevolution-positioning-and-repo-sor-model.md`。
> ⚠️ **DEC-047 で精緻化（こちらを正とする）**: docs は **issue 中心フォルダ**（`docs/issues/<ulid>/`）/ `.bezier` は **gitignore のローカル作業ストア**（repo内 machinery でない）/ durable は **main 直書きでなく PR 経由のみ**。下記の「flat な docs/specs+docs/decisions」「.bezier=repo内」は DEC-047 で上書き。

- **鉄則: Bezier は DB を持たない。正本は repo の中の markdown/yaml（git）**。独自ストアに正本を置くと囲い込み＝共進化前提（誰でも読めるオープン出力）が壊れる。DEC-006「正本＝ファイル&Git」を継承。
- **フォルダ2階層**:
  - `docs/specs/*.md(x)` ＋ `docs/decisions/NNNN-*.md`（**ADR 慣習を product/design に拡張**・発明しない）＝**人間に意味がある第一級市民**
  - `.bezier/`（screens.json / annotations / links.json / handoff）＝**ツール固有の機械machinery（非正本）**
  - 根拠: **non-lock-in を構造で保証**（Bezier を消しても docs/ が残る）。索引 = root `AGENTS.md`/`CLAUDE.md`
- **git 機構**: **worktree-per-change**（Superset 型隔離・複数並行）。**決定(why)とコード(what)を同じ commit/PR に載せる**（PR 本文＝決定SoRエントリ）。
- **drift harness**（melta `design:drift` 発想）: docs はループを通してしか変わらない＋docs↔コードの乖離を検出して**壊れて気づく**。これが「ハーネス駆動」の payoff＝docs を腐らせず生きた SoR に保つ。
- **traceability**: spec↔screen↔annotation↔decision を `.bezier/links.json` でリンク。UI 価値の核は「並べる」でなく「辿れる」。
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
- **agentation/melta は競合でなく部品**: agentation=注釈→markdown で止まる（記録しない）/ melta=デザインシステム+harness。Bezier は注釈を**入口 modality に過ぎない**ものとし、編集を実行し**決定SoRに刻む**（DEC-008 ループ）。
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

> DEC-004（PAUSED）を解除。再開トリガー③（Bezier 資産を別アングルで再利用したい）+ 新トリガー（自分用ツールとして作り切る意思）が成立。

- **決定**: Bezier を **再開**。賭ける層を **engine（コモディティ化する側）→ レイヤC（設計/プロダクト意思決定の SoR・記憶 + ベンダー横断オーケストレーション）** に移す。
- **再評価の根拠（2つのイノベーター観測）**:
  - **Superset**: vendor-agnostic な複数コーディングエージェント指揮者として急伸。**ベンダーがネイティブ機能を出すほど束ねる対象＝燃料が増える**（DEC-004 の pause 理由のちょうど裏返し）。エンジンを自作せず上の調整層に立つのが勝ち筋。
  - **Claude デザイナーの働き方**（Meaghan Choi）: "designers ship code, engineers design" / pod = 5 AI Builder + 艦隊。価値は**働き方＝プロセス**側。ただし Anthropic は **Claude Design** を公式リリース済 = 生成エンジン層はネイティブが侵食中（engine を捨てる判断を補強）。
- **空白の確認**: コーディングagentオーケストレーション層（Superset/Conductor/Vibe Kanban/cmux…）は混雑＆無収益。生成エンジン層はネイティブ侵食。**「デザイン/プロダクトの意思決定（spec・採否・QA・ブランド整合・なぜ）をエージェント横断で貯める SoR」は誰も占有していない** = Bezier の未検証 SoR層と一致。
- **Founder = First User の成立**: CEO は既に手作業で SoR層を運用（`decisions-log.md`/`approval-queue.md`/`session-handoff.md`/`memory`/仮想法人 Subagent）。MEMORY.md が Claude Code メモリ案の原型だったのと同型 → **製品化＝自分の運用の載せ替え**が最短 dogfood。
- **スコープ意思（CEO 明示）**: 「**基本的に自分用ツールにもなるから、しっかり作り切りたい**」= dogfood-first。WTP問題（デザイナー/PMはツールに金を払わない懸念）は OSS open-core + 自分用価値が先に立つので後回し可。
- **コア定義**: Superset が「**コード**を書く指揮者」なら、Bezier は「**プロダクト/デザインの意思決定を束ねて貯める指揮者 + 台帳**」（Sierra「プロセスのSoR」の design/PM 版）。
- **最大の時限リスク**: Claude Code 等が「設計判断の恒久記録」をネイティブ統合した瞬間にレイヤCも侵食される。窓が開いている今のうち。→ 定期ウォッチを継続タスク化。

---

## DEC-004 (2026-06-05) — プロジェクト一旦停止（PAUSED）

- **決定**: Bezier を **一旦停止**する。撤退でも放棄でもなく、いつでも再開可能な pause。
- **理由**: LLM/コーディングエージェント自体の進化が速く、**Codex が preview 機能を出した**。今日 de-risk した「楔のエンジン（既存repo→実部品でモック生成→render）」は、**エージェント側がネイティブに担い得る領域**（= DEC-002 §5 で名付けた「ハーネス競合リスク」が現実化しつつある）。最もコモディティ化しやすい部分を、技術不確実性を負って自前で建て続ける合理性が下がった。
- **今日 validated（◎）**: エンジンは実際に動く — extract(L1)/generate(鍵なし・自分のClaude Code)/実部品 render/auth壁を越える revertable shim。楔の技術リスクは消えた。
- **未 validated（×・本当の問い）**: **SoR層（maker ループの spec/decision/QA・チームの設計記憶・承認ゲート）に独立した需要・引きがあるか**。エンジンがエージェントに吸われるなら、製品を支えるのは SoR 層単独になり、その検証が未了のまま。
- **再開トリガー**: ① SoR/maker-loop 層に独立した需要があるという確信が立ったとき（顧客会話で）/ ② エージェントのコモディティ化の見え方が変わったとき / ③ 他の「固い問題」を SoA→SoR フレームで攻める素体として Bezier 資産を再利用したくなったとき。
- **資産の状態**: コード（spike/ = 使い捨てエンジン, app/ = グレースケールUI・ダミーデータ）・全ドキュメント・DEC-001〜004 はそのまま保全。dev server 全停止・対象 repo git クリーン（痕跡ゼロ）。
- **姿勢**: 「ダメな仮説の上に建て続けない」= Anthropic Idea Stage の正解。code is not the asset — 今日蓄積した判断（DEC-002/003 と検証結果）が資産として残る。

---

## DEC-003 (2026-06-05) — preview は revertable shim で実 repo の壁を超える

> ISSUE-004 で判明：汎用 preview を実 repo に当てると **auth gate / provider / 複雑props** が必ず描画を止める。これを超える方針を確定。

- **決定**: Bezier の local preview は、対象 repo に **管理された一時 "preview shim"**（auth bypass + provider wrap）を適用してよい。
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
- **ライセンス = fair-code（n8n の Sustainable Use License 型）に確定**（CEO承認 2026-06-05）。ソース公開・self-host 自由・**Bezier を SaaS として再販するのは禁止**（Elastic/Redis の罠を回避、moat 防衛）。純OSS(MIT)/BSL は却下。
- **アーキ = ローカルエンジン + クラウド SoR ハイブリッド**:
  - **ローカル（CLI daemon, npm）**: repo ingestion（L1 AST / L2 screenshot / L3 scene-graph生成）/ モック生成 / sandbox render / コーディングエージェント（Claude Code/Codex）への委譲（ユーザー自身の AI サブスクで実行）。クラウドへ送るのは scene-graph / spec テキスト / PNG のみ（ソースコードは出さない）。
  - **クラウド SoR（Supabase + Vercel）**: spec/decision/QA/design issue の永続、scene-graph 版管理、canvas（Liveblocks）、チーム共有・invite・課金。**これが moat の実体（Sierra プロセスのSoR）**。
- **技術linの根拠**: Claude **Agent SDK**（`@anthropic-ai/claude-agent-sdk`）で Claude Code のハーネスを埋め込み、SDK更新で新モデル/tool-useループ/MCP/hooks を自動継承（=「Modelを足すだけ」問題の解）。third-party は claude.ai ログインを代理提供できないが、local/OSS モデルではそれが前提なので制約にならない。Codex は等価SDKなし → Claude Code 先行、agent-agnostic 抽象化は後。
- **影響**: ISSUE-001 の「生成テスト=APIキー待ち」は**ユーザーの Claude Code サブスクで実行**に変更し解消。`spike/extract.mjs` を CLI に昇格（→ ISSUE-002）。enterprise security（コードがクラウドに出ない＋監査可能OSS）が差別化に。

---

## DEC-001 (2026-06-04) — Bezier 設立・会社OS採択

- **プロダクト**: AI-native PdM+Design ツール。Spec→Design→Mock→QA を一人の maker が回す。Personal-first → dogfood → SaaS。
- **アーキ**: ピュア Web SaaS（Next.js/Vercel + Supabase + Claude API `@anthropic-ai/sdk`）。Day1 からマルチユーザー/チーム共有/課金前提。
- **楔**: 既存 repo → コンセプトモック（実パーツ流用 → Figma風canvas編集）。
- **コードネーム**: `Bezier`。置き場所 `~/Workspaces/Personal/projects/bezier/`。
- **会社OS**: 本ディレクトリ構成 + エージェントチーム（COO + 専門家5 + ペルソナ4）を採択。
- **根拠**: 起ち上げプラン `~/.claude/plans/cuddly-cuddling-crane.md`、戦略 doc `playbook/strategy/2026-06-04_Bezier-thesis-v1.md`。
