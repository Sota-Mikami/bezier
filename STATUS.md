<!-- 最終更新: 2026-06-17 / DEC-114 共有体験修正5点(アプリdeploy=vercel project add先行作成+--project小文字·Specチェックボックス/ネスト·Made with Bezierはfooterのみ·タブ横スクロール·共有ページにショートカット=CSP sha256許可)·本番10:21反映·要CEO再共有確認 / DEC-113 dogfood体感改善3点(チャット色=pty TERM/COLORTERM·Live切替の重さ=iframe常時マウント·サイドバー縦移動⌘⇧↑↓)·本番09:28反映 / DEC-112 「入り口(Live)」実装完走＋どんなwebスタックでも開ける堅牢化(出力URL検出·nvm最新Nodeフォールバック·packageDir検証自己修復·PATH/agent再検出·devスクリプト名拡張·iframe不可→ブラウザ案内·Issue Preview worktreeへ.env symlink·Nodeピンを.node-versionでも読む)·全本番反映済(23:09ビルド) / 「またエラー」の真因=コードでなく古いバイナリ稼働(動作中プロセス21:54起動<修正22:21·ditto後は⌘Q→再起動まで案内必須) / DEC-111 repo readiness設計 / DEC-108 i18n 全部日英 / DEC-107 i18n基盤 / DEC-106 CPを履歴ドロワーへ / 中央IA確定(Design/Prototype 2エリア·Map·グローバル注釈モード) / DEC-105 Document View・状態=受入基準・Clarify=skillマーケット·Implement=Preview -->
# Bezier — 現在地

> **新しいチャットへ**: まずこの「オンボーディング・サマリ」(§0〜§5) を読めば、**何のサービスで・何を目指し・今何ができ・次に何を検討しているか**が分かる。詳細な意思決定は `playbook/decisions-log.md`（DEC-###・逆時系列）、憲章は `COMPANY.md`、時系列の作業ログは本ファイルの §6 以降（過去の append ログ）。

---

# 📌 オンボーディング・サマリ（2026-06-15 時点）

## §0. これは何か / 何を目指すか
- **Bezier = AI-native な PdM+Design ツール**（Tauri 製のデスクトップアプリ）。PdM/Designer/Engineer/QA の境界を溶かし、**一人の「maker」が Spec → Design → Implement → Ship → 共有 を連続で回せる**世界の業界標準を狙う。
- **作り方**: Personal-first（CEO 自身が日々 dogfood）→ SaaS 化。収益は **open-core**（ローカルの maker ループは無料 / ホスト共有・チーム・SSO は有料）。
- **moat の核**: Bezier は **ユーザー自身の repo の中で・ユーザー自身の coding agent（claude/codex）に委譲**する。だから各 repo の `CLAUDE.md`/`design.md`/custom skills/MCP/memory が**そのまま土台として継承**される（[[bezier-inherits-repo-conventions-moat]]）。実行がコモディティ化する世界で、Bezier は **maker の意図・判断・決定の記憶**を握る層。
- **戦略フレーム**: 「固い問題」/ Sierra（既存 SoR の上に立つ SoA）/ Anthropic AI-Native Playbook。適用 = `playbook/strategy/2026-06-04_Bezier-thesis-v1.md`。**現ステージ = Idea→MVP（build≠検証。dogfood で芯を証明中）**。

## §1. プロダクトの形（アーキ）
- **スタック**: Tauri v2（殻）/ Next.js 15・React 19・Tailwind v4（UI・単一 React web）/ xterm.js + Rust portable-pty（ターミナル）/ Supabase（将来のクラウド SoR）/ Claude API。
- **エンジンは持たない**: コード生成は**ユーザーの coding agent を pty で起動**して委譲（Bezier は指揮者＝オーケストレータ）。Rust 側は fs + pty + git コマンドのみ。
- **データモデル**: Issue = フォルダ（ULID）。durable（`issue.md`/`spec.md`/`design/`/`decision.md`）は実コードと同じ **PR 経由で main へ**。ephemeral（`.bezier/` の drafts/status/worktree）は gitignore。変更は **worktree-per-change**。
- **dev = `cd app && npm run tauri dev`（:3210）/ 日常使い = ビルド済み `.app`（/Applications/Bezier.app）**。

## §2. 今できること（実装済み・dogfood で動く）
- **メインループ**: 起票 → **Clarify**（着手前の確認3-5問）→ **Spec**（受入基準=完成の定義 DoD）→ **Design**（スタック非依存の自己完結 HTML 別案を発散）→ **Implement**（worktree でユーザーの agent が実装）→ **Verify**（Bezier が証拠を Spec に集約・採点は maker）→ **Ship**。
- **中央 = Design / Prototype の2エリア**（Double Diamond・中央IA確定）。**Design** = ドキュメント（Spec軸＋`<id>/docs/`自動一覧・agent生成md も拾う）と**デザイン案(html別案)**を1列のピア・タブに統合（⌘1–9 / ドラッグ並べ替え）。**Prototype** = **Preview / Map / QA**。⌘⇧[ ]でエリア切替。Implement=Preview のみ（Diff/Code 廃止→生diff/コードは PR/IDE へ。DEC-105）。
- **Map** = issue のスコープ画面を実 worktree アプリの**ライブ縮小 iframe** で俯瞰（スコープ＝ルート＋開始は per-issue・`.bezier` 保存で PR に入らない）。
- **グローバル注釈モード**（⌘⇧A）: comment / pen を**全面横断**（Design ドキュメント・デザイン案・Preview・Map・QA）で使い、Agent への修正依頼に。
- **チェックポイント**（毎ターン前に自動 commit）。**手動UIは「履歴」ドロワーへ移設**（DEC-106・top-bar から撤去）＝最新＝現在地／他＝「◯つ前の状態 / ここに戻す」。merge 時 squash。
- **言語切替（en/ja・DEC-107/108）**: Settings → Language で UI・**Agent への指示文**・共有ページ・活動ログまで**全面が即座に英⇄日**（既定 en・型で en/ja パリティ担保・activity ログは描画時ローカライズ）。
- **Ship**（Sync / Open PR / Merge）。**Merge to main は確認ダイアログ**、設定「main の保護」ON で PR 強制（DEC-099）。
- **共有**（自分の Vercel に publish）: メニューで**共有する内容を選ぶ（アプリ / デザイン / Spec）→「共有する」→ 1本の URL**（Bezier 生成の1枚ページ＋"Made with Bezier" バッジ）。**パスワード保護**（クライアント側 AES-GCM 暗号化・Hobby 対応）。公開アカウントは repo ごとに使い分け（DEC-098・100・101・102）。
- **拡張/速度**: `/bezier:*` スラッシュコマンド（UI 管理＋export/import パック）・⌘K コマンドパレット・ショートカット一覧（`?`）・⌘W/⌘Q ガード。
- **ブランド**: 完全モノクロ・ペンツール由来ロゴ（DEC-048）。LP =「創刊号」雑誌（DEC-049・`site/`・未公開）。

## §3. 直近の状態（本番反映の境目）
- **dev に反映済み（2026-06-16 までの全部）**: 中央IA確定（Design/Prototype 2エリア・Map・グローバル注釈モード）・チェックポイントを履歴ドロワーへ（DEC-106）・**i18n 全部日英（DEC-107/108）**。さらに前回分の共有 UX 一新（DEC-100/101/102）・Merge 確認/main 保護（DEC-099）・パスワード保護。各段 tsc/eslint/vitest(23)/build green。
- **i18n の要点（DEC-107/108）**: 依存ライブラリなしの型付き i18n（`src/lib/i18n/`・en 既定・型で全言語の鍵パリティ）。Agent 向け文言は `src/lib/prompts.ts` に en/ja co-located（将来の多言語同時チューニング＋eval を見据えた配置・[[prompt-tuning-multilingual-eval]]）。活動ログの自由ノートは**描画時**ローカライズ（書込時に言語凍結しない）。
- **🐛 共有失敗の修正（DEC-102・既出）**: 大文字 ULID dir→Vercel 400 を `bezier-share/<小文字 id>` で修正済み。
- **✅ 本番 `.app` 反映済（2026-06-17 10:21 ビルド）**: IA確定 / Map / 注釈モード / CP移設 / i18n全部日英 / repo readiness（DEC-111）/「入り口(Live)」堅牢化＋worktree env mirror＋`.node-version`（DEC-112）/ dogfood 体感改善3点（DEC-113）に加え、**共有体験修正5点（アプリ deploy ＝`vercel project add` 先行作成＋`--project` 小文字名で Preview/Map/QA が乗る・Spec チェックボックス/ネスト・Made with Bezier は footer のみ・タブ横スクロール・共有ページにアプリ同等ショートカット）（DEC-114）**まで全て `/Applications/Bezier.app` に反映済み。⚠️ project 作成→deploy 解決は CLI 実証済み。未検証はリモートビルド成否（ユーザーのアプリ次第）＝CEO 再共有で確認。日常使いの `.app` が最新。再ビルド時は `npm run tauri -- build --bundles app` → `/Applications` へ **`ditto`**（[[bezier-prod-app-for-daily-use]]・`rm -rf /Applications` は権限拒否されるので ditto で in-place 置換）。反映確認は**バイナリ mtime**＋新コマンド grep。⚠️ **ditto はファイルだけ差し替え、起動中アプリはメモリ上の旧コードを使い続ける → 反映後は必ず「⌘Q→再起動」まで案内**（2026-06-16 夜の「またエラー」はこれが真因＝動作中プロセスが修正前 21:54 起動だった）。[[prod-update-timing-dogfood]]。
- **🚪 入り口(Live) = どんな web スタックでも開ける（DEC-112・[[live-preview-robustness]]）**: 「web である限り Live を開け、環境不備は最大限案内してユーザーに責任を渡す」を達成。
  - **readiness（DEC-111 P1〜4 完走）**: 準備チェックリスト（Node pin 未／依存 無／lockfile 古い／.env 無）＋1クリック修正＋［全部準備する］／git 鮮度の非ブロッキングバナー＋安全 ff-only ［最新化］／setup ハンドオフ（開くだけ）／サイドバー repo バッジ。秘密値は絶対触らない・ブロックしない。SSOT = `playbook/research/2026-06-16_repo-readiness-design.md`。
  - **どのスタックでも起動（dogfood で確立）**: ①**ポート推測をやめ dev サーバーの出力 URL を読む**（固定ポート/`run-p`/入れ子モノレポ/衝突に強い）②**pin 無しは nvm 最新 Node**（古い system Node 回避）③**packageDir を検証・自己修復**（壊れた保存値を無視）④**dev スクリプト名拡張**（dev/develop/serve/start）⑤**iframe 不可を検知**して［ブラウザで開く］案内⑥失敗時は OUTPUT＋［ターミナルで起動］で詰ませない。
  - **GUI 起動の落とし穴も解消**: Finder 起動の最小 PATH に nvm/Homebrew/local を補正・claude/node を発見／エージェント再検出 UI／`node_modules` は `pathMtime` 直接確認（`list_dir` は除外する）／nvm は grant 回避で読む／RepoLive を root で key（2リポ混線解消）。
  - **Issue Preview（worktree）も env を揃える**: worktree は gitignore された `.env` を持って来ない → 実 repo の `.env*`（ルート＋ワークスペース）を worktree へ **symlink**（`mirror_worktree_env`・秘密複製なし・追跡済みは上書きしない）。`.env` 依存のどの repo の Issue Preview でも動く。
  - **残（実際に当たったら）**: 非nvm版管理（fnm/asdf/volta）／2階層以上深いモノレポでルートに dev 無し／Node 以外の web スタック。

## §4. 次に検討する機能（backlog・`playbook/ideas-backlog.md` が正本）
- **共有体験(§F)**: プリセット（クライアント用/ハンドオフ用・ブランド別）/ 送る前プレビュー / 空の層はトグル非表示 / アクセス制御（ドメイン・viewer セッション）/ env を OAuth Connect で easy×secure / multi-host（Netlify/Coolify）/ **実アプリ自体の保護**（Vercel Pro Deployment Protection か OIDC）。
- **Review(§B・moat)**: 要素ピックの精密セレクタ等の残。
- **速度(§C)**: スプリットビュー（2 issue 並べ・並行 Agent）。
- **品質(§D)**: チェックポイントの設定 on/off・保存ラベル・間 diff。
- **配布(§E・GTM)**: **skills/agents マーケットプレイス**（"継承される土台"を共有可能に・コンテンツ＝獲得チャネル）。
- **収益**: open-core（無料=ローカル / 有料=ホスト共有リンク・チーム・SSO）。SaaS 期に。

## §5. 起動 / dogfood
```
# 開発（最新コードを試す）
cd ~/Workspaces/Personal/projects/bezier/app && npm run tauri dev   # → :3210, ネイティブ窓が開く
# 日常使い（ビルド済み本番アプリ）= /Applications/Bezier.app
```
- 共有を試すには `vercel` CLI のログイン（`sota-mikami`・team `bezier`）が必要。tsc/eslint は各変更で green を維持（`cd app && npx tsc --noEmit` / `npx eslint <files>`）。

---

# 📜 §6. 時系列セッションログ（過去・append・新しい順）

## ▶ 2026-06-15〜16 セッション（中央IA確定 / CP移設 DEC-106 / i18n 全部日英 DEC-107・108）
- **中央IA確定 + Map + グローバル注釈モード**: 中央を **Design / Prototype の2エリア**に（Design=ドキュメント＋デザイン案を1列統合 / Prototype=Preview·Map·QA）。**Map**＝スコープ画面の実アプリ・ライブ縮小ビュー。**注釈モード(⌘⇧A)** を全面横断 MODE 化（共有 AnnotationLayer + 面別 surface）。注釈ツールバーは Comment+Pen に簡素化。
- **DEC-106 チェックポイント → 履歴ドロワー**: 「価値の核は『戻せる安全網』」と整理し、top-bar から撤去（注釈/共有/Ship の3つに）。「戻す」を History ドロワーへ（最新＝現在地／◯つ前の状態＋ここに戻す・SHA非表示）。自動CP は ON 既定のまま。
- **DEC-107 i18n 基盤**: 依存なし・型付き（`t("...")`・en 既定・型で en/ja 鍵パリティ・`{placeholder}`補間・未訳は en→鍵フォールバック）。locale は settings（localStorage）。**Workflow（多エージェント）で 24 UIファイルを並列移行 → 単一 catalog-writer → 検証**（24/24・repair 0）。
- **DEC-108 全部日英（CEO「全部日英用意したい」）**: UIクローム＋**Agent 指示文（注釈→修正・採用・コンフリクト・実装/別案 handoff・BEZIER.md ガイド）**＋Spec/doc 雛形＋共有ページ＋shortcuts＋publish/preview トースト＋verify 証拠＋`/bezier:*` パック＋PR body＋**活動ログ（描画時構造化）**まで全て locale 追従。agent 文言は `src/lib/prompts.ts` に en/ja co-located。横断バグ修正（`qa.ts` の `根拠|evidence` 両対応・EN test）。co-located な ja ソース以外に日本語リテラルはゼロ。
- 全コミット gitleaks クリーン・各段 tsc/eslint/vitest(23)/build green。**本番 .app 未反映（dev のみ）**。

## ▶ 2026-06-15 セッション（DEC-099〜102 — 共有 SaaS の磨き込み＋Merge 安全化）
- **DEC-100 共有を1動線に統合**: 「ジャーニー」名詞を廃止し「**共有する内容を選ぶ→共有する→1URL**」に。`use-publish` の publish を await 可能化（アプリを publish→URL を共有ページに埋め込み）。
- **DEC-101 共有内容の UX**: 言い換えず**UI の言葉のまま**（アプリ/Spec/デザイン）＋**1行説明**（タブ tooltip 由来）。Checkbox→説明付き行。Principal Designer＋persona 3名レビュー＝`playbook/research/2026-06-14_share-content-ux-review.md`。
- **DEC-102 失敗修正＋3対象＋パスワード**: 共有失敗の根因（大文字 ULID dir→Vercel 400）を特定し小文字化で修正。対象を**アプリ/デザイン/Spec の3つ**に（「開発の記録」削除）。失敗時に実ログ末尾を UI 表示。**パスワード保護**＝クライアント側 AES-GCM 暗号化（往復を Node で検証・パスワードは非保存）。eye アイコンで表示切替。
- **DEC-099 Merge 安全化**: Merge to main に**無条件の確認ダイアログ**＋設定「**main の保護**」（ON で PR 強制＝GitHub branch protection 思想・既定 OFF）。
- 全て **tsc/eslint PASS・dev 反映済み**。**本番 .app 未反映**（次の区切りで）。

## ▶ 2026-06-14 セッション（DEC-089 — サイドバー UX: +撤去・…を見出しへ・Issue 行に…メニュー）
- CEO 指摘。repo の hover アクションが `top-1/2`＝group 全体の中央に浮いていた → **`+`撤去・`…`を見出し行（`top-1`）へ**。
- **Issue 行に hover の `…` メニュー新設**（削除＝ゴミ箱へ）。行を div>button+絶対…に再構成。親 `handleDeleteIssueRow`（trashIssue→reload）。Rust 変更なし・tsc 0・eslint 0。

## ▶ 2026-06-14 セッション（DEC-088 — コミット/CP 管理の横断レビュー＋整理）
- CEO「手動コミット/remove との兼ね合い・横断的に違和感ないか確認して」。DEC-087 後を点検。
- **実害発見＆修正**: Merge が未コミット分を取りこぼす（Sync/PR は dirty 先コミットするのに Merge だけしない）→ DEC-087 で「全部保存済み」の錯覚が出て悪化。→ **`mergeToMain` も dirty を先にコミット**。
- **整理**: コミット入口が3つ（Ship「Commit」/ CP「いまを保存」/ 自動）で重複 → **Ship の「Commit」撤去＋`handleAccept` 削除**、手動保存は CP「いまを保存」に一本化。モデル＝**進行中（自動CP＋いまを保存＋戻す）／確定（Ship・未コミ自動コミット＋squash）／Discard**。Rust 変更なし・tsc 0・eslint 0。
- prod 反映済み: 〜DEC-084。**DEC-087/088 未反映**。

## ▶ 2026-06-14 セッション（DEC-087 — 自動チェックポイント＋ main squash）
- ideas-backlog §D／DEC-080 後続。**ターン開始時（idle/waiting→running）に前ターンの結果を自動コミット**＝「覚えてなくても1ターン戻せる」。開始時にした理由＝終了時だと未コミット Diff が空になり証拠収集と競合。現在ターンは未コミットのまま＝Diff/Commit/証拠収集は不変。`autoCheckpoint`（QUIET・clean はスキップ・thread 汚さない）。
- **main マージ squash**: Rust `git_merge_to_main` を `--squash`→1コミット化（WIP CP を畳む）。3重ガード維持。Rust 変更あり（dev は tauri が再ビルド）。tsc 0・eslint 0・cargo Finished。
- prod 反映済み: 〜DEC-084（DEC-085/086 は撤回なので無関係）。**DEC-087 は未反映**。

## ▶ 2026-06-14 セッション（DEC-085 — Before/After 視覚比較スライダー＝§B moat 本丸）
- ideas-backlog §B「最優先の差別化」。接地で**スクショ機構が既存**（DEC-045/046 の captureShot/loadImageDataUrl）→ 再構築不要、スライダー UI を足すだけ。
- Preview ツールバーに「Before/After」→ いまをキャプチャ→比較モード。frame に before 画像を重ね、中央仕切りを左右ドラッグ（左=before/右=ライブ after・`clip-path`）。比較中は iframe pointer-events-none＋注釈レイヤ隠す。再固定/解除。Rust 変更なし・tsc 0・eslint 0。
- 後続: ターン開始時の自動 before / 画像×画像比較 / Design A/B。既知制約: スクロール/リサイズでズレ（同表示で撮る前提）。

## ▶ 2026-06-14 セッション（DEC-084 — Issue の repo を「開いた後・作業開始前まで」変更可 / DEC-083 撤回）
- CEO「入り口で1回選ぶより、開いた後に default 表示＋切替が良い（選び忘れ防止）。①開始前は切替可 ②ヘッダ表示 ③ホバー切替 ④開始後ロック。ファイル作成を遅らせられる？」
- **回答**: 遅延は侵襲大（層がフォルダ前提）→ **即作成維持＋作業開始前は drafts フォルダ移動**で同じ UX を安く。
- 実装: **入り口ピッカー（DEC-083）撤回**（現在 repo に即作成へ）→ `repo-picker.tsx` 削除。**ヘッダに repo チップ**（`IssueRepoChip`）: 開始前（worktree 無し＆thread 空）はドロップダウンで別 repo へ移動（`moveIssueToRepo`＝movePath→switchTo→route 再読込）、開始後はロック🔒。Rust 変更なし・tsc 0・eslint 0。
- DEC-083〔撤回〕: 入り口の repo ピッカー（実装→当日 DEC-084 で supersede）。
- **本番未反映が積み上がり中**: prod=DEC-080。**DEC-081(export/import)・082(⌘K)・084(repo チップ)** がまだ。次の区切りで本番再ビルド＋/Applications。

## ▶ 2026-06-14 セッション（DEC-082 — コマンドパレット ⌘K）
- ideas-backlog §C。**⌘K** で任意の Issue（現在 repo）/ リポジトリ（recents 切替）/ アクション（新規 Issue・フォルダを開く・設定・ショートカット）へジャンプ。グローバル modal（layout 常駐・ShortcutsDialog 同型）。検索＋↑↓/Enter。
- 配管: 新 `command-palette.tsx`／ layout 常駐／ sidebar に `bezier:new-issue` リスナ／ shortcuts チートシートに ⌘K。**Rust 変更なし**・tsc 0・eslint 0。
- **本番未反映: DEC-081（export/import）＋DEC-082（⌘K）はまだ prod に入れていない**（prod=DEC-080）。次の区切りで本番再ビルド＋/Applications。

## ▶ 2026-06-14 セッション（DEC-081 — コマンドパック export/import＝マケプレ配布の最小形）
- ideas-backlog §E。DEC-078 の続き。**JSON 1ファイル**でコマンドを export（保存ダイアログ）／import（ファイル選択→非破壊マージ・衝突時のみ確認上書き）。「自分用 skill を別 repo/人へ持ち回る」最小配布。
- 配管: `capabilities` に `dialog:allow-save` 追加／ ipc `pickFile`・`saveFileDialog`／ `bezier-commands.ts`（`buildPack`/`readPack`/`writePack`）／ マネージャに「共有」行。tsc 0・eslint 0・cargo Finished。

## ▶ 2026-06-14 セッション（DEC-080 — チェックポイント / worktree スナップショット＋ロールバック）
- ideas-backlog §D。Discard（全消し）のみ → **任意の点に戻せる**手動チェックポイント（＝branch の commit）。作られ方は**手動 MVP**を採択（自動・毎ターン前は WIP 増＋squash 要 → 後続）。
- Rust `git_log`（`base..HEAD` 新しい順）/ `git_reset_hard`（reset --hard・reflog 復元可・main 不触）。session に `checkpoints`/`makeCheckpoint`/`rollbackTo`。ヘッダの Ship 隣に「チェックポイント」ドロップダウン（いまを保存＋一覧＋各行「戻す」）。tsc 0・eslint 0・cargo Finished。

## ▶ 2026-06-14 セッション（DEC-078 — /bezier:* コマンドの UI マネージャ＝marketplace 入口）
- **codex は将来対応**（接地で確定: comingSoon・未インストール・~/.codex は別物。推測実装しない）。一旦 claude 最適化。
- 設定の読み取り専用一覧を**編集できる管理 UI** に。**disk = 真実**（`~/.claude/commands/bezier/*.md` 直接読み書き）: 一覧（frontmatter パース・組み込み/カスタム判別）／編集＋「既定に戻す」／追加（slug 検証・衝突チェック）／per-file 削除（Rust `remove_bezier_command`・path 固定）／空状態 CTA。確認は async `confirmDialog`。
- **配管**: Rust `remove_bezier_command`／ ipc `removeBezierCommand`／ `bezier-commands.ts`（list/write/remove/parse/builtin helpers）／ 新 `components/settings/bezier-commands-manager.tsx`／ settings 差し替え。tsc 0・eslint 0・cargo Finished。

## ▶ 2026-06-14 セッション（DEC-076 — composer 撤回 → agent-native スラッシュコマンド配布）
- CEO「terminal へのチャット欄が2つあるみたいに見える。skill 配布で良い説」。調査→ DEC-075 は chat-native 入力を terminal-native 面に重ね**入力が二重**化していた（Bezier は他人の CLI を pty で動かす B 陣営、composer は claude の `@`/`/` の劣化再実装）。
- **composer 撤去**（`agent-composer.tsx` 削除・`sendToAgent`/`termPidRef` 撤去・ターミナル単体に復帰）。入力は claude 自身のプロンプト**1つ**。
- 価値は **`/bezier:*` スラッシュコマンド**へ移管: `~/.claude/commands/bezier/` に **verify / spec / alt3 / precommit**。**claude 専用**（codex は prose の BEZIER.md が土台）。**持ち出し可能な資産**＝marketplace の楔。
- **配布ポリシー（セルフレビューで修正）**: 初版は無言・自動・グローバル・毎回上書き → CEO「勝手に配布される？」。**「明示インストール＋編集尊重」**を採択。自動設置撤廃→**設定画面の明示操作のみ**／既存ファイルは**上書きしない**（更新は別ボタン＋confirm）／**削除**は専用 Rust（path を Rust 側算出で安全）。旧挙動で入った4ファイルはクリーンアップ済み。
- **tsc 0・eslint 0・cargo check Finished**。**承認キュー #34〜#37 すべて完了**（#37 は composer→skill配布に再設計）。

### DEC-075（撤回済み・履歴）— 左チャット composer 化
- 生ターミナル下に composer を dock し `@`/`/` を実装したが、入力二重で UX 不良 → DEC-076 で撤回。

### OPEN-001 merge 安全層 → ✅ CLOSED（DEC-077）
- 着手前調査で**既に実装済み**と判明（Ship IA = DEC-052/058 期）。log の「未実装」は陳腐化。再構築でなく正しさレビューに切替。
- 既存: `git_behind_ahead` / `git_sync_main` / `git_merge_conflict_check` / `git_merge_to_main`（3重ガード）/ Ship メニュー（behind バッジ・Sync・gated Merge・衝突をエージェント委譲）。
- **唯一の実バグ**: base ブランチが `BASE="main"` ハードコードで、`git_merge_to_main`（メインリポ現在ブランチに merge）と不整合 → 非 main repo でバッジ崩れ。**任意 repo を狙う楔として実害**。
- **修正**: Rust `git_base_branch`＝`current_branch(repo)` を真実源に統一。`baseBranch` を live 解決して behind/ahead・衝突チェック・UI ラベルへ。tsc 0・eslint 0・cargo Finished。

### 死にコード掃除（DEC-072 の名残）
- 旧 self-scoring Verify（`buildVerifyHandoff` / `handleVerify` / `canVerify` / SessionAction `"verify"`）は DEC-072 で撤回済みなのにセッションに残存・UI 消費ゼロ → 削除。DEC-072 の生きた検証（`collectEvidence`→`syncVerifyBlock`＝spec.md の `検証ログ` ブロック）は無傷。tsc 0・eslint 0。挙動変化なし（rebuild 不要）。

## ▶ 2026-06-14 セッション（DEC-074 — Preview 拡張）
- **任意幅**（「カスタム幅」＋ 幅×高さ px 入力）／**デバイス枠 chrome**（角丸をデバイス別＋mobile 縦にノッチ・装飾）／**外部ブラウザで開く**（Rust `open_external` http(s) 限定＋`ExternalLink` ボタン）。
- **tsc+eslint green・実機 200・Rust 再ビルド**。DEC-074 で commit。**承認キュー残**: #37 左チャット composer 化。

## ▶ 2026-06-14 セッション（DEC-073 — ショートカット可視化）
- `title` だけだったヒントを**本物の Tooltip**へ（`SegmentedControl` を base-ui Tooltip 化）。**`Kbd` 部品**（明暗両対応）。
- **ショートカット一覧チートシート**（`shortcuts-dialog.tsx`＋`lib/shortcuts.ts`）：**`?` で開閉**・layout 常駐・Title▾ メニューにも導線。⌘⇧[]・⌘1-9・⌘⌥←→・⌘F・⌘/・⌘W・⌘N・⌘B・⌘R・⌘Q 等を集約。
- **tsc+eslint green**。DEC-073 で commit。**承認キュー残**: #36 Preview 拡張 / #37 左チャット composer。

## ▶ 2026-06-14 セッション（DEC-072 — Verify を Spec インライン根拠へ）
- CEO「UI パネルは微妙、Spec に直接 受入基準の根拠を付与したい」→ **DEC-071 の右レールパネルを撤去**。検証は **Spec md そのもの**。
- ①**根拠はエージェントが付与**（Implement 後、各受入基準の直下に `- 根拠: …`・採点はしない）②**機械証拠は自動**（ターン終了で変更スコープ/機微フラグ→`## 検証ログ`）。**採点は maker** が Spec エディタでチェック。
- `verify-panel.tsx` 削除・`verify.ts` 整理・`page.tsx` ターン終了 effect・`issues.ts` 手引き。**tsc+eslint green・実機 200**。DEC-072 で commit。

## ▶ 2026-06-13 セッション（DEC-071 — Verify→Spec 証拠ベース検証）
- 撤去した自己採点 Verify の置き換え。**AI は採点しない／Bezier が証拠を自動収集／maker が受入基準をチェック／verify.md 廃止・spec.md に集約**。配置＝**Spec タブ右レール**（`VerifyPanel`）。
- 証拠（MVP）＝変更スコープ（files/±行）・機微領域フラグ（auth/DB/env/RLS）・変更ファイル一覧。ターン終了/worktree 生成/手動で自動収集 → spec.md の管理ブロック `## 検証ログ` に書込。受入基準はチェックボックスを maker がトグル。
- 新 `lib/verify.ts`＋`verify-panel.tsx`＋`page.tsx` 配線＋手引き文更新。**tsc+eslint green**。DEC-071 で commit。**後続**: before/after・機械チェック・✅/👁分類・supervisor・監査ログ・デッドコード掃除。
- **承認キュー（次）**: Tooltip+ショートカット一覧 / Preview 拡張 / 左チャット composer 化。統合 Files エクスプローラは**不要で確定**。

## ▶ 2026-06-13 セッション（DEC-070 — 🐛 完了 Issue で激重 を修正）
- **症状**: 完了(merged) Issue があると激重・使い物にならない（普通使用は問題なし）。本番でも再現＝dev ビルド無関係。CPU サンプリングは全部 idle（＝ブロッキング I/O）。
- **確定**: 重い最中に bezier プロセスツリーを `ps` → 子に **`gh pr view`（PR マージ確認）常駐**を発見。
- **原因**: PR-merged 確認 effect が merged 時 `onStatusChange("merged")` → `setIssue` が新 `issue` 生成 → effect の dep `issue` 変化 → 再実行 → `gh pr view` → … 無限ループ（in-progress は早期 return でループしない）。
- **修正**: effect 冒頭に `if (issue.status === "merged") return;`。**tsc+eslint green**。DEC-070 で commit。本番 .app 再ビルドして再起動。

## ▶ 2026-06-13 セッション（DEC-069 — Annotation 完全パリティ）
- CEO「Design と Preview で同じツールに・片方だけは避ける」→ **テキスト編集 中止**＋**element-pick 削除**（同じ非対称）。ツールは **cursor / comment / pen の3つ**に統一（Design も Preview も同一）。cooperating preview 依存（iframeRef/inspect script）を AnnotationLayer から除去。
- **tsc+eslint green・実機 200・Rust 変更なし**。DEC-069 で commit 済。

## ▶ 2026-06-13 セッション（DEC-068 — Annotation 体験の磨き込み）
- **Comment 統合**（Figma 方式・クリック=点/ドラッグ=範囲、`rect` ツール廃止）。**Pen 連続描画→まとめ送信**（ペンはツール解除せず溜める）。**アクションバー**（未送信数＋まとめ指示＋undo/redo/clear＋送信）を top 下に統合。**ツールバー畳み**（上の小ピル）。
- **据え置き＝テキスト直接編集**（Slice C・Implement.Preview 限定／`bezier-inspect.js` 拡張要）。
- **tsc+eslint green・実機 200・Rust 変更なし**。DEC-068 で commit 済。

## ▶ 2026-06-13 セッション（DEC-066 — Implement タブもショートカット＋サイズ統一）
- 共有 `useTabShortcuts`（⌘1-9/⌘⌥←→/Ctrl+Tab・`active` 列のみ反応）を新設し **Implement の Preview/Diff/Code** と Design 候補タブの両方で使用（design-variants の自前実装は置換）。`page.tsx` が BuildReview に `active` を渡す。
- **サイズ統一**: タブ的役割の3要素（Implement タブ / Design タブ / Spec ToC）を **13px** に揃え（Design id バッジ 10→11px・ToC 12→13px・行間調整）。
- **tsc+eslint green・実機 200・Rust 変更なし**。DEC-066 で commit 済。

## ▶ 2026-06-13 セッション（DEC-065 — タブを Facebook 風下線タブに統一）
- 共有 `UnderlineTab`（active＝色＋下線 / hover＝グレーのピル）を新設。Implement の Preview/Diff/Code と Design 候補タブを統一。Design は Chrome 風をやめ下線タブに戻すが **+追加・×・Chrome ショートカット（⌘1-9/⌘⌥←→/Ctrl+Tab）は維持**。
- Preview ヘッダー追補: 回転アイコンを `RotateCwSquare` に・Reload を中央ビューポート群へ集約。
- **tsc+eslint green・実機 200・Rust 変更なし**。DEC-065 で commit 済。

## ▶ 2026-06-13 セッション（DEC-064 — Preview レスポンシブ＋Stop 内包）
- Implement Preview ツールバー中央に **デバイス切替（フィット/デスクトップ/タブレット/モバイル）＋回転＋寸法**と **パス入力**。プリセット時は iframe を実寸デバイス枠（中央寄せ・スクロール）に。iframe と注釈レイヤーを同枠に入れピン整合維持。
- **Stop を表から撤去** → **「稼働中」バッジ hover で「停止」**に変化（`RunningBadge`）。ツールバーは Start/Reload/設定 のみ。
- **tsc+eslint green・実機 200・Rust 変更なし**。DEC-064 で commit 済。

## ▶ 2026-06-13 セッション（DEC-063 — ⌘Q も終了確認）
- ⌘Q を即終了でなく**確認**へ：Rust で custom Quit（`quit-confirm`・⌘Q）→ `bezier://quit-requested` emit、`AppCloseGuard` が listen → 確認 → destroy。close/⌘W/⌘Q すべて確認経由（Code 表示中の ⌘W のみタブ閉じ）。**tsc+eslint green・Rust 再ビルド**。DEC-063 で commit 予定。

## ▶ 2026-06-13 セッション（DEC-062 — ⌘W を文脈で分岐）
- **Code を見ている時だけ** ⌘W＝アクティブ Code タブ閉じ／**それ以外**＝アプリ終了（確認つき）。可視判定＝`CodeBrowser` ルートの `getClientRects()`。Code 可視時は capture で claim＋stopImmediatePropagation、非可視は `AppCloseGuard` の bubble が `win.close()`→確認。**tsc+eslint green・実機 200・Rust 変更なし**。DEC-062 で commit 済。

## ▶ 2026-06-13 セッション（DEC-061 — ⌘W で Code タブ閉じ／停止に確認）
- **⌘W がアプリごと終了していた**（デフォルトメニューの Close Window が ⌘W 占有・最後の窓を閉じると終了）→ Rust の `.setup` で **close_window を持たないカスタムメニュー**に差し替え（Edit メニューは残しコピペ維持）。⌘W が webview に届くように。
- **⌘W → アクティブ Code タブを閉じる**（`CodeBrowser` ルート div の keydown・Code にフォーカス時のみ）。
- **停止に確認**: `AppCloseGuard`（layout 常駐）が `onCloseRequested` を捕捉し「終了しますか？」→ OK で destroy。※⌘Q は即終了。
- **tsc+eslint green・実機 200・Rust 再ビルド済**。**DEC-061 で commit 済**。

## ▶ 2026-06-13 セッション（DEC-060 — Code Editor の使い勝手）
- **ターゲットユーザーから逆算**（Mai 即時直し/Leo 流暢/Kenji・Priya 読む/Tom 軽修正）→ エディタ＝**読む＋素早く安全に直す＋探す**。**IDE は目指さない**（LSP/デバッガ/minimap 等は入れない・深掘りは「実 IDE で開く」へ逃がす）。承認＝**全項目**。
- **In-files 検索**（Lovable 風・grep・ファイル別グルーピング＋一致行ハイライト＋クリックでジャンプ）。
- **Tier1**: ⌘F 検索/置換・Alt-g 行ジャンプ／⌘/ コメント／括弧補完＋オートインデント／実 IDE・Finder で開く／Revert。
- **Tier2（全採用）**: 折りたたみ／行折り返し／**AI 変更行マーキング**（worktree diff 解析・緑アクセント）／**複数ファイルのタブ**（×で閉じる・タブ別 dirty・状態保持）。
- `@codemirror/search` 追加。`session.diff` を FileViewer へ。**tsc+eslint green・実機 200・Rust 変更なし**。**DEC-060 で commit 済**。

## ▶ 2026-06-13 セッション（DEC-059 — Implement に Code サブタブ＋Verify 撤去）
- **Implement のサブタブ＝Preview / Diff / Code**（Verify は撤去）。Code＝**worktree の実コードを閲覧＋編集**（`code-browser.tsx`）：左＝遅延ファイルツリー、右＝CodeMirror（言語ロード・⌘S 保存）。画像 blob プレビュー／バイナリ・2MB 超はプレースホルダ。
- **編集（Phase 2 最初から）**: ⌘S→`write_file`→worktree 未コミット→**既存 git-status ウォッチャ→Commit/Ship に自動で乗る**。レース＝**実行中 read-only ロック／settle 時クリーンなら自動リロード／dirty は確認ダイアログで保護**。
- **根＝開いたフォルダ**（monorepo 対応）: repo ルートでなく `<worktree>/<subPath>`。`subPath` を session 公開。
- **Rust** `list_dir_all`（allowlist 無視で全ファイル・dotfiles と node_modules/target/.next/out 除外）。`list_dir` は不変。
- **Verify 撤去＝DEC-058 方針の実現**（自己採点は全ペルソナ不信）。検証＝証拠を Spec に集約する**本実装は未着手**（当面 Verify UI 不在で OK）。
- **tsc+eslint green・実機 200・Rust 再ビルド済**。**DEC-059 で commit 済**。**大相談の論点**: 統合 Files エクスプローラ（issue 成果物も同ツリー＋各ファイルを最適面へルーティング）。

## ▶ 2026-06-13 セッション（DEC-058 — Lovable 風 IA ＋ SegmentedControl ＋ ショートカット）
- **トップバー1本化**（Lovable 参照）: 左＝Title＋`▾`メニュー＋状態、中央＝**SegmentedControl を一段上げ**（Spec/Design/Implement・スライドするサム）、右＝**`Ship▾`に finalize 全集約**（Commit＋Sync/PR/Merge）。`▾`に活動ログ/agent/再Implement/Discard/ゴミ箱を集約 → **左パネルは純チャット**（⋯撤去）。
- **ショートカット**: ⌘⇧[ / ⌘⇧] でビュー循環。Design タブ内は**実 Chrome 準拠**（⌘1–8/⌘9/⌘⌥→←）。各所 `title` に hover ヒント（後続＝Tooltip＋一覧ページ）。Design はブラウザタブ化・幻「生成中…」撤去。Spec は変更セクションへ**自動ジャンプ**。
- **token 戦略の転換**: 独自 type-scale token 量産をやめ**共有コンポーネント集約**へ（第1弾＝`SegmentedControl`）。
- **Verify→Spec 方針（決定・実装は次段）**: 4ペルソナ discovery 結論＝AI 自己採点は全員不信 → **自己採点をやめ「証拠」を Spec に集約**（verify.md 廃止／受入基準にインライン status＋証拠リンク）。research = `playbook/research/2026-06-13_verify-ux-discovery-and-direction.md`。
- **tsc+eslint green・実機 200**。**DEC-058 で commit & main 統合済**。詳細 = DEC-058。**次の大相談**: center に **Code ビュー追加**（/issues 配下の Spec/ログ/画像/html ＋ worktree 実コードを整理して閲覧・編集）。

## ▶ 2026-06-13 セッション（DEC-057 — dogfood 小issue連打バッチ）
- **🐛 根本**: Rust `list_dir` が `.html` を捨てていた（`classify_ext` 未許可）→ Design 表示・Spec 同期・演出が全滅。`html/htm` 追加で連鎖回復。**🐛 タブ重複キー**（iframe/AnnotationLayer 同 key）→ `frame-/anno-` 分離。
- **Build→Implement 改名**（CI build 混同回避）。**A** Design 演出（シマー＋チップ＋ドット＋自動切替）。**B** Spec の左 outline 撤去。**D** title 再読込＋**ハーネス**（定型→`BEZIER.md`・handoff スリム化）。**Spec ToC**（左・読み取り専用・追従・クリックでスクロール）。
- **tsc+eslint green・実機 200**。**DEC-057 で commit & main 統合**。詳細 = DEC-057。

## ▶ 2026-06-13 セッション（DEC-056 — 注釈駆動 Design）
- CEO 要件: Design 指示は Chat でなく **Annotation**（Build と共通化）。Design タブ＝**パターン切替タブ / + 追加 / HTML 表示 / Annotation / 確定**。確定→Build。Spec に **パターン一覧＋採用を常に追従**。
- 実装: `DesignAnnotations`→**`AnnotationLayer`**（`surface` で Build=コード/Design=ワイヤー改訂を切替・注釈ストアも surface 別）。Design タブ全面再構成（タブ＋単一表示＋注釈＋確定）。`handlePickVariant` が adopted 永続化→spec 管理ブロック同期→Build。`reviseDesignPattern`/`syncSpecDesignSection` 新設。
- **tsc+eslint green・実機 200・未 commit**（feat/build-design-loop に積む想定）。詳細 = DEC-056。後続=左チャット context チップ。

## ▶ 2026-06-13 セッション（DEC-055 — 会話駆動 Design）
- CEO「メインチャットの流れの中でステップとして Design を作りたい。今は Design ごとに別プロンプトで二度手間」。→ **Design 規約（`designConventionBlock`）をチャットの seed に常駐注入**。会話で「デザイン案を3つ」と言えば規約どおり `design/NN-slug.html` を書いてボードに自動表示（別プロンプト不要）。チャット手順を **Clarify→Spec→Design→Build** に。Design タブ（ボタン）も併存。
- 実装 = `issues.ts`（`designConventionBlock`・`buildImplementHandoff`）。**tsc+eslint green・実機 200・未 commit**。詳細 = DEC-055。
- ⚠ **未 commit が DEC-050〜055（6件）たまっている** — どこかでまとめて commit 推奨。

## ▶ 2026-06-13 セッション（DEC-054 — Design スタック非依存＋フォルダリング規約）
- CEO「Design は repo の技術スタックに影響せず作れるように・どんどん蓄積・フォルダリング規約を」。**規約確定**: `<issue>/design/NN-<kebab-slug>.html`（NN=連番・蓄積）／**スタック非依存の自己完結 HTML**（repo を読まない/依存しない・Spec から自由）／`@01` 参照。
- **参照ソース（Mobbin 等）はユーザーに委ねる**（CEO 合意）: エージェント=ユーザーの Claude Code → 参照 MCP / CLAUDE.md 指針が継承される。Bezier は特定ツールを hardcode しない・MCP 設定 UI は作らない。将来は design-references skill 配布＝マケプレ案。
- 実装 = `variants.ts`/`issues.ts`(`buildVariantHandoff`)/`design-variants.tsx`。**tsc+eslint green・未 commit**。詳細 = DEC-054 / 分析 doc §7.5。**未決**: ① worktree 不要化 ② 発散の fidelity（ワイヤー or リッチ）。

## ▶ 2026-06-13 セッション（DEC-053 — Design タブ作り直し）
- dogfood で「Design 全然使えない」（**別案 0 生成**）。原因＝実 Tailwind repo に「自己完結 inline CSS＋sandbox」を強制し**崩れた HTML**＋生成が会話を殺す。分析 doc = `playbook/research/2026-06-13_design-tab-analysis-and-proposal.md`。
- **ハイブリッドに再設計**（3タブが自然に収まる）: **Design=グレースケールのワイヤー（発散・安く速く N 方向一括・`--continue` で会話継続・@参照で相談）→「この案で進める」→ Build=実 DS プレビュー（収束）**。参照パターン（Mobbin MCP）は生成プロンプトに内蔵。
- 実装 = `variants.ts`/`issues.ts`(`buildVariantHandoff` 改訂)/`use-implement-session.ts`/`design-variants.tsx`。**tsc+eslint green・実機 /issues 200・未 commit**。詳細 = DEC-053。

## ▶ 2026-06-13 セッション（DEC-052 — 左パネル純チャット化）
- **左パネル＝純チャット**に（CEO「ボタン多くて難しそう」）。**動詞は"効く場所"へ**: Verify → Build タブ「検証する」／Commit・Ship(Sync/Open PR/Merge) → Issue ヘッダ `[Commit][Ship▾]`／再 Build・Discard・agent 選択 → 左ヘッダの **⋯** メニュー。着手＝チャットに書いて送る、直し＝チャットで言う。
- 実装 = `issue-agent-panel.tsx`（スリム化＋⋯）/`build-review.tsx`（検証ボタン）/`page.tsx`（`IssueFinalize`）。**tsc+eslint green・実機 /issues 200・未 commit**。詳細 = DEC-052。後続=生ターミナル→composer 化（ideas-backlog §B）。

> ⭐ **再開時はまず `playbook/strategy/2026-06-11_coevolution-positioning-and-repo-sor-model.md` を読む**（共進化コア価値・repo-as-SoR データモデル・B監査・v0.5作業リスト）。次に `playbook/operations/2026-06-08_session-handoff.md`（v0.1〜v0.4 実装の全状況）。

## ▶ 2026-06-13 セッション（DEC-051 — 中央 3 タブ化）
- **中央 = Spec / Design / Build の 3 タブ**に再構成（CEO の理想形）。**Design（新設）= 使い捨て HTML 別案＝考える層**（`<issue.dir>/design/*.html` を sandboxed iframe で見比べ／「別案を作る」で repo DS 接地の HTML をエージェント生成／「この案で進める」で実 Build へ）。旧 Design（実 repo プレビュー⇆Diff）は **Build** へ移設＋**Verify サブタブ**（PASS/FAIL チェックリスト）追加。
- 実装 = `lib/variants.ts`（新）/`issues.ts`（`buildVariantHandoff`）/`use-implement-session.ts`（generate/pick variant）/`design-variants.tsx`（新）/`build-review.tsx`（旧 design-review 改名＋Verify）/`page.tsx`（3タブ・pulse）。**tsc+eslint green・実機 tauri /issues 200**。**未 commit（CEO レビュー待ち）**。
- 詳細 = DEC-051。**DEC-050（Clarify→Spec(DoD)→Build→Verify ＋ evals 層）も同日・未 commit**。

## ▶ 2026-06-13 セッション（DEC-050 — Build ループ＋evals 層）
- **Zenn 記事の4核を Issue ループに実装**（提案 doc = `playbook/research/2026-06-13_agent-loop-from-zenn-article.md`）。新ループ＝**起票 → Clarify → Spec(DoD) → Build → Verify → 承認**。「実装」→ **Build** に概念統一。
- **Clarify**：Build 前に repo 接地で3〜5問（既定値併記・誘導尋問なし）を handoff に内蔵。**evals 層A**：受入基準を「完成の定義（DoD）」として Build 前に確定（Spec テンプレ改訂）。**Verify**：受入基準を PASS/FAIL/BLOCKED/SKIP で採点→`verify.md`＋チャット要約（新エージェントターン・新ボタン）。
- 実装 = `settings.tsx`/`issues.ts`（`buildVerifyHandoff`・clarify/verify イベント）/`use-implement-session.ts`（`handleVerify`）/`issue-agent-panel.tsx`（Build/再 Build/Verify）/`app/issues/page.tsx`。**app tsc+eslint green / 未 commit（CEO 指示待ち）**。
- **CEO 別件の問いへの回答 = Yes・moat**：Bezier は repo 内でユーザー自身の coding agent に委譲 → 各社の `CLAUDE.md`/`design.md`/custom skills/MCP/memory が **そのまま Build/Verify の土台として継承**（Sierra「既存 SoR の上に立つ」/Priya DS 懸念への構造的回答）。
- **後続**：Verify 結果ビューア（center 表示）/ Variants（A/B/C/D を1 worktree）/ 内製 eval ハーネス（層B）/ `data-verify` 決定論検証。詳細 = DEC-050。

## ▶ 2026-06-13 セッション（DEC-049 — LP「創刊号」全面再構築・公開品質）
- **ヒーロー11案を FAB 切替で比較**（v1: Atelier/Grip/Swarm/Blueprint/Tiles/Orb、v2: Gallery/Editorial/Obsidian/Proof/Signature）→ CEO が **Editorial** 採用。
- **LP 全体を「雑誌 Vol.001」としてゼロベース再構築**: 表紙→目次→特集→実演(ProofTheater)→収録機能→読者→仕様→購読→奥付。site commit `4b6172d`、tsc/eslint/build green。OG画像(表紙1200×630)・metadataBase・a11y・mobile・reduced-motion/print まで QA 済（4並行レビュアー33件対応）。
- **公開前の残り1タスク**: `site/src/lib/site.ts` の `WAITLIST.endpoint` を本物のフォームに1行設定（現デモモード）。ドメイン確定後 `metadataBase` 更新。site は remote 無し（公開するならホスティングへ）。
- 詳細 = `playbook/decisions-log.md` DEC-049。

## ▶ 2026-06-12 セッション（DEC-048 — ロゴ確定＋完全モノクロ化）
- **ロゴ確定 = D1**（抽象ペンツール：中空ダイヤ＋ハンドル線＋中空サークル＋collinear 曲線、W13、モノクロ "lit black" sheen）。多数の探索を経て CEO が D1 で確定。探索一式＝`design/brand/logo/explore/`、生成＝`explore/build-locked.mjs`。
- **ブランド完全モノクロ化（indigo 全廃）**：app/site の `globals.css` の hue266 を全ニュートラル化、`--primary`=ink/near-white、唯一の色相=機能色 `--destructive`。`terminal-theme.ts` の cursor/selection もニュートラル化（ANSI 16 は維持）。
- **アセット/アイコン**：`design/brand/logo/` に mark/mono/favicon/wordmark/icon-app-{white,dark}/icon.svg 書き出し。`BezierMark`（app+site, client+useId, テーマ追従 sheen）差し替え。`npx tauri icon` で全 tauri アイコン再生成。site に favicon.ico/icon.svg/apple-icon.png、app に favicon.ico 配置。favicon は塗り版＋mid-tone .ico で light/dark 両タブ対応。
- **doc 更新**：`design-tokens.md`（全面モノクロ）/`PRINCIPLES.md`/`brand-strategy.md`(§7.5)/`logo/README.md`/`decisions-log.md`(DEC-048)。**app/site とも tsc green**。LP(:3310) にモノクロ＋新ロゴ反映済を目視確認。
- **未了**：app の **Rust ネイティブ窓の目視 dogfood**（人間ゲート・`cd app && npm run tauri dev`、リブランド後の Rust 再ビルド込み）。LP ヒーローの mesh 化（当初依頼・据え置き）。コミットは未実施（CEO 指示待ち）。

## ▶ 2026-06-11 セッション（DEC-007 / DEC-008）
- **DEC-007 Onlook 廃止 → 完全 LLM 駆動 + Annotation 入力**: GUI 直接編集をやめ、UI 変更は LLM 経由。入力 = 要素ピック注釈（agentation 流）＋ペン注釈（マルチモーダル）。`vendor/onlook/` 他は除去対象。AST 書き戻し（最大の技術負債）を捨てる。
- **DEC-008 repo-as-SoR データモデル**: 正本＝repo の docs/（`docs/specs/`＋`docs/decisions/` ADR・第一級）/ `.bezier/`＝機械machinery（非正本）。worktree-per-change で**決定とコードを同 commit**。drift harness で docs を生かす。traceability（spec↔screen↔annotation↔decision）。
- **コア価値**: 実行がコモディティ化する世界で、デザイナー&PM の**意図・判断・決定記憶**を握る層。機械継ぎ目=オープンプロトコル / 価値 ∝ ループ回転速度 / 楔=エンジニア中心agentが二級扱いするデザイナー&PM面＋ベンダー横断。
- **B（実機監査済）**: `tsc` EXIT 0 / `next dev` `/workspace` 200・Ready 402ms = **build-green 実証**（memory の "build green≠実働" を一段 de-risk）。Rust commands = fs+pty のみ（**git/worktree 皆無**）。既存再利用基盤4つ（ingest/doc編集/ターミナル委譲/Canvas）は健在。
- **残ゲート**: Tauri ネイティブ窓の目視 dogfood（CEO の人間ゲート・機械不可）。**次は着工前に一度 `cd app && npm run tauri dev`**。
- v0.5 最小筋: Onlook除去 → docs/+AGENTS.md init → 要素ピック注釈 → 注釈→handoff→worktree→merge の git機構（Rustにgit command）→ 最小 drift check。

## ▶ 2026-06-11 追補（DEC-047 / IA・Issue モデル要件定義）
- 現状プロダクト（IDE風）への違和感を起点に「メニューから決める」要件定義を実施。**要件doc = `product/specs/2026-06-11_ia-and-issue-model.md`**。
- **メニュー確定（Concept A）**: Product（実画面Board=ホーム）/ Issues（spine・Spec内包）/ Decisions / Repo ＋ Agent常駐ドロワー。Specsはtop navに出さない。
- **原則**: P1 一人Designer+PdM第一 / P2 repo-output=エンジニア協業無料(エンジニア用機能を作らない) / P3 SoR adapter(repo既定・Notion後日) / P4 Issue spine(Improvements→Issues改名・注釈は道具に降格) / P5 非stepper=フォルダ規約presence-driven(在れば表示/+で作る)。
- **Issue=フォルダ（F1/F2/F3/G1'/G2 確定）**: 採番=**ULID** / **issue.md別持ち** / **design必ずフォルダ**。durable=`docs/issues/<ulid>-<slug>/{issue.md,spec.md,design/,decision.md}`は**実コードと同じPR経由でmainへ**（起票で直push禁止）。ephemeral=`.bezier/`(drafts/status/注釈/worktree)は**gitignore local**(status は main に持たない)。branch規約`issue/<ulid>-slug`。詳細=thread(左)+artifact slots(右)。**CTO懸念(main直書き)対応で改訂・DEC-008を精緻化**。
- **Issueモデル要件=✅一周完了**（doc §3.2〜3.7）: フォルダ規約 / artifact slot中身(issue.md frontmatter/spec軽量/design薄/decision自動下書き+代替案) / 注釈UX(要素ピック+ペン・必ずIssue属・Onlook selection再利用・ライブiframe前提) / status×worktreeライフサイクル(draft→in-progress→merged・昇格点=着手でbranch切る・worktree 1issue1個)。
- **次フェーズ=実装段取り**: (a)dogfoodで現app不具合を合流 → (b)どの画面から作り変えるか(Product Board/Issue詳細/注釈)の順序 → v0.5実装プラン。据え置き=チーム協業・Notion・Inbox。

## ✅ GitHub repo 化（完了 2026-06-11）
- **`Sota-Mikami/Bezier`（private）作成・全履歴 push 済**（commit `058dad7` = CM6 editor + 2026-06-11 decisions）。origin = https://github.com/Sota-Mikami/Bezier 。`.gitignore` に `.bezier/`(ローカル作業ストア)追加済。公開は core が固まった段階で別途対応（CEO 方針）。今後は通常の git/PR 運用。

## ▶ 2026-06-11 dogfood 知見 & DEC-010（エディタ載せ替え）
- **dogfood#1（実機 tauri dev）**: markdownが flat 表示のバグ発見→**修正済**(`plate-render-kit.tsx` 新規16描画プラグイン・tsc/roundtrip/eslint green・markdown.ts未変更・未commit)。
- **DEC-010**: その上で CEO が Obsidian 体験を要望→**エディタを Plate → CodeMirror 6 Live Preview に載せ替え決定**(DEC-006 の editor 部分を supersede)。理由=「カーソル当てたら生記法が出る」はテキスト+デコレーション方式=CM6 でしか不可。**副次=round-trip機構(markdown.ts FROZEN/mdToPlate/plateToMd/classify/plate-render-kit)を退役でき SoR(=md)に素直に一致**。テーブル/code blockのlive描画が最難。**次=CM6 Live Preview の POC**(plate-render-kit のスタイル判断を CM デコへ移植)。

> 要点（〜v0.4）: v0.1〜v0.4 を Workflow で自律ビルド・全 build green 独立検証・commit 済み（最新 `07d04e1`）。**一度も人手で実起動していない（build green ≠ 実働）**。dev ポートは **3210**。Onlook=v0.4 は DEC-007 で廃止確定。


> ▶ **2026-06-08 再開（DEC-005）**。賭ける層を engine → **レイヤC（プロダクト意思決定の SoR + ベンダー横断オーケストレーション）** に移し、**自分用ツールとして全部入りで作り切る**方針（dogfood-first）。
> 📌 再開時の読む順: この STATUS → `playbook/decisions-log.md`（DEC-005/006）→ `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md`。

## ▶ 再定義サマリ（DEC-005/006 / 2026-06-08）
- **新コア**: Superset が「コードを書く指揮者」なら Bezier は「**プロダクト/デザインの意思決定を束ねて貯める指揮者+台帳**」（Sierra プロセスのSoR の design/PM 版）。engine は Claude Code/Codex/Claude Design に委譲。
- **空白**: コーディングagentオーケストレーション層は混雑、生成エンジン層はネイティブ侵食。**設計/プロダクト意思決定 SoR は誰も占有していない**＝唯一筋が通る層。
- **Founder=First User**: CEO は既に手で SoR層を運用（decisions-log/approval-queue/handoff/memory/仮想法人）→ 製品化＝自分の運用の載せ替えが最短 dogfood。
- **アーキ確定（DEC-006）**: 殻=**Tauri v2**（軽さ / 摩擦時 Electron 退避）/ UI=単一 React web（ブラウザ表示も無料）/ ブロック=**Plate(MIT, MDX)** / Canvas編集=**Onlook(Apache-2.0, React+Tailwind固定)** / ターミナル=**xterm.js + Rust portable-pty** / Onlook AST engine=Node サイドカー隔離。正本=.mdx/.yaml/scene-graph を Git。
- **ビルド順**: v0.1 SoR+Plateエディタ → v0.2 ターミナル+委譲 → v0.3 Canvas表示 → v0.4 要素編集(Onlook)。
- **時限リスク**: Claude Code が「設計判断の恒久記録」をネイティブ統合したらレイヤCも侵食 → 窓が開いている今のうち（定期ウォッチ）。
- **次アクション**: ③OSSライセンス棚卸し=完了（`2026-06-08_oss-license-inventory.md`）→ ②v0.1 着工へ。

## ⏸ 旧 pause の経緯（DEC-004 / 2026-06-05・参考）
- 当時の停止理由 = Codex preview 登場で「楔のエンジン」がネイティブに吸われる懸念（ハーネス競合リスクの現実化）。**この判断は正しかった**（engine層に賭けていた）。DEC-005 はこれを否定せず、賭ける層を engine → SoR/オーケストレーションに移して再開するもの。
- 当時 validated: エンジン実動（extract/鍵なし生成/実部品render/revertable shim）。未validated: SoR層の独立需要 ← まさに今回の再定義で正面から取りに行く層。

## 🔀 大転換: OSS open-core へ (2026-06-05 / DEC-002 / DEC-001アーキを supersede)
- **収益 = OSS open-core（n8n型）**: ローカルエンジン/local maker loop は **fair-code で無料**（self-host 自由・SaaS再販禁止）。hosted クラウドSoR・チーム・SSO・無制限版管理 = **サブスク有料**。
- **アーキ = ローカルエンジン（CLI daemon, npm）+ クラウド SoR**: ingestion/モック生成/render/エージェント委譲はユーザーマシンで、**ユーザー自身の Claude Code サブスクで実行**。クラウドへ送るのは scene-graph/spec/PNG のみ（ソースコードは出さない）。SoR が moat の実体（Sierra プロセスのSoR）。
- **技術lin = green**: Claude **Agent SDK**（`@anthropic-ai/claude-agent-sdk`）で Claude Code ハーネスを埋め込み、SDK更新で新モデル/tool-use/MCP/hooks を自動継承 = 「Modelを足すだけ」問題の解。詳細・DEC全文・却下代替案 = `playbook/operations/2026-06-05_local-engine-architecture.md`。
- **効果**: ISSUE-001 の鍵待ちが消える（ユーザーの Claude Code で生成）。enterprise security（コードがクラウドに出ない＋監査可能OSS）が差別化。

## ✅ 楔 de-risked: ISSUE-002 PASS (2026-06-05 / 鍵なし・Claude Code サブスク)
- **経路A確定**: `@anthropic-ai/claude-agent-sdk` + **MCP stdio**（catalog ツール）で、**ANTHROPIC_API_KEY なし・CEOの Claude Code サブスク**で生成が走った。DEC-002 のアーキ（Agent SDK + MCP 委譲）を実地で実証。
- **実数（架空0件・COOが独立裏取り済）**: chomchom 4/4・alloy 5/5・template 3/3 で**実コンポーネントを ≥3 流用**、reused は全件 index に実在。
- 楔の核心リスク（「ただの v0 か / 実部品を忠実に流用できるか」）を**継続(continue)判定**で通過 → Sprint へ。
- 成果物: `spike/cli.mjs`（extract/generate/list）/ `generate-sdk.mjs` / `mcp-catalog.mjs` / `scene-graph-schema-v1.json` / `out/gen-*.json`。レポート `playbook/operations/2026-06-05_issue-002-result.md`。

## 👁 「見える」: ISSUE-003 完了 (2026-06-05 / dogfood #1)
- scene-graph → **chom-chom の実部品で実レンダリング**成功。生成画面「語彙SRS復習」がブラウザ/PNG で見える。
- **clean render 率 = 5/6（83%）**: VocabFlashcard(中核UI・モックデータで完全動作)・TabBar・AchievementCelebration・generated×2 = REAL。唯一の FALLBACK は ReviewSession（Supabase `fetchDueItems()` 依存 → プレースホルダ表示）。
- 「これは MY app の部品だ」体験が実物で出た（v0/Lovable の白紙生成に対する楔の説得力を可視化）。
- 成果物: preview ルート `chom-chom/src/app/Bezier-preview/page.tsx`（throwaway）/ `spike/screenshot-preview.mjs` / PNG `spike/out/render-chomchom.png`。レポート `playbook/operations/2026-06-05_issue-003-result.md`。
- 回し方: `node spike/cli.mjs preview chomchom "<意図>"`（dev server 起動済み前提, `PORT=3201 npm run dev` → `localhost:3201/Bezier-preview`）。

## 🧩 汎用化: ISSUE-004 完了 (2026-06-05 / dogfood #2)
- chom-chom 専用ハードコードを除去し、**汎用 preview ジェネレータ**化。`node cli.mjs preview <repo> --port <n>` の**1コマンド**で gen-preview → dev server 自動起動 → PNG 完走。
- **別 repo で実証**: `template` repo を同一ハーネスで実描画（ProtoNav 等が REAL）= ハードコードでないことを証明。**clean render 率 = template 5/7(71%) / chom-chom 5/6(83%)**。alloy は repo がローカルに無く正直に exit 2（捏造しない）。
- **判明した recurring な壁**: 実 repo の **auth gate / provider / 複雑props** が naive preview を止める（chom-chom の `AuthGate`、template の `AuthGate`/`ScreenPanel`)。→ Bezier は「preview-mode bypass / provider shim」戦略が要る（CEO 判断待ち）。
- 成果物: `spike/generate-preview.mjs` / `screenshot-generic.mjs` / `cli.mjs`(preview更新) / `out/render-{chomchom,template}.png`。レポート `playbook/operations/2026-06-05_issue-004-result.md`。

## 🔓 preview shim: ISSUE-005 完了 (2026-06-05 / DEC-003 / dogfood #3)
- **revertable preview shim** 実装。chom-chom の `AuthGate` 壁を突破し、**実ブラウザで preview content が描画**（ISSUE-004 では auth ログイン全画面で止まっていた）。AchievementCelebration モーダル等が live 描画。
- **安全実測**: 終了後・クラッシュ後とも対象 repo `git status` **クリーン（痕跡ゼロ）**。マニフェストは repo 外（`spike/out/shim-manifest-*.json`）、原子的復元。`--no-shim` で厳格 read-only。
- 中核: `spike/shim-engine.mjs`。CLI 統合済 `node cli.mjs preview chomchom --port 3201`（shim 適用→描画→復元 自動）。クラッシュ時手動復元 `node cli.mjs shim-restore chomchom`。
- 残: `--no-shim` 後の `Bezier-preview/` untracked 残留（5行修正）/ ReviewSession の 1 FALLBACK（Supabase Session 依存）。
- レポート `playbook/operations/2026-06-05_issue-005-result.md`。

## ✅ dogfood ループ一周完成 (2026-06-05)
**`intent → 実部品で生成（鍵なし・自分の Claude Code）→ 実 repo の auth 壁を安全に越えて実レンダリングで見る`** が1コマンドで回る。楔の核心が CEO の手元で動作。
- **次の候補**: (a) 実日常 repo（mikan 等）で render 率の現実値を見る / (b) 残 FALLBACK 潰し（ReviewSession data mock・`--no-shim` 残留）/ (c) SoR 着工（schema v1 → Supabase）/ (d) app/ canvas に流して見る体験を磨く。

## 🔄 詳細ページを会話駆動カスケードに刷新 (2026-06-04 / Mobbin準拠)
- CEO修正フロー = 「AI Chat→Specライブ→**承認**→Design生成→確定→QA生成」。Mobbin調査(`playbook/research/2026-06-04_mobbin-ai-work-apps.md`, T1=GPT Builder/Copilot/Replit/Jasper)で情報設計の王道を確認。
- 詳細ページを **会話主役の二ペイン** に刷新: 左=セッション(駆動・タイムライン: 生成イベント/**承認ゲート**/チェックポイント/次の一手/composer)、右=成果物ペイン(stageタブ=生成済み成果物のビューア+進捗、**未生成はロック**)。
- 承認カスケード: Spec確定→Design解放・3案生成→採用して確定→QA解放・生成→Build。URL永続化(?tab=&adopted=&sc=&dc=)。
- ステージ名 Mock→**Design** に統一(CEO語彙)。スクショ `app/.shots/v6-{spec-gate,design-gate,build}.png`。

## 🔄 ISSUE-001 スパイク進行中 (2026-06-04)
- **L1 静的抽出 = ✅ PASS**（鍵不要・完了）。自分の3 repo(_template/alloy/chom-chom)で 0 parse error、component registry+props+screen/part+edges+tokens 抽出。精度: alloyで grep候補22 vs 抽出23（recall~100%）。出力 `spike/out/*.json`。報告 `playbook/operations/2026-06-04_issue-001-spike-report.md`。
- **生成テスト = ⏸ 鍵待ち**。`spike/generate.mjs`(@anthropic-ai/sdk tool-use+prompt cache)実装済。**要: Anthropic APIキー + コスト上限 + モデル選択**。実行で「Claudeが実パーツ≥3を流用するか」を判定。
- 暫定: 最大リスクの前半クリア。後半（流用品質）が鍵待ちの決定的テスト。

## 🧭 確定している方針
- アーキ = ピュア Web SaaS（Next.js16/Vercel + Supabase + Claude API）。Day1 からチーム共有/課金前提。
- 楔 = 既存 repo → 実部品流用モック生成（v0/Lovable の白紙生成に対する文脈生成）。ステージ = **Idea**（build ≠ 検証）。
- チーム = COO + 専門家5 + ペルソナ4（`.claude/agents/`）。起ち上げプラン = `~/.claude/plans/cuddly-cuddling-crane.md`。

## ⏭ 次の選択肢（CEO 未決 / 楔 de-risked 後）
1. **生成→可視化を繋ぐ**: scene-graph → render（Playwright）or `app/` canvas に流し込み、「生成モックを実際に見る」ループを閉じる ← 楔の"説得力"を可視化
2. **SoR 着工**: scene-graph schema v1 を確定 → Supabase SoR schema + `app/` への生成エンジン移植（DEC-002 のクラウド側）
3. 収益仮説を詰める: Head of Product に 4ペルソナ WTP pressure-test（`2026-06-05_monetization-open-core.md`）
4. 配色を入れる（ブランド・グレースケール卒業）

---

## 🖥 ローカル起動
```
cd ~/Workspaces/Personal/projects/bezier/app
npm run dev -- -p 3100        # → http://localhost:3100 （落ちていたら再起動）
```
- 一覧: http://localhost:3100/ （左ナビ / テーブル+右プレビュー / 行クリックで切替）
- 詳細(会話駆動・二ペイン): `ISSUE-218`=Spec段階(承認ゲート) / `ISSUE-214`=Design段階 / `SOTAS-76?tab=build`=全解放
- URL永続化: `?tab=&adopted=&sc=&dc=`。最新スクショ `app/.shots/v6-*.png`
- 触れる点: 左の会話で「Spec を確定」→Design解放・3案生成→「採用して確定」→QA解放→Build。タブは生成済み成果物のビューア(未生成はロック)。
- 既知: グレースケールWF(配色は後) / render・生成は `spike/`(ISSUE-001, 生成は鍵待ち)。

## 再開ガイド & 構成
読む順: このSTATUS → `playbook/operations/2026-06-04_session-handoff.md`(詳細要約) → `COMPANY.md` / `playbook/decisions-log.md`(DEC) / `playbook/product-roadmap.md`。
- 単一窓口 = **COO**(`.claude/agents/coo.md`)。CEOの依頼はまずCOOが受ける。
- 最新の設計判断: `product/specs/2026-06-04_app-ia-and-spec-driven-loop.md` / `playbook/research/2026-06-04_mobbin-ai-work-apps.md`
- コード: `app/`（`src/app/page.tsx`=一覧 / `src/app/issues/[id]/page.tsx`=詳細(会話駆動) / `src/components/app-sidebar.tsx` / `src/lib/data.ts`=ダミーデータ）
- 楔スパイク: `spike/`（`extract.mjs`=L1抽出済 / `generate.mjs`=生成・鍵待ち / `out/*.json`）
- 戦略の根拠: `playbook/strategy/2026-06-04_Bezier-thesis-v1.md`

---

## 進行中 ISSUE 一覧

| ISSUE | タイトル | Stage | Owner | 状態 |
|---|---|---|---|---|
| ISSUE-002 | ローカルエンジンCLI昇格 + Agent SDK 生成委譲 | Idea→MVP | Engineer | **✅ 完了 / continue 判定**（鍵なし・実部品≥3流用） |
| ISSUE-001 | 楔の de-risking スパイク | Idea | Engineer | **✅ 完了**（L1抽出 + 生成委譲 = ISSUE-002 で決着） |
| (app WF) | グレースケールWF＝会話駆動カスケード | — | Eng+Designer | 反復中・localhost:3100 |

---

## 直近の DEC

- **DEC-002** (2026-06-05): OSS open-core 転換。ローカルエンジン（CLI/fair-code/無料）+ クラウドSoR（サブスク有料）。Agent SDK で Claude Code 進化に追従。DEC-001 のアーキを supersede（プロダクト/楔/Sierra/ペルソナは不変）。
- **DEC-001** (2026-06-04): Bezier 設立。アーキ=ピュアWeb SaaS / 楔=既存repo→コンセプトモック / コードネーム=Bezier / 会社OS（本ディレクトリ構成・エージェントチーム）を採択。

---

## ハンドオフ・ログ（逆時系列）

### 2026-06-04 — 5サイクルレビュー後の P0着地 + スパイクscope定義（並行 / DEC）
- CEO決定: 「並行」(P0実装＋ISSUE-001スパイク定義) / 状態永続化=URL searchParams。
- **5サイクル自律レビュー(36体)** 完了。記録 `playbook/quality-reviews/2026-06-04_5cycle-review-round2.md`。自己レビューが「適用報告されたが未着地」を検出。
- **P0着地**(Lane A): QA「Buildへ進む」結線(未確定なら→Mock)・AI送信(入力→1往復)・差分カード適用/却下結線・QA/受け入れ基準/流用部品をデータ駆動化・**URL永続化(?tab=&adopted=&mat=)**・specFinalized=確定&&採用案あり。data.ts に QACase/components/acceptanceCriteria 追加。スクショ `app/.shots/v5-{qa,spec}.png`。
- **スパイクscope定義**(Lane B): `playbook/operations/2026-06-04_issue-001-spike-scope.md`。3 repo(_template/alloy/chom-chom)で L1抽出→L3 render→tool-use生成→scene-graph、測定可能な kill/continue 基準。CEO承認待ち(APIキー・コスト上限・mikan clone可否)。

### 2026-06-04 — Kiro由来の強化 + Mai批判の本丸（ライブ連動）
- **Kiro学習をAIレールに**: モデル選択(claude-opus-4.8)・**Autopilot**トグル・`@`参照(部品/Spec)・**差分提案カード**（Spec/Mock編集をAIが提案→却下/適用 = 「AIは提案、人が承認」）・生成物チップに「開く」。spec-as-file パス表示 `.bezier/specs/{id}/{stage}`。
- **Mai批判「Spec書いてる途中でMockが出るくらい融けて」への回答**: Specタブに**ライブMockプレビュー**を併設（doc | 連動プレビュー | AI）。タブは"場所"のまま中身をライブ連動させ"ウォーターフォール感"を解消。タブ見出しも「Spec と Mock はライブ連動」に。
- スクショ: `app/.shots/v4-{spec,build}.png`。

### 2026-06-04 — AIチャットをタブ横断の常駐レールに（Kiro UI 準拠）
- CEO指摘: AIチャットはタブ配下でなく横断した存在にすべき（Kiro UI 参照）。
- 詳細ページを再構成: タブ(Spec/Mock/QA/Build)は**左+中央のみ**制御。右に**AIセッション常駐レール**（新規/履歴、Ask/Agent、コンテキストチップ、Kiro風"生成物"チップ）。タブ移動でも同一セッション継続。
- タブ固有のインスペクタ（流用部品/トークン→Mock左、カバレッジ→QA左、エクスポート→Build中央）に再配置。タブ状態は controlled(useState)、AIレールに現在地を渡す。
- スクショ: `app/.shots/v3-{spec,mock}.png`。

### 2026-06-04 — IA Round1: 6→4タブ統合（レビュー反映）
- 専門家(HoP/Designer)+ペルソナ(Mai/Kenji/Priya)の5体レビューを実施。記録: `playbook/quality-reviews/2026-06-04_ia-review-round1.md`。
- 決定: **6タブ→4タブ `Spec · Mock · QA · Build`**。Intent→Spec統合 / Design→Mock統合 / Handoff→Build改名(Spec確定でアンロック・タスクは提案・承認ガード)。
- サイドナビの崩れを修正。Mockに DS準拠バッジ・発散↔収束トグル・@デザイナーレビュー導線・流用部品/トークン常設。
- 反映済みコード: `app/src/lib/data.ts`(4 stages+maturity) / `app-sidebar.tsx` / `app/src/app/issues/[id]/page.tsx`。スクショ `app/.shots/v2-*.png`。
- 未決: Mai「タブ=ウォーターフォール」批判への更なる融合 / enterprise要件(Priya) は Launch段階 / 配色は後。

### 2026-06-04 — 本体 `app/` 着工: グレースケールWF（Engineer + Designer）
- Next.js 16 + React 19 + Tailwind v4 + **shadcn/ui（neutral）** で `app/` を scaffold。
- グレースケールのワイヤーフレームを実装: 左ナビ / ヘッダー / 一覧(Design Issues + 右プレビュー) / 詳細(6ステージタブ×3カラム)。
- **Kiro 型 仕様駆動ループを IA に反映**: Intent→Spec(下書き)→Design→Mock(発散↔収束)→Spec(確定)→QA→Handoff(spec→タスク自動分解)→将来AI実装。
- IA仕様: `product/specs/2026-06-04_app-ia-and-spec-driven-loop.md`。principles.md のループ図を更新。
- 起動: `cd app && npm run dev -- -p 3100`（dev稼働中）。スクショ: `app/.shots/`。
- 次論点: タブ数(Designをmockに畳むか)・Spec下書き↔確定UX・Componentsライブラリ・配色。

### 2026-06-04 — セルフモック（dogfood #0 / Principal Designer）
- Bezier の最初のコンセプトモックを作成（題材=Bezier UI、接地=mikan ISSUE-214 SRS復習画面）。
- 2画面: Canvas（既存repo流用モック生成）+ Spec&QA（Notion風block + QA自動生成）。Retina 2x。
- 置き場所: `design/mocks/2026-06-04_Bezier-self-mock/`（01-canvas / 02-spec-qa の .html + .png + README）。
- 理想（役割の連続体）への回答 兼 mikan/Sotas 実作業の時短デモ。本体実装ではなく出力プレビュー。

### 2026-06-04 — Founding セッション（COO）
- 会社OS の docs（COMPANY / STATUS / org-chart / playbook 一式 / product / design）を作成。
- `.claude/agents/` に専門家6 + ペルソナ4 を定義。
- `2026-06-04_Bezier-thesis-v1.md` で 固い問題 + Sierra + Anthropic ステージ判定を実施。
- 次: CEO が ISSUE-001 着手を承認 → Week1 スパイク。
