# 2026-06-15 あなたの設計プロセス vs 現Bezier — ギャップ・改善・柔軟化の網羅整理

Owner: CTO/Head-of-Product lens（CEO相談を受けて）
Source: mikan / Sotas / Personal の実プロトタイピングを並行探索 + 現Bezierの機能/ドキュメントモデル棚卸し。
目的: 「これまで自分がやってきた設計プロセスを、より使いやすく強力にしたもの」「基盤を提供しつつ各社が自由に乗れるもの」という CEO の意図に対し、現状の差分と方向を提案する。

---

## 0. 一行結論

現Bezierは **「ソフト開発ループ（issue→spec→実装→PR→merge）」** をモデル化している。
一方あなたの実プロセスは **「ドキュメント駆動の設計パイプライン（課題→現状→ベンチ→Spec→決定→プロト→QA→レビュー→共有URL）」**。
**単位を "Spec1枚" から "型付きドキュメント群" に開き、ステージをconfigにし、ゴールを "共有URL" に寄せ、gitとマシン活動ログを裏に退ける** ——これが本質的なギャップ。

---

## 1. 発見: 3エリアで「同じプロセス」が走っている

| 観点 | mikan | Sotas | Personal | 共通の背骨 |
|---|---|---|---|---|
| 単位 | Linear issue + `/projects/{name}/*.md` | `active/{SCR-ID}/` に **00〜06 の連番md** | `prototypes/{name}/docs/` | **issue ≒ 複数の型付きドキュメント** |
| 思考の記録 | research / `implementation_plan.md` / `claude_implementation_prompt.md` | `00_intake / 01_existing / 02_benchmarks / 03_spec / 04_decisions / 05_qa / 06_design-review` | `DESIGN.md` + `research/YYYY-MM-DD_*.md` + `STATUS.md` | **md = 思考・決定のSoR** |
| 成果物 | GitHub Pages の Next.js プロト | CloudFront の Next.js プロト | Coolify の Next.js プロト | **動くプロトがデザイン成果物（Figmaなし）** |
| デザイン規範 | `design/DESIGN.md` | `design-guideline/`(MDX) | `docs/DESIGN.md`（実装前に書き、PRをgate） | **DESIGN.md = gateするSSOT** |
| 共有 | プロトURL + Linear/Slack | `inbox/handoffs/{ID}_share.md`（URL+変更+決定+open Q+limits） | landing + サブドメインURL | **共有の単位は "URL"、1枚のhandoff** |
| 横断ビュー | `/projects/` 横断 | `inbox/decisions/`・`inbox/handoffs/`（**型でまとめる**） | landing 一覧 | **ドキュメント型で横断集約している** |
| git | worktree + PR、CIで自動deploy | worktree + `deploy.sh`、PdMは触らない | worktree(`wt.sh`) + push→自動deploy | **gitは"公開の配管"。デザイナーはほぼ見ない** |
| マシン活動ログ | なし | なし | なし | **どこにも無い。あるのは"authoredな決定"とgit履歴** |

→ **あなたはすでに「複数ドキュメント × 連番ステージ × プロト成果物 × 静かなgit × URL共有」という型を持っている。** Sotas の `00〜06` がその最も進化した形。Bezierはこの型の "Spec→実装" 区間だけを実装している。

> あなた自身の観察（「ログはSpecとは別に記録している」）が核心。**このBezierプロジェクトの運営方法そのもの**＝`decisions-log.md` / `STATUS.md` / `quality-reviews/` / `strategy/` を Spec と分けて持つ ——これがまさに、Bezierが製品として支えるべき "複数ドキュメント" モデル。**Bezierは「Bezierの回し方」を製品化すればいい。**

---

## 1.5 守るべき最重要の強み: 「既存コードベース上でプロトする」＝再現工数ゼロ（CEO追記②）

今のBezierが既に出している、**手放してはいけない**核心価値:
- repoから **worktreeを作って実コードベース上で**プロトするので、**既存画面の"再現"工数が消える**。AsIsが本物・無料。"完全に自分たちのアプリらしいもの"がそのまま作れる。
- これは旧プロセスの最難所だった: mikanは `_template-*-asis/` + HAR fixtures で本番を**手で再現**、Sotasは `/cmp` で本番を**手でミラー** —— 膨大な再現コスト。Bezierはこれを構造的に解消している（`bezier-inherits-repo-conventions-moat` の更に奥）。

→ **設計上の絶対制約**: §2以降の「ドキュメント/パイプライン/柔軟化」は、**この live worktree-from-repo の土台に溶接したまま**乗せる。汎用Notion/wiki化して**コードからの地続き性を失ったら本末転倒**（Q1反論の本質はこれ）。ドキュメントは"抽象メモ"ではなく **実アプリの状態を参照・派生する**もの。

---

## 2. 5つの問いへの回答（あなたの過去案件で検証済み）

### Q1. Specだけ太らせるのは良くない？横断で見える"document"に価値？
**→ 強く正しい。** Sotasは1issueに**7つの連番md**、Personalは`DESIGN/research/STATUS`、mikanは`plan/prompt/research`。あなたの実態は元から**マルチドキュメント**。Bezierは DEC-011/014 で Design/decision スロットを削り、**spec.md 1枚に過剰collapse**したのが gap。
- 提案: **issue = 型付きドキュメント群**（課題/現状/ベンチ/Spec/決定/QA/レビュー/共有）。
- 横断ビュー: あなたは既に `inbox/decisions/` `inbox/handoffs/` で**型ごとに横断**している。→ **「Documents」ビュー（型で全issue横断フィルタ）**は実需あり。
- ⚠️ 反論（devil's advocate）: ただの md 置き場＝Notion化すると、"あなたのプロセスらしさ"が消えてNotion/Linearと差別化を失う。**自由なdoc + 残す背骨（ステージ）**の両立が条件。

### Q2. md じゃなく HTML 派のオペレーションをストレスにしない設計
**→ 層を分けると解ける。** あなたの実態は **思考=md / 成果物=HTML(Next.js)** で既に二層。「md vs html」は二択ではなくレイヤー。
- 提案: **document を `{type, format, content|ref}` として抽象化**。format ∈ `md` / `WYSIWYG(BlockNote)` / `html` / `url(プロト・Figma・Loom)`。レンダラが形式に追従。
- HTML派/リッチ派には **同じドキュメントを WYSIWYG でも raw でも編集可**に（BlockNoteはスタックにある）。
- 成果物が「外部URL/Figma/live proto」でもドキュメントとして1枚に並ぶ → md強制をやめる。

### Q3. ログをmdにするなら「活動ログ」は要らない？
**→ ほぼ要らない（が、分けて考える）。** `thread.json`（機械生成の活動ログ）は git log + チャットと**約70%重複**、DEC-033で既にドロワーに格下げ済み。あなたの実プロセスに**機械活動ログは存在しない**——あるのは `04_decisions.md`（authored）と git履歴。
- 提案: **機械的 `thread.json` は撤去/派生化**。代わりに **(a) git由来の軽量タイムライン（派生・非保存）** と **(b) first-classな「決定(Decisions)」ドキュメント（authored）** に分離。
- ⚠️ 区別: 「決定ログ（意図して書く）」と「活動ログ（自動）」を混同しない。前者は**昇格**、後者は**撤去**。

### Q4. gitをデザイナーが気にせず使える状態に（エンジニア的にも違和感なく）
**→ Bezierは既に7割抽象化できている**（Sync/Ship/Merge/Checkpoints は成果名、worktree/branch/pushは隠蔽）。あなたの他案件は**さらに静か**（deployはscript、URLがマイルストーン、PdMはgit不可視）。
- 残る漏れ: **diff / commit SHA / コンフリクトのファイル列**はエンジニア寄り。→ "Advanced/Code" の奥に畳む。
- 大きな再整列: あなたの世界の完了マイルストーンは **"PRがmerge" ではなく "URLが公開"**。→ **finalizeの主役を「プレビュー/共有URL」**にし、PR/mergeは"チーム開発バリアント"に。これは Share/journey と直結。
- 削れる: 手動チェックポイント（autoがある）、reset-to-SHA は「ここまで戻す(undo)」表現に。

### Q5. そもそも機能多い？
**→ 数は実はリーン**（中央3タブ + 主要5アクション）。"多く感じる"の正体は **(a) 先回りで作った機能**（before/afterスライダー DEC-085=あなたが拒否した／verify細目採点=未使用）+ **(b) 安全系トグル/モーダルの密度**（DEC-099〜103）+ **(c) ほぼ使わない `/workspace`**。
- メモリ裏付け: 「CEOは before/after・タイル比較を拒否、需要より先にmoatを作るな（DEC-085→086）」。→ **before/afterスライダーは撤去**が一貫。

---

## 3. 再フレーム（提案の核）

| 今のBezier（dev-loop） | 目指す形（design pipeline） |
|---|---|
| spec.md 1枚 | **型付きドキュメント群**（課題/現状/ベンチ/Spec/決定/QA/レビュー/共有） |
| issue単位でしか見ない | **ドキュメント型で全issue横断**（Documents ビュー） |
| md前提 | **format可変**（md / WYSIWYG / html / url） |
| 機械活動ログ(thread.json) | **git派生タイムライン（非保存）+ authored Decisions doc** |
| 完了 = merge to main | **完了 = 共有/プレビューURL公開**（gitは配管） |
| ステージがハードコード | **ステージ＝config（各社が再定義）** ← "自由度の高い基盤" |
| DESIGN.md は暗黙 | **DESIGN.md/規範を first-class な gating ドキュメントとして surface** |

---

## 4. 「各社が自由に乗れる基盤」モデル（あなたの要望の核心）

3エリアで**ステージ名が違う**（mikan: research/plan/prompt ／ Sotas: 00〜06 ／ Personal: DESIGN/research/STATUS）。
→ パイプラインを**コードでなくconfig**にする。

- **既定パイプライン = あなたの opinionated な背骨**（そのまま使える）。
- 各workspace/repoが **ステージ集合（名前・順序・必須/任意・doc形式・各ステージの担当agent）を再定義**できる。
- 保存先は repo の `.bezier/pipeline.json`（＝「repo規約を継承する」既存moatと整合 / `bezier-inherits-repo-conventions-moat`）。
- これは Sierra的に言えば **「ワークフロー設定そのものがロックイン」**。コードでなく "決定とパイプライン設計" が資産（code is not the asset と一致）。

→ つまり: **強い既定 × 完全に差し替え可能なステージ**。提案者(あなた)の型を基盤にしつつ、各社が自分の語彙で回せる。

---

## 5. 具体アクション（ADD / FLEX / CUT）

### ADD（あなたの実プロセスにあってBezierに無い）
- マルチドキュメント・パイプライン（型付きdoc）+ ステージテンプレート。
- **Documents 横断ビュー**（型フィルタ：全issueの「決定」だけ、「ベンチ」だけ…＝`inbox/`の製品化）。
- **共有handoff 1枚の自動生成**（URL + 変更点 + 検討した決定 + open questions + known limits）← Sotas `_share.md` の型。Bezierの journey を発展。
- **DESIGN.md/規範を gating ドキュメントとして surface**（実装前チェックの自動化）。
- ベンチマーク/research の再利用（Mobbin結果→ベンチ表の半自動化）。

### FLEX（柔軟にすべき）
- document の **format可変**（md/WYSIWYG/html/url）。
- **ステージ＝config**（各社語彙）。
- finalize の主役を **共有/プレビューURL** に。PR/mergeは選択肢。

### CUT（削ってよい）
- **ライブの before/after スライダー（DEC-085）** ← 拒否済み。**ただし AsIs/ToBe比較そのものは残す**（§5.5(a)。撤去するのは"動くアプリに重ねるdiff"であって、"意図して並べる比較資料"ではない）。
- **機械活動ログ thread.json** ← git派生 + 決定docへ。
- **手動チェックポイント** ← autoに一本化（or "保存"に統合）。
- **`/workspace` ルート** ← 使われていない。必要時まで隠す。
- **verify 細目採点** ← 実運用で検証、過剰なら簡素化。

---

## 5.5 CEO追記①: 現状カバーできていない3ケース（反映済み）

### (a) AsIs / ToBe の比較
- 実態: 触る必要はないが、**重要点のスクショを並べて2つを見比べる機構をHTMLに持たせていた**（Sotas `/cmp`(AsIs) vs `/tobe/cmp`(ToBe) + Spec比較表と同型）。
- 反映: **ライブの before/afterスライダー(DEC-085)は撤去**するが、**キュレーションされた AsIs/ToBe 比較ブロック（スクショ＋要点）を Share/Spec の1要素として ADD**。"動くアプリに重ねるdiff"(cut) と "意図して並べる比較資料"(add) を区別。
- ★§1.5の強みにより **AsIsは"再現"不要＝今のmain、ToBeはworktreeの変更**。比較は「main を撮る vs worktree を撮る」だけ。旧プロセスで最重だった "AsIs再現" がタダになる。

### (b) テストケース（将来的に）
- 実態: QAで test case を用意したい。Sotas `05_qa.md` / mikan QAタブと同型。
- 反映: パイプラインの **QAドキュメント型** に「テストケース」を含め、**spec→テストケース自動生成**につなぐ（`/bezier:verify` の発展）。

### (c) state / variants のインタラクティブ確認（最重要級）
- 実態: データ有り/Empty/loading/error などの **状態・バリアントをパターンとして並べて見たい**。**ライブ側でなくてよい**が、**interactiveに確認できることが重要**。
- 反映: 既存の design-variants を **「状態×バリアント ギャラリー」** に発展（empty/loading/error/populated を切替表示）。Sotas `/qa` state gallery・StatusStepper 9状態ルートと同型。
- 位置づけ: md/htmlに次ぐ **第3のドキュメント形式 "States"（インタラクティブ・ギャラリー）**。Q2「format可変」の具体例。＋§1.5の通り、実コンポーネントを worktree から実データ状態で描けるなら、なお強い。

---

## 6. 確認したい方向（CEO判断）

1. **単位の再定義**: spec.md 1枚 → 型付きドキュメント群 + Documents横断ビュー。GO？
2. **ステージ=config**（既定=あなたの背骨、各社で再定義可）を "自由度の高い基盤" の核に据える。GO？
3. **完了の主役を共有URLに寄せる**（gitとmerge は裏のチーム開発バリアント）。GO？
4. **CUTリスト**（before/afterスライダー・thread.json活動ログ・/workspace 等）を実行に移す。どこまで？

→ 方向が固まれば、(a) 新ドキュメント/パイプラインモデルの設計1枚、(b) CUTの実行、(c) ステージconfigのスキーマ、に分けて着手する。

---

## 7. CEO決定（2026-06-15）

- **Q1 単位の再定義 = GO**: 「Specに限らない Document View にする」。型付きドキュメント群 + 横断ビューの方向で進める。
- **Q2 States = 体験ファースト**: 「一回雰囲気で見てから判断したい」。→ `/states` に**体験版（vibe prototype）**を実装（`app/src/app/states/page.tsx`、⌘K→「States ギャラリー（体験版）」で起動）。モック画面を empty/loading/error/populated 等で並べ、グリッド/フォーカス・PC/モバイルを切替。**状態の語彙が画面ごとに違う**ことも体験で提示（一覧=empty/.../フォーム=default/invalid/saving/saved）。本実装では各フレームが worktree の実アプリになる前提。
- **Q3/Q4 未決**（活動ログ撤去 / 完了をURLに寄せる）: States体験の判断後に続けて確認。
- 手順は当面 COO/実装側に一任（CEO）。
- 副次: 今回のグローバルエラーログ（DEC-104系）が @xterm の既存描画バグ（`_renderer.value.dimensions`）を捕捉・可視化。実害は軽微だがノイズ。要トリアージ候補。

---

## 8. 確定方針（2026-06-15 後半 — gallery探索の結論）

States ギャラリー（§5.5c の体験版）を実装→体験した結果、**CEO判断は「ギャラリー / Storybook生成は too much、不要」**。`/states` サンドボックスは撤去済み（コマンドパレット導線ごと）。探索は無駄ではなく、"本当の need はビューアでなく決定+伝達" を確定させた。

代わりの確定方針 ——「Emptyどうする？Focusは？」という**デザイナー↔エンジニアの状態会話**を、新しい画面サーフェスを足さずに解消する:

1. **状態 = Spec の受入基準**。Clarify/Spec時点で各状態を明示（「Empty: 〜」「Error: 〜」「Focus: 〜」）。Implement→Verify→PR本文へ自然に流れ、レビューで蒸し返されない。
2. **"見る"は Verify のエビデンスで十分**（agentが該当状態に寄せてスクショ→受入基準の直下に添付）。専用ギャラリー不要。
3. **唯一の機能改善 = Clarify を賢くする**：画面種別に応じてエッジ状態を先回りで聞く（廊下の会話を spec時点の明示チェックに前倒し）。

### Clarifyポリシー = skill マーケットプレイス（CEO発意・最重要）

「何を・どの基準で聞くか」は**会社ごとに違う**（a11yレベル / ブランド規則 / 対象プラットフォーム / 業種コンプラ）。よって:

- Clarifyの状態チェックリストは**ハードコードせず skill 化**。各社がマーケットから**自社に合うものを選ぶ / fork / 共有**。
- Bezierは **opinionated な既定 skill**（Sotaの背骨）を同梱。各社が差し替え・拡張。
- 機構は既存の command-pack（`~/.claude/commands/bezier/`、DEC-076/081 の export/import）に乗る ＝ **マーケットの土台は一部実在**。
- 例: `a11y-strict states` / `mobile-first states` / `fintech-compliance states` / `SaaS-table states`。
- 境界: **skill = ポリシー（何を聞く・どの基準）**、**Bezier = 機構（Clarifyで走らせ、受入基準としてSpecに落とし、Verifyで確認、PRで伝達）**。
- 位置づけ: これは `skills-agents-marketplace-idea` の**最初の具体的な楔**。"states" が marketplace の入口になる。

### 次アクション
1. 既定 Clarify-states skill の中身設計（画面アーキタイプ × エッジ状態カタログ × 基準）。
2. Clarifyフローが skill を読んで受入基準を提案する繋ぎ込み（Spec へ落とす）。
3. Q1 Document View の具体化（別スレッド）。
