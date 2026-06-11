<!-- 作成日: 2026-06-11 / Owner: CEO+CoS / Status: 要件定義（確定）/ 親=playbook/strategy/2026-06-11_coevolution-positioning-and-repo-sor-model.md -->
# continuum — IA（メニュー構想）& Issue モデル 要件定義

> **この文書**: 2026-06-11 セッションの「メニューから決める」要件定義の確定版。
> 現状プロダクト（IDE 風 workspace）への CEO の違和感を起点に、メニュー構想 → Issue モデルまでを一人ずつ合意した結果を記録する。
> 上位の positioning/データモデルは親 doc（`playbook/strategy/2026-06-11_coevolution-positioning-and-repo-sor-model.md` / DEC-007/008）。本書はその下の **IA・Issue 要件**。

---

## 0. 違和感の診断（出発点）
現状プロダクトは **IDE（コードエディタ）の形**（左ファイルツリー / 中央エディタ / 下ターミナル / 別タブ Canvas）。これは「ファイルを編集するエンジニア」のメンタルモデル。
狙うのは **Designer+PdM が "実プロダクトを見て→指して→直して→決める"** 体験。
→ 軸を「ファイル/ツール」から **「プロダクト / 改善（Issue）/ 決定」** に張り替える。

---

## 1. メニュー構想（確定 = Concept A「改善ループ軸」）

```
continuum   [ <repo名> ▾ ]
══════════════════════════════════
 ◉ Product       実画面の Board・見る/注釈する（ホーム）
 ↻ Issues        Issue 単位の改善（Spec を内包・spine）
 ◷ Decisions     決定ログ（ADR/記憶・貯まる SoR）
 ──────────────────────────────
 ⚙ Repo          接続/設定/init
              [ ⌥ Agent ▸ ]   ← 常駐ドロワー（destination でない＝裏の配管）
```

- **Specs は top nav に出さない** → 各 Issue の中に持つ（§3 / Q1）
- **Inbox / Today は入れない**（最小維持）
- **Product ホーム = Board（タイル）**＋状態フィルタ（白紙 Canvas ではない＝実画面の俯瞰）
- **Agent（ターミナル/worktree）は常駐ドロワーに降格**（普段閉じ、覗く時だけ開く）

### 違和感をどう潰したか
| 旧（IDE 感） | 新 |
|---|---|
| ファイルツリーが起点 | **実プロダクト（Product Board）が起点** |
| ターミナルが主役級 | **Issues＝"仕事/改善" が主役**、agent は裏配管 |
| Canvas＝白紙に描く | **実画面を眺めて注釈する場所**（発散でなく収束） |

---

## 2. このセッションで確定した設計原則

### P1. 一人（Designer+PdM）で使える state が第一目標
- 主ユーザー = **Designer+PdM を兼ねる一人**（＝ペルソナ楔そのもの／＝CEO 自身）。dogfood と一致。
- チーム協業（権限・アサイン・通知・リアルタイム）は **scope 爆発を避けて後回し**。ライフサイクルの"形"だけ将来チーム拡張できるよう設計。

### P2. output = repo に普通にコード生成 → エンジニア協業が"勝手に"成立（設計原則に格上げ）
- continuum は **「エンジニア用機能」を作らない**。output が実 repo のコード＋docs ＝ **repo そのものが統合面**。
- エンジニアは普段の **PR / git** で下流（リリース品質）を引き継ぐ。
- 我々が握るのは Designer+PdM の**上流**、下流は既存エンジニア道具に **repo 経由で手渡すだけ** ＝ scope が締まり協業が無料で付く。

### P3. SoR バックエンドは adapter（repo 既定 / Notion は後から）
- `SoR backend = repo-files（既定・canonical）| notion（後日）| …` のインターフェース。continuum は抽象越しに読み書き。
- **repo-markdown が正本**。理由 = 3つの強みが repo でしか満たせない:
  1. agent がネイティブに読む（共進化の肝）
  2. **決定がコードと同じ commit に乗る**（why=IP）
  3. drift harness（docs↔コード乖離検出）
- **Notion は後日の任意バックエンド/ミラー**。Notion を正本にする時は上の3強みを意識的に手放す、と config に明記。**今は実装しない**（CEO: 後からの追加で良い）。

### P4. Issue が spine・全ては Issue 起点
- 旧「Improvements」→ **「Issues」に改名**（GitHub/Linear 語彙＝人も agent も即わかる＝共進化的にも◎）。
- **注釈は "起点" から "Issue の中で使う道具" に降格**（要件定義・デザイン FB の入力手段の一つ）。

### P5. ステージは Stepper でない＝フォルダ規約 × 在れば表示 × 作りたければ作る
- **Issue = フォルダ**。規約上の slot（spec / design / decision …）が **在れば表示・無ければ "+ で作る"**。
- 順序強制なし＝ウォーターフォール感ゼロ（旧 4 タブ Spec/Mock/QA/Build への Mai 批判を踏まない）。
- status は **軽いドロップダウン**（open / in-progress / merged 程度）。stepper でない。

---

## 3. Issue モデル（spine）

### 3.1 ライフサイクル = ロール付き artifact 種別（**強制パイプラインではない**）
CEO の描いた改善サイクル「起票 → PdM 要件定義 → デザイナーがデザイン →（今後はデザインだけで PR）→ エンジニアがリリース品質 → リリース」を、**順序強制せず**「ロール × artifact 種別」として持つ:

| 種別 / 役割 | ロール（今後 AI 比率↑） | 成果物 |
|---|---|---|
| **Open（起票）** | 誰でも / 自分 | タイトル＋概要＋対象画面（Product 注釈から起票も可） |
| **Spec（要件定義）** | PdM | 意図 doc（何を/なぜ/受入基準）。Plate 編集。注釈で実画面から要件を拾う |
| **Design（デザイン）** | デザイナー / Claude Design | デザイン → **そのまま PR（コード）化**。注釈/ペン多用 |
| **Build（リリース品質）** | エンジニア / agent | Design の PR を引き継ぎ、エッジ/データ/テストで release 品質へ |
| **Decision / Release** | — | merge → **決定が1本記録** → 完了 |

- **worktree/agent パスが2回**走り得る：デザイナー駆動の design→code、エンジニア駆動の build→release。diff が2段で育つ。

### 3.2 データモデル & main ガバナンス（確定 = F1/F2/F3 + G1'/G2）
**正本(durable)＝PR 経由で main へ / 作業状態(ephemeral)＝gitignore のローカル**。**main へ直 push しない。**

```
── ephemeral（.continuum = gitignore・ローカル作業ストア）────────────
.continuum/
├── drafts/                  起票したが未着手の issue
├── issues/<ulid>/
│   ├── status               open | in-progress | merged   ← main に持たない
│   ├── annotations/         要素ピック/ペンの座標・スクショ・画像
│   ├── worktree.json        branch / worktree path / live SHA（volatile）
│   └── thread.json          活動タイムライン
└── …（screens 等 "共有したい" 物だけ別途 committed config に出す）

── durable（docs/issues/<ulid>-<slug>/ = 実コードと "同じ reviewed PR" で main へ）──
docs/issues/<ulid>-<slug>/
├── issue.md       Issue 本体（what/why・確定事実）＋ frontmatter（id/title/branch/pr…）
├── spec.md(x)     Spec slot（PdM・要件）
├── design/        Design slot（必ずフォルダ：mockup画像/注釈サマリ/design notes）※実装コードではない
└── decision.md    Decision slot（ADR・merge時に確定）
```

- **採番 = ULID**（F2）。time-sortable・並行衝突なし。**UI は ULID を出さずタイトル/短縮 id 表示**
- **issue.md は spec と別持ち**（F1）。起票（Open）は spec より前に成立する独立 artifact ＋ status/メタの器
- **design/ は必ずフォルダ**（F3）。複数案/画像/注釈サマリを抱える
- **main は普通の PR でしか増えない**（G1'）。起票・status 変更で main を汚さない。「未着手 issue」は local `.continuum/drafts/`。コード変更が要る段で branch を切り、issue.md/spec/design/decision を **実コード(src/…)と同じ PR** で main に載せる ＝ レビュー/CI/branch protection を通り、why が what と同 commit（DEC-008）
- **status は main に持たない**（local 作業状態。後日 tracker/Notion）
- **issue ⇄ PR 相互特定**（G2）：branch 名規約 `issue/<ulid>-slug` ／ durable な PR リンクは `issue.md` frontmatter（branch/pr/base/head）／ volatile は `.continuum/issues/<ulid>/worktree.json`
- **Issue 一覧** = main の `docs/issues/`（確定・共有）＋ local `.continuum/drafts`（作業中）を UI で合流表示
- **Decisions destination** = 全 issue の `decision.md` を横断集約（逆引き traceability）。cross-cutting な決定は `docs/decisions/<ulid>-*.md` 単独も可

> **CTO 懸念への回答（なぜこの形か）**: 「起票で main に直書き」は ①branch protection を破る ②main 履歴汚染 ③status churn ④PM状態とコードの結合 ⑤monorepo 競合ホットスポット、という CTO 級の問題があった。**悪いのは "docs を main に置くこと" でなく "直 push" と "揮発 status を main に持つこと"**。→ durable は PR 経由（docs-as-code の王道）、ephemeral は gitignore local、に分離して解消。
> **DEC-008 の精緻化**: DEC-008 は「.continuum=repo内 machinery / flat docs/specs+docs/decisions」だったが、本書で **.continuum=gitignore ローカル作業ストア / docs は issue 中心フォルダ / durable は PR 経由のみ** に改訂（DEC-009 で記録）。

### 3.3 Issue 詳細レイアウト（stepper でなく presence-driven）
```
Issue #0042  オンボーディング離脱を減らす            [ open ▾ ]
対象: Onboarding / Welcome              ⌥ Agent ▸
──────────────────────────────────────────────────────────
 thread（活動SoR・左）       │  artifacts（在れば表示 / + で作る・右）
 ─────────────────────────  │  ┌ Spec ──────────────── ✎ ┐
 ・起票（注釈から）          │  │ 何を/なぜ/受入基準         │
 ・PdM: 要件メモ            │  └──────────────────────────┘
 ・注釈 ×3（ペン2）         │  ┌ Design ───────────────  + ┐  ←未作成
 ・agent run → diff         │  ┌ Changes / PR ─────────  ▶ ┐
 ・decision: 緑に統一       │  │ worktree: issue-42 / diff  │
 ・composer […]            │  ┌ Decision ─────────────  + ┐
```
- 左 = **thread/タイムライン**（起票・要件メモ・注釈・agent run・design diff・decision・ロール引き継ぎ＝活動 SoR）
- 右 = **artifact slot**（フォルダ規約で決まる／在れば表示／`+` で規約パスにファイルが生える）
- 注釈は **Spec/Design slot の中で使う道具**

### 3.4 traceability
```
Screen ──注釈──▶ Issue（Spec を所有）──生成──▶ Decision
   ▲                                            │
   └──────── touched-by（逆引き表示）───────────┘
```

---

### 3.5 artifact slot 仕様（確定 = step 2-2 / H1・H2）
- **issue.md** frontmatter: `id`(ULID)/`title`/`screens`(Product Boardキー)/`labels`/`branch`/`pr`/`created`。本文=問題/機会＋きっかけ。**status は持たない**（H1: live=local `.continuum`、完了=「PR merged＋decision.md在り」から**導出**、UI が合成表示）
- **spec.md**: frontmatter`issue`back-link。本文=`なぜ`/`何を`/`受入基準（checkbox）`/`やらないこと`/`未解決`。**軽量維持**。受入基準を checkbox にして agent 照合・drift 検証可能に
- **design/**（必ずフォルダ）: `notes.md`（デザイン根拠＋確定した注釈サマリ）＋`*.png/*.svg`（mockup/参照・任意）。**薄くてOK**（design の実体はコード diff になるため、意図と参照を残す場所）。live 注釈は ephemeral、確定要約だけ durable 化
- **decision.md**（ADR・merge時に**自動下書き→人がPRで確認**）: frontmatter`issue`/`pr`/`decided`/`status`(accepted|superseded)。本文=`文脈`(spec なぜから)/`決定`(spec 何をから)/`代替案`(**H2 で追加**・却下案)/`影響・触れた所`(`issue.screens`＋`PR diff パス`から自動)/`関連`。drift harness が「decision の主張 vs 実 diff」を後段照合

### 3.6 注釈の入り方（確定 = step 2-3 / I1・I2）
- **場所**: ライブ画面（走っている実プロダクトの iframe）上で「注釈モード」。Spec stage=課題箇所を指す / Design stage=デザインFB、の道具
- **2モード**:
  - **要素ピック**（agentation 流）: hover→要素ハイライト→click→コメント。捕捉= CSSセレクタ / DOMパス / 近傍コンポーネント / computed styles / スクショ切片 / テキスト → 構造化で agent へ（ソース特定は grep）
  - **ペン**（マルチモーダル差分）: 丸/矢印/手書きをオーバーレイ → **マークアップ済スクショ** → Claude マルチモーダルへ（空間意図が一発）
- **I1: 注釈は必ず Issue に属する**。現 Issue に紐づくか、Product からの "クイック注釈" は **新規 draft issue を自動生成**して紐づく（宙に浮かない）
- **注釈→agent**: 溜まった注釈（構造化＋ペン画像）を handoff にコンパイル→agent 起動（v0.2 流用）。live ピンは ephemeral（`.continuum/issues/<ulid>/annotations`）、確定要約だけ design/notes.md に durable 化
- **再利用**: Onlook の selection/inspector/preview-bridge を「編集」でなく「注釈」に繋ぎ替え（捨てるのは style の **AST 書き戻し**だけ）。**ペンのみ新規**（iframe 上 canvas オーバーレイ→画像合成）
- **I2: ライブ iframe 前提**（auth 壁は旧 spike の preview shim=ISSUE-005 流用）。静的スクショ注釈は将来オプション

---

### 3.7 status × worktree ライフサイクル（確定 = step 2-4 / J1・J2・J3）
状態機械: **`draft → in-progress →（in-review）→ merged`**。status は **local 正本＋導出**、main へ status commit しない。

| 状態 | issue フォルダの居場所 | git |
|---|---|---|
| **draft** | `.continuum/drafts/<ulid>/`（local・未追跡） | branch なし |
| **in-progress** | `docs/issues/<ulid>-slug/`（**branch 上**・追跡） | `issue/<ulid>-slug` ＋ worktree |
| **(in-review)** | 同上（PR に乗る） | PR open |
| **merged/done** | `docs/issues/<ulid>-slug/`（**main**） | PR merged・branch/worktree 破棄 |

- **J2 昇格点**: `.continuum/drafts/` の issue を **「着手で branch を切る瞬間」に `docs/issues/` へ昇格**（追跡ファイル化）。それまで完全 local
- **main は merge でしか増えない**（status 変更で main に commit しない）
- **J3 worktree** = `.continuum/worktrees/<ulid>/`（gitignore）に **1 issue 1個**（並行 issue＝並行 worktree・隔離）。merge/破棄で除去
- **2回の agent パス**（design→code / build→release品質）は**同じ branch/worktree** で diff が育つ。status は in-progress のまま、thread に2イベント
- **Issue 一覧 = 3ソース合成**: ①local `drafts` ②`.continuum/issues/<ulid>/worktree.json` の in-progress（worktree から folder 読む）③main `docs/issues/`（merged 履歴）
- **コード不要 issue** も docs-only PR で main へ。**破棄** = branch/worktree 除去＋draft 削除（main 無汚染）

---

## 4. 既存実装からの差分（何を作り変えるか）
現状 `app/`（v0.1〜v0.4）は IDE 風 workspace（file-tree/Plate/terminal/canvas + Onlook）。本要件への作り替え:
- **保持/転用**: terminal+handoff（Agent ドロワー）/ Canvas iframe（Product Board の土台）/ fs commands / `splitFrontmatter`
- **置換（DEC-010）**: **Plate → CodeMirror 6 Live Preview（Obsidian 型）**。md round-trip 機構（`markdown.ts` FROZEN/`mdToPlate`/`plateToMd`/`classify`/`plate-render-kit`）は退役。正本＝md テキスト直編集
- **作り直し**: ナビを Product/Issues/Decisions/Repo へ / file-tree 起点をやめる / terminal を常駐ドロワーへ降格
- **新規**: Issues（フォルダ規約 presence-driven）/ Product Board（タイル+状態）/ 注釈（要素ピック+ペン）/ Decisions 集約ビュー / git worktree（Rust に command 追加）
- **除去**: Onlook（DEC-007）

---

## 5. step 2（Issue モデル詳細）= ✅ 一周完了
1. ~~フォルダ規約~~ **✅ §3.2**（ULID / issue.md別持ち / design必ずフォルダ / durable=PR経由 / ephemeral=local / branch規約）
2. ~~各 artifact slot 中身~~ **✅ §3.5**（issue.md frontmatter / spec軽量 / design薄 / decision自動下書き+代替案・H1/H2）
3. ~~注釈の入り方~~ **✅ §3.6**（要素ピック+ペン / 必ずIssue属 / Onlook selection 再利用 / ライブiframe前提・I1/I2）
4. ~~status×worktree~~ **✅ §3.7**（draft→in-progress→merged / 昇格点 / worktree 1issue1個・J1/J2/J3）

### → 次フェーズ: 実装段取り
要件が一周したので、(a) dogfood で現 app の不具合を合流 → (b) どの画面から作り変えるか（Product Board / Issue 詳細 / 注釈）の順序と v0.5 実装プラン。

## 6. 据え置き（このセッションで out）
- チーム協業機能（権限/アサイン/通知/リアルタイム）= P1 で後回し
- Notion バックエンド = P3 で後日
- Inbox/Today = 入れない
