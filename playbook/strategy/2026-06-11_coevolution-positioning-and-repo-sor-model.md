<!-- 作成日: 2026-06-11 / Owner: CEO+CoS / Stage: Idea→MVP（DEC-005/006 の上に積む） -->
# Bezier — 共進化ポジショニング & repo-as-SoR データモデル（v0.5 設計）

> **この文書の位置づけ**: DEC-005（賭ける層＝レイヤC）・DEC-006（Tauri+Plate+Onlook アーキ）の上に、2026-06-11 セッションで確定した
> 1. **Onlook 廃止 → 完全 LLM 駆動 + Annotation 入力**（DEC-007）
> 2. **共進化のコア価値**（開発ループに埋め込んで恩恵を吸う位置）
> 3. **repo-as-SoR データモデル**（docs/ + .bezier/ 分離 / worktree / drift harness）（DEC-008）
> を一本化する。あわせて既存 v0.1〜v0.3 実装の **B（実機監査）ギャップ分析** を載せ、v0.5 の作業リストを出す。

---

## 0. このセッションの起点（競合観測 → 自分の設計の純化）

3つのツール観測が、Bezier の輪郭を逆照射した。**いずれも競合でなく「部品/パターンとして吸収する対象」**。

| 観測 | 正体 | Bezier との関係 |
|---|---|---|
| **たじま（@meltain_tajima）の AI ツール** | 「プロダクトデザインができる AI ツール」（satto 元PO が起業・来月パブリックβ）。デザインシステム準拠で UI/フロントを**生成**する系譜（Subframe/Figma Make/v0 と同カテゴリ） | **生成層＝別カテゴリ**。0→1 生成。コモディティ化リスク高い層（我々が降りると決めた層）。ドリフト監視対象。βに応募して一次情報を取る |
| **melta UI（tsubotax）** | AI-Ready Design System ＋「DESIGN.md + 壊れて気づく harness」。"品質は仕様でなく検証機構が決める" | **部品**。デザイン準拠層として MIT で取込可。**drift harness 発想を盗む**（§5） |
| **agentation** | UI 注釈 → 構造化コンテキスト（セレクタ/ファイルパス/Reactコンポーネント/computed styles/intent）→ Claude Code/Cursor に渡すブリッジ。"Visual feedback. For agents."。描画ツールは無い | **入力パターンとして吸収**。注釈を**成果物にせず**、SoR への入口にする（§6） |

**結論**: 彼らは「生成」「準拠」「注釈→markdown」で**止まる**。Bezier はそれらを入口/部品にして、**注釈→編集を実行し、決定として台帳に刻む**（レイヤC）。この最後の一段が誰にも無い核。

---

## 1. コア価値 — 「実行」が無料になる世界で、意図と判断と決定記憶を握る

### 1.1 前提の組み替え
AI エージェント（Claude Code/Cursor/codex）は **実行（コードを書く/直す/テスト）** を猛烈にコモディティ化する。逆に、速く・安くなっても**希少なまま残る**のは、デザイナー&PM が独占する3つ:

1. **意図（intent）** — 何を・なぜ作るか、プロダクト全体と整合するか
2. **判断（judgment / taste）** — 出力は本当に良いか
3. **決定の記憶（decision memory）** — なぜそう決めたか（Bret Taylor「コードはもう IP でない、**プロンプトとプロダクト判断が IP**」）

→ 実行が速くなるほどボトルネックは「正しく狙えたか/正しく判断したか」に移る。**ここを握る道具はエージェントが強くなるほど価値が上がる**（Sam Altman テスト合格 = コモディティ化しない側）。

### 1.2 コア価値（一行）
> **Bezier ＝ デザイナー&PM の「意図を入れて、判断を出す」層。エージェント開発ループを上から包み、taste を "エージェントが実行できるコンテキスト" に変換し、エージェントの出力を "生きた決定の記録" に変える。エンジンは持たず、ハンドルとログブックを握る。**

Bezier はエンジン（コード生成）を作らない。握るのは**ループの両端＝入口（意図→コンテキスト＝Annotation §6）と出口（diff→判断→記録＝決定SoR §4）**。

### 1.3 共進化の機構 — オープンプロトコルで継ぐ
「別軸で進化して置いていかれる」か「共進化して恩恵を吸う」かは、**出力物を何にするか**で決まる。

- ❌ 独自フォーマットで囲い込む → エージェント進化と繋がらず取り残される
- ✅ **エージェントが既に食う共通語**を出力する → エージェント側の進化が自動でこちらの追い風

→ **機械との継ぎ目は全部オープンプロトコル（MCP / markdown / git）、人間との継ぎ目だけ Bezier 独自UI（Canvas + Annotation + Pen）。**「Claude Code が文脈読解を強化」「新エージェント登場」が作業ゼロでこちらの恩恵になる。

### 1.4 フライホイール — 価値 ∝ ループ回転速度
エージェントが速い → 1日の反復が増える → 下す決定が増える → 決定SoR が厚くなる → 「なぜ」の記憶価値が増す。**ループが速く回るほど Bezier の資産が増える。** = Sierra「プロセスの SoR」を**プロダクト開発そのもの**に適用した形。

### 1.5 持続性 — ペルソナ楔 + ベンダー横断（構造的防御）
最大リスク = Claude Code 等が「決定記録/注釈レビュー」をネイティブ統合（DEC-005 の時限リスク）。防御は構造的に2つ:

1. **エンジニア中心のエージェントは、デザイナー&PM を二級市民にしている。** 彼らのユーザーはエンジニア。**視覚的注釈・taste・プロダクト全体整合**という"デザイナー&PM の判断面"を一級にする道具は本丸でない。**ここが楔**＝「AI 開発ループを、デザイナー&PM を主役に回す唯一の道具」。
2. **ベンダー横断は単一ベンダーが構造的にやらない。** Anthropic は Cursor/codex で下した決定を記録しない。**全エージェントを跨いで決定を束ねる**のは利益相反でやらない＝我々だけの持続位置（「どのモデル企業が勝っても勝てる」メタ位置）。

---

## 2. データモデル — 正本は repo（git）。Bezier は repo に被せるレンズ

**鉄則: Bezier は DB を持たない。** 独自ストアに決定データを正本で持った瞬間、囲い込みになり §1.3 の共進化前提（誰でも読めるオープン出力）が壊れる。正本は repo の中の markdown / yaml（DEC-006「正本＝ファイル&Git」を継承）。

### 2.1 フォルダ2階層
```
target-repo/
├── AGENTS.md / CLAUDE.md     ← エージェントの入口。docs/ を指す索引
├── docs/
│   ├── specs/*.md(x)         ← 仕様（人間に意味がある第一級市民）
│   └── decisions/NNNN-*.md   ← 意思決定ログ（ADR 形式を product/design に拡張）
└── .bezier/               ← Bezier の機械machinery（非正本・ツール固有）
    ├── screens.json          ← 画面レジストリ（v0.3で既存）
    ├── annotations/          ← 注釈ピンの座標・スクショ・ペン画像（v0.5 新規）
    ├── links.json            ← traceability（spec↔screen↔annotation↔decision）（v0.5 新規）
    └── handoff/*.md          ← エージェント委譲バンドル（v0.2で既存）
```

**この線引きが non-lock-in を構造で保証する**: `docs/` は Bezier を消しても価値が残る人間資産。`.bezier/` はツールの足場。「**Bezier を消したら docs/ が無価値**」になってはいけない。

- 意思決定ログは **ADR（Architecture Decision Records）** の慣習（`docs/decisions/NNNN-title.md`）を踏襲し、architecture だけでなく **product/design 決定**へ拡張。**発明しない＝エージェントが既に読み方を知っている既存フォーマット**＝共進化の追い風。

### 2.2 UI の本質は「並べる」でなく「辿れる（traceability）」
左に spec（Plate）、右に実画面（Canvas）+ 注釈、の二ペインは正しい。だが価値の核は横並びでなく **4者が線で繋がっていること**:

```
spec ──governs──▶ screen(s) ──annotated──▶ annotation ──produced──▶ decision
   ▲                                                                     │
   └──────────────────── updates（仕様に反映 or 逸脱を記録）─────────────┘
```
リンクメタデータ = `.bezier/links.json`、参照は docs 内の相互リンク。Notion/Figma にできない、**実コードに接地した traceability** が product surface。

---

## 3. git 機構 — worktree-per-change ＋「why は what と同じ commit に乗る」

```
①注釈（main の実プロダクト上で）
②Bezier が git worktree + branch を切る（変更を隔離・複数並行OK）
③注釈 → handoff（.bezier/）→ claude/codex を worktree で起動
④エージェントが【コード】と【docs/ の spec/decision】を"同じ branch"で更新
⑤Canvas が worktree を preview → 人間が判断
⑥merge：コードと決定が"同じ commit/PR"で着地
```

肝は④⑥の **「決定（why）をコード（what）と同じ commit に載せる」**。git history が「何を」の隣に「なぜ」を持つ＝「why が IP」を文字通り実装。PR 本文＝決定SoRエントリ。

> **Superset 型の worktree 隔離**（DEC-006 で `portable-pty` 採用の理由として既出）をここに使う。複数の改善を並行で in-flight にでき、main は常にクリーン。

---

## 4. drift harness — docs を"腐らせない"（ここが「ハーネス駆動」の payoff）

普通の repo の `/docs` は**必ず腐る**（コードが変わっても docs が置き去り＝全 repo のデフォルト失敗）。単なる docs 置き場なら同じ運命。差別化は:

- **docs はコードを変える同じループ（§3 ④）を通してしか更新されない**
- **drift harness で乖離を検出**（melta の `design:drift` 発想を盗む）。例: 決定で "primary を青→緑" としたのに実コードが青のまま、を検出して**壊れて気づく**
- これが効くから docs が**生きた SoR のまま**＝信頼できる＝エージェントに食わせて意味がある

> **Onlook（手で直接編集）を捨てた隠れた正解理由がこれ**: 手編集は docs を通らずコードだけ変わり即 drift する。**注釈→LLM モデルは drift を構造的に防ぐ**（必ずループを通る）。

---

## 5. Annotation 入力モデル（Onlook を置換）— DEC-007

UI 変更は**完全に LLM 経由**。自分で GUI 直接編集（Onlook）はやめる。入力 = 実プロダクト上の**注釈**:

- **要素ピック注釈**（agentation 流）: hover→ハイライト→クリック→テキスト。捕捉= CSS セレクタ / DOM 文脈 / computed styles / 近傍 React コンポーネント名 / スクショ切片
- **ペン注釈**（agentation に無い差分）: 画面に丸/矢印を直接描く → **マークアップ済みスクショを Claude のマルチモーダルに渡す**。「ここを丸で囲って矢印の先に動かす」が一発。技術的にも軽い（スクショ+描画オーバーレイを画像合成して image+text で投げるだけ）
- ソースの厳密特定は**LLM に grep させる**（Onlook の AST 書き戻しは不要＝最大の技術負債を除去）

**agentation との本質差分**: 彼らは注釈→markdown で終わり（記録しない）。Bezier は注釈を**入口 modality**に過ぎないものとし、編集を実行し**決定SoR に刻む**（§4 ループ）＋**マルチモーダル(ペン)**を足す。

---

## 6. B — 既存 v0.1〜v0.3 実機監査（2026-06-11）とギャップ

### 6.1 build-green は実証（memory の "build green ≠ 実働" を一段 de-risk）
- `npx tsc --noEmit` = **EXIT 0**（TS層クリーン）
- `next dev` で **`/workspace` が 200・Ready 402ms**（web層が実機で配信）
- ⚠️ 残ゲート = **Tauri ネイティブ窓 + 対話ループの目視**（= CEO の人間ゲート。機械では確認不可。`cd app && npm run tauri dev`）

### 6.2 既に在る再利用基盤（4つ）— 新規構築でなく"収束"でよい
| 機能 | 実体 | 目標モデルでの役割 |
|---|---|---|
| repo ingest | Rust `list_dir`/`read_file`/`write_file` + `file-tree.tsx` | 実 repo 取込（フォルダを開く） |
| doc 編集 | `plate-editor.tsx` + `markdown.ts`/`frontmatter.ts`（md/mdx/yaml） | docs/ spec 編集 |
| ターミナル + 委譲 | `pty.ts` + `terminal.tsx` + `agents.ts` → `.bezier/handoff/*.md` → claude/codex 起動 | §3 ③④ 委譲 seam |
| Canvas | `canvas-board.tsx`（@xyflow）+ `screens.ts` → `.bezier/screens.json` | §2.2 実画面表示・§5 注釈の土台 |

### 6.3 ギャップ（目標モデルに対して欠けているもの）= v0.5 作業リスト
1. **docs/ SoR 規約が無い** — `docs/specs/` `docs/decisions/`(ADR) `AGENTS.md` 索引が無い。今の SoR は `.bezier/screens.json`（機械machinery）のみで、**人間に意味がある spec/decision を repo に貯める層が無い**
2. **決定ログ捕捉が無い** — 対象 repo に決定を書き出す導線が無い（決定ログは Bezier 自身の playbook にしか無い）
3. **git / branch / worktree が Rust に皆無** — commands は fs + pty + command_exists のみ。隔離なし・「決定+コード同 commit」なし
4. **Annotation 層が無い** — 要素ピック+ペン（§5）は未実装。代わりに在る Onlook（直接編集）は**廃止対象**（`vendor/onlook/` `editable-frame.tsx` `element-inspector.tsx` `onlook-edit.ts` を除去）
5. **drift harness が無い**（§4）
6. **traceability links が無い**（§2.2 `links.json`）

### 6.4 v0.5 の最小筋（提案）
DEC-007/008 を実装に落とす最小: **(a) Onlook 除去 → (b) docs/ + AGENTS.md の init 導線 → (c) 要素ピック注釈（ペンは次） → (d) 注釈→handoff→worktree→merge の git 機構（Rust に git command 追加） → (e) 最小 drift check**。
ただし **memory 鉄則「4層未起動の負債を先に潰す」**: 実装着工前に CEO が一度 `npm run tauri dev` で v0.1〜v0.3 を目視 dogfood し、実地の不具合を v0.5 リストに合流させる。

---

## 7. このセッションの決定（→ decisions-log）
- **DEC-007**: Onlook（GUI 直接編集）廃止 / UI 変更は完全 LLM 経由 / 入力 = Annotation（要素ピック + ペン・マルチモーダル）/ agentation・melta は部品として吸収
- **DEC-008**: repo-as-SoR データモデル確定（docs/ 第一級 + .bezier/ 機械 の分離 / ADR 決定 / AGENTS.md 索引 / worktree-per-change で決定+コード同 commit / drift harness で docs を生かす / traceability links）

## 8. 関連
- DEC-005（賭ける層＝レイヤC）/ DEC-006（Tauri+Plate+Onlook アーキ。本書は Onlook 部分を DEC-007 で supersede）
- `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md`
- 上位フレーム: `shared/knowledge/sierra-soa-strategy.md`（プロセスの SoR）/ `ai-native-services-company-playbook.md`
