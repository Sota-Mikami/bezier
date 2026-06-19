<!-- 作成日: 2026-06-19 / Owner: COO 統合（head-of-product + principal-designer + principal-engineer） / Status: Spec 初稿・CEO レビュー待ち -->
# Spec — Preview 上の Figma/Framer 風ビジュアル編集（Layer / Style パネル）

> CEO 要望「現行 Preview の上に Layer パネル（左）＋Style パネル（右）を持ち、Figma 慣れユーザーが GUI でスタイル・並び替えを操作。実コード反映が、スタック自由な今の論点」。本書はそのフル仕様（実装未着手・設計のみ）。母体プラン: `~/.claude/plans/goofy-churning-turing.md`。

## 確定事項（CEO・2026-06-19）
1. **反映方式 = まず agent 経由のみ。** ライブ編集→構造化 intent→ユーザーの claude が repo の作法でコード化。スタック非依存・thesis 整合・既存「注釈→agent」レール再利用。
2. **【記録・今回作らない】将来 = ビルド計装で "決定論" を idiom 横断に拡大**（Tailwind 限定にしない）。§7 Future Work に設計概略（CEO 明示の memo 項目）。
3. **次の一手 = フル仕様を先に設計**（Phase 0 検証ウェッジは省略）。

## 設計統合時の調停（3 owner の食い違いを解消）
- **ライブ適用は "即時"**（PRD 初稿 AC-2 の「反映まで webview 不変」は撤回）。Figma 操作感＝即時フィードバックが必須。編集は `el.style` で即 DOM に反映→差分ストアに蓄積→「コードに反映」で agent に確定、の 2 フェーズ。designer/engineer 設計＋承認プランに一致。
- **Edit モードと注釈モードは排他**（PRD 初稿 AC-5 の「共存」は撤回）。注釈は freeze-to-screenshot で webview を hide、Edit は live webview 必須＝物理的に両立不可。モードトグルで切替、draft は跨いで保持。

---

## §1. サマリ — 二層と難易度
- **Layer A = ライブ GUI 編集**（選択・Layer ツリー・Style パネル・即時反映）= inspect 相当。**難易度 中〜高・数週**。新規性の核は「自前 inspector をネイティブ webview に注入」＋「ページ内オーバーレイ描画」。
- **Layer B = 実コード反映**（DOM 変更を repo の作法で source へ）= **製品の本体**。**既存の注釈→agent ループの拡張＝レール既設**で、新規配管はほぼ不要（`Annotation.diffs` 1 フィールド＋プロンプト数行）。
- **差別化**: 実際に走っているアプリの実状態（ログイン後・モーダル・hover・実データ）を直接編集できる。静的デザインツール（Figma/Framer）が触れない領域。

---

## §2. PRD（Owner: Head of Product）

### 解決する課題 / なぜ今
今の Preview は「見る」だけ。直すには注釈→自然言語→agent の往復が要り、1 スタイル変更 ≈ 2〜3 ターン / 5〜10 分（Figma なら数秒）。これが「Figma も Cursor も開いたまま」の主因。native webview 化（DEC-120）＋実状態 Preview（DEC-120/125/129）で、GUI 選択→構造化 intent の基盤が今そろった。固い問題チェック: Pain◎ / 既存予算◎（Figma 課金から乗り換え）/ AI 改善幅◎（曖昧言語 vs 機械的 CSS 差分で精度 10x）/ WTP◎（core ループ速度＝churn 直結）。

### ペルソナ / 主ターゲット
- **主 = Mai（solo-maker）**: 「色が少し違う」を 1 ターンで。Cursor との差＝**実行中状態を直接直せる**。
- **副 = Leo（design-engineer）**: 「GUI→構造化 intent→自分の agent が書く」を正しく評価。selector/property の正確さに敏感＝品質バー。
- **将来 = Kenji（PM）**: プロパティを自然言語ラベル化する Phase 2 以降で本ターゲット化。
- **対象外（Phase 1）= Priya（DS リード）/ Tom（agency）**。

### ユースケース
- **UC-1 Tailwind**: ヘッダ背景クリック→`bg-white`→`bg-gray-950`→「反映」→intent（selector/prop/before/after/idiom-hint=Tailwind）→agent が CLAUDE.md/design-system.md を読み className 書換→HMR。
- **UC-2 非 Tailwind（CSS Modules / CSS-in-JS）**: 角丸クリック→`4px`→`12px`→agent が `.module.css` を特定書換。**idiom 翻訳責任は agent**（Bezier は「repo の作法で `border-radius` を 12px に」と伝えるだけ）。
- **UC-3 状態依存 UI（固有の強み）**: ログイン後/モーダルの `backdrop-filter` 等を、開いたまま直接編集→agent が `Modal.tsx` 書換→HMR でその場反映。Figma は別フレーム再現が必要＝「実機と違う」が起きる。

### 受け入れ基準（DoD・Phase 1／QA がそのまま採点可能）
- **AC-1 選択**: クリックした要素を特定し computed style の最低 5 prop（color / background-color / padding 4 辺 / font-size / border-radius）を表示。任意タグ/コンポーネント出力で動く。選択→パネル表示 500ms 以内。
- **AC-2 編集（live・調停後）**: 上記 5 prop を Style パネルで編集→**即 webview に反映**（el.style）。color/bg は picker か HEX。
- **AC-3 intent 生成＋引き渡し**: 「コードに反映」で {selector/XPath, prop, before, after, idiom-hint(Tailwind/unknown を package.json で判定)} を生成し**既存 `sendDesignFeedback` で agent へ**（新 IPC/起動パスを作らない）。プロンプトに「repo の作法に従え・形式変換は agent 担当」の委譲文（JA/EN）。
- **AC-4 完走**: Tailwind / 非 Tailwind / 状態依存 UI の各で color/bg/padding/border-radius が 1 ターンで適用され HMR 確認。agent 適用後は自動リロードせず HMR 結果を表示。
- **AC-5 非破壊（調停後）**: 「反映」前は worktree 不変。**Edit と注釈は排他（モードトグル・draft 保持）**。Edit 中も Preview ナビ/リロード/デバイス変更は動く。
- **AC-6 検証は maker**: Bezier は agent 出力の正しさを検証しない（HMR 目視＝既存 Verify）。agent の「DS トークン外です」等はチャット表示のみ・ブロックしない。

### 作らないもの（Phase 1 Non-goals）
構造的並べ替えの source 反映 / ビルド計装（`data-bezier-id`）/ 複数選択一括 / リモート URL（attach）での編集 / agent 非経由の直接書換（thesis 矛盾）/ Layer パネル完全実装（Phase 1 は親/自身/直接子のみ）/ Typography 全項目 / DS トークンの自動強制。

### 成功指標（dogfood）
実 repo 5 ケース（Tailwind3 + 非 Tailwind2）で 選択→反映→agent→HMR を実測: 完走率 5/5・zero-correction 3/5 以上・中央値 45 秒以内・注釈経由比で平均 2 ターン以上削減。偽陽性 PMF 回避＝Mai ペルソナに 30 分 dogfood 後「次もこれで直す?」が Yes の時のみ PMF 証拠。go/no-go: zero-correction <2/5 なら Phase 2 前にプロンプト改善。

---

## §3. UX / デザイン（Owner: Principal Designer）

### 操作感の写像
**継承**: 左 Layers / 右 Style / クリック選択 / hover ハイライト / 選択枠＋寸法バッジ / 数値 scrub / Escape で親へ。
**割り切り（v1 外）**: Auto Layout の視覚ハンドル（flex は数値編集）/ multi-select / component props インスペクト / Tokens パネル / ベクタ・Frames。
**文化的差異の明示**: Figma は「描いたものがコードになる」、本機能は逆＝「コードが動いたものを調整しコードに戻す」。だから「ライブ変更→コードに反映」が 2 フェーズ。

### Layer パネル（左・幅 200px）
- **div スープ対策**: 既定は Semantic モード（semantic タグ / `data-*`・`aria-label` 保有 / 意味のあるクラス名（utility class は除外）/ 子 3 つ以上の div のみ表示）。「すべての DOM」トグルで全展開。
- 表示: `<>`=semantic / `#`=class div / `T`=text / `◇`=`data-component`。同一クラス兄弟は `(×3)` で畳む。選択同期＋hover 連動。**drag 並べ替えは v1 非対応**（appendChild 副作用＝agent に委ねる）。

### Style パネル（右・幅 240px）
意図グループで提示（CSS 羅列にしない）: ①LAYOUT(display/flex|grid/gap) ②SPACING(padding/margin) ③SIZE ④TYPOGRAPHY ⑤APPEARANCE(bg/border/shadow/opacity) ⑥POSITION(static 以外のみ・⚠ バッジ)。値入力＝クリック編集／ラベル scrub（drag・shift=±10・opt=±0.1）／↑↓。単位 px/%/rem/em/vh/vw（変換せず差替）。**computed vs override 区別**（override は `●`＋解除 `×`）。`globals.css` の CSS 変数が逆引きできれば `var(--x)` を薄く表示（read-only）。

### 選択・hover・ハンドル（ページ内注入オーバーレイ）
注入要素は `pointer-events:none`・`z-index:2147483647`。hover=1px dashed 青＋`[tag.class]` ラベル。選択=2px solid 青＋`[W×H]` バッジ＋padding(青 0.08)/margin(橙 0.08) 可視化。**リサイズハンドルは v1 表示のみ**（drag リサイズは `width:100%`/`flex:1` を壊すため不可）。同要素 再クリックで親へ／Escape で解除・親へ。

### 「コードに反映」フロー
メモリ内差分ストア（`{selector, prop, before, after, sourceHint?}`）。**Pending Changes Bar**（変更 0 で非表示）に「変更中 N 件 … [元に戻す][コードに反映↗]」。押下→`sendDesignFeedback` 経由で構造化プロンプト送信。状態: 反映中（bar をローダに・Style パネル read-only で二重送信防止・DOM 変更は残す）／反映後（HMR 一致→ストアクリア→1.5s トースト・address bar は現在パス維持）／失敗（差分保持＋[OUTPUT で確認][再試行][元に戻す]）。注釈の before/after 文化を踏襲＝「agent が書く、人が確認する」。

### IA 配置（禁則: タブ増殖で別アプリ化しない）
**Prototype > Preview 内の "Edit モード"**（新タブ/エリアにしない）。Preview ヘッダに `[Edit]` トグル。ON で Preview が左右 3 分割（LAYERS 200 / webview flex-1 / STYLE 240）＋下に Pending bar＋その下に既存ボトムパネル（DEC-126）。webview は `flex-1` で縮み `EmbeddedBrowser` の ResizeObserver が追従。**注釈モード（⌘⇧A）と排他**（一方 ON で他方 OFF・draft は surfaceKey で保持）。ショートカット（native menu accel 経由・DEC-120 パターン）: Edit トグル `⌘⇧E`／選択解除・親 `Escape`／戻す `⌘⇧Z`／反映 `⌘↵`。

### 状態 / 禁則
起動: `[Edit]`→`bezier-overlay.js` inject→DOM シリアライズ→Layer 描画→Style は「要素をクリックして選択」空状態。webview 非 ready 時は `[Edit]` disabled。CSP で注入失敗時は「DOM アクセス制限（CSP の可能性）」を表示。
**禁則**: webview の上に Bezier HTML を重ねない／注入オーバーレイに Bezier monochrome を当てない（青 tool chrome は可）／drag リサイズを出さない／差分を即コードに書かない（探索は DOM に閉じる）／Edit と注釈を同時 ON にしない／Layer の drag 並べ替えを v1 に入れない／Style を生 CSS ビューアにしない。

### ワイヤー（Edit ON・選択中・変更あり）
```
[◉稼働中] ← /dashboard ▾ [↗] [◻][💻][📱] [Edit●] [⌘⇧A]
├ LAYERS 🔍 ┬─────── webview（縮小）───────┬ STYLE ───────────
│ ▼ main    │  ┌ button.cta ● 148×44 ┐    │ LAYOUT display[flex▾]
│  ▼ .hero  │  └──────────────────────┘   │   gap ●[─16─]px
│   ▼ btn ● │                             │ SPACING pad ●[16][24]
├───────────┴─────────────────────────────┴──────────────────
│ ● 変更中 2 件 button.cta: padding 12→16, gap 6→16  [元に戻す][コードに反映↗]
├──────────────────────────────────────────────────────────────
│ OUTPUT  Terminal  ×        ← 既存ボトムパネル（DEC-126）
```

---

## §4. 技術設計（Owner: Principal Engineer）

### 注入チャネル（推奨 = A: eval ポーリング）
| | A eval ポーリング | B localhost WS | C dangerousRemoteDomainIpcAccess |
|---|---|---|---|
| 方式 | `initialization_script` でキュー設置→Rust が `embed_browser_eval` で 100ms 吸出し | loopback WS サーバ | 埋込 webview に Tauri IPC 付与 |
| 安全 | **IPC 露出ゼロ・既存 url ポーリングと同型** | ポート開放＝SSRF ゲート哲学と逆 | **NG（withGlobalTauri off の原則を破壊）** |
| コスト | 小（Rust 新規 1 コマンド） | 中〜大 | 極小だが不可 |
| レイテンシ | 100ms（hover/click に十分） | ~10ms | — |
- **Bezier→page**: `embed_browser_eval(script)` で `wv.eval("window.__bzEdit?.receive(" + JSON.stringify(msg) + ")")`（引数は Bezier 組立＝XSS は自バグのみ）。
- **page→Bezier**: `initialization_script` 注入の `bezier-overlay.js` が `window.__bzEdit={q:[]}`（`Object.defineProperty` で page からの上書き防止）にイベント push→100ms で `splice(0)` 吸出し。every-load 再実行で SPA 遷移後も自動再初期化。
- **汚染リスク範囲**: page の外部 JS が偽イベントを積んでも最悪「誤要素の CSS 差分送信」止まり。Tauri/IPC には到達しない（page から main IPC 不可）。

### in-page オーバーレイ
`document.documentElement` に `<bezier-overlay>`（`attachShadow({mode:'closed'})`・`:host{all:initial}`・`position:fixed;inset:0;z-index:2147483647`・通常 `pointer-events:none`、編集時のみ on）。Shadow DOM で page CSS と相互遮断。選択枠は `getBoundingClientRect()` を viewport 相対で更新。computed=`getComputedStyle`、適用=`el.style.setProperty`（before は適用前 computed を保存）。class トグルは v1 外。

### 構造化 intent = 既存 `Annotation` の最小拡張
```ts
export interface StyleDiff { prop: string; before: string; after: string }
export interface Annotation { /* 既存 */ diffs?: StyleDiff[] }
```
新型を起こさない（`kind:"element"` は既存完全サポート・`sendDesignFeedback`/`describe()`/numbered-lines/before|afterShot がそのまま使える）。1 edit = 1 Annotation(kind:"element", element:{selector,tag,classes,text}, diffs:[...]）。

### agent 反映
`describe()` の `"element"` 分岐に diffs 展開を追加（en/ja）:
```
2. [button.hero-cta セレクタ `.hero > button.hero-cta` 48%,72%] テキストを濃く
   color: rgb(51,51,51) → #1a1a1a / font-size: 14px → 16px
```
**要素特定の多層担保**: ①id 優先（`cssPath` が `#id` を返す）②text context（先頭 120 char）③注釈付き screenshot（既存 beforeShot）④位置 fraction ⑤opt-in 最小計装（`data-testid` があれば優先・非破壊）。round-trip（HMR 後の選択再アンカー）は Stage 1 外（送ったら消費）。

### 既存機構との両立
- **webview-singleton（DEC-130）**: `initialization_script` は `embed_browser_open` で 1 回設定（singleton で OK）。
- **overlay-freeze**: freeze 前に `wv.eval("__bzEdit.suspend()")`→clean な凍結、解除で `resume()`。`captureSlot` 前後に hook。**freeze 中はポーリング停止**（`visualEditActive && !frozen`）。
- **注釈モード排他**: Preview ツールバーのモードトグル（annotate=canvas overlay＋webview 下／visual-edit=canvas 非表示＋webview active＋`activate()`）。draft は surfaceKey で保持。
- **ナビ時クリア**: 既存 `urlTick`(onNavigate) で URL 変化検知→pending diffs 破棄（送信前 flush）。
- **SEC-1 整合**: `embed_browser_eval` は webview への eval のみ＝外部アクセスなし。loopback ゲートは load 先に対するもの（`embed_browser_open` で通過済）。

### 段階分解と規模
- **Stage 1（選択+Style+agent 反映・実装 2〜3 日＋QA 1 日）**: `lib.rs`（`initialization_script` 連鎖＋`embed_browser_eval` ~20 行）／`public/bezier-overlay.js`（Shadow overlay・hover/select・computed 読取・inline 適用・キュー ~300 行）／`annotations.ts`（StyleDiff＋diffs ~10 行）／`prompts.ts`（describeDiffs en/ja ~30 行）／新 `use-visual-edit.ts`（100ms ポーリング・activate/deactivate・キュー→Annotation ~150 行）／Preview ツールバー（モードトグル ~50 行）。**既存 `sendDesignFeedback`→`launchAgent --continue --add-dir` は一行も変えない**。
- **Stage 2（Layer ツリー・2〜3 日）**: 祖先 3＋直接子（上限 20）を push→`LayerTree` コンポーネント。
- **Stage 3（構造編集・3〜5 日・優先低）**: reorder(`insertBefore`)/remove。intent に `"reorder"/"remove"` kind＋before/after 両 screenshot。

---

## §5. ビルド・ロードマップ（spec が定義・今回は設計のみ）
- **段階1**: 選択＋Style（spacing/color/typography/layout）＋ライブ適用＋「コードに反映」を agent へ（最小 end-to-end）。
- **段階2**: Layer パネル（意味的グルーピング）＋hover＋Style 拡充＋Tailwind class 認識編集。
- **段階3**: 構造編集（並べ替え/wrap/複製）＝最難（control flow に触る）・agent 仲介中心。
- **段階4（将来・記録）**: §7 のビルド計装決定論を idiom 横断に拡大。

---

## §7. Future Work（記録）— ビルド計装での決定論反映（Tailwind 限定にしない）★CEO memo
**目的**: selector の脆さを根治し、単純な style 変更は agent を介さず source へ直接書き戻す。idiom（Tailwind/CSS Modules/styled-components/inline）を問わない。
```
[Build Plugin（opt-in・dev only）] Babel/SWC で JSX に data-bezier-id="<file>:<line>:<col>" 注入
   対応: Next(swcPlugins) / Vite(plugin) / Remix / Astro。本番 build は skip。
[runtime] el.dataset.bezierId → "src/app/page.tsx:42:3"
[Write-back Router] {bezierId, prop, before, after}
   1. source-map lookup → JSX AST node
   2. IdiomWriter で idiom 検出して書換:
        interface IdiomWriter { matches(node): boolean; write(node, diff): FileChange }
        TailwindWriter / CSSModulesWriter / StyledComponentsWriter / InlineStyleWriter …
        新 idiom（Panda/UnoCSS 等）は IdiomWriter 追加だけ（計装は共通）
   3. worktree のファイル直接更新 → HMR → data-bezier-id で選択を再アンカー
[opt-in] framework 検出（既存 detectApps 同型）→「精密編集を有効に?」を一度提示
   → agent が config に withBezier(config) を 1 行追加。無効時は現行 agent フローにフォールバック
[agent との関係] 単純 style=writer 直処理（agent-less）／意図・条件分岐・複数コンポ跨ぎ=sendDesignFeedback。両者併用可。
```
着手は Stage 3 後が適切（Stage 2 中に Next の Babel plugin 数十行で PoC 1 日可）。**着手時に `playbook/decisions-log.md` ＋ memory[[live-preview-robustness]] に正式記録する。**

---

## §8. 未解決リスク（top 5）
1. **HIGH `initialization_script` × Next App Router（RSC ストリーミング）**: DOM 差替で shadow host が消え得る→`MutationObserver` で再 append（実機確認必須）。
2. **HIGH selector 不安定→agent 誤ファイル変更**: 動的 class（tailwind-merge/clsx）・生成 id（useId）。緩和=text/position fallback、根治=Stage 4 `data-bezier-id`。
3. **MEDIUM freeze × edit 同時**: freeze 中はポーリング停止＋`suspend/resume`。
4. **MEDIUM ポーリング eval コスト×単一スレッド**: hover は in-page で 16ms throttle、結果だけ 100ms 取得。
5. **LOW `embed_browser_eval` の任意 JS 実行**: 呼出し元は Bezier React のみ（main IPC 限定）。内部専用に留め capabilities に出さない。

---

## §9. 検証（実装後・dogfood）
実 repo（Tailwind1 / 非 Tailwind1）で 選択→spacing/color 変更→「コードに反映」→agent が正しい idiom で書き HMR 一致、を 5 ケース実測。**操作感**（Mai ペルソナが GUI で完結し「次もこれで直す」と言うか）と **反映精度**（zero-correction 3/5 以上・完走 5/5）を `playbook/research/` に記録。検証前に本 §4/§9 の受け入れシナリオを固定。

---

## 追記 — ペルソナ検証 R1 → 実装/延期（2026-06-19）

CEO「デザイナー/PdM に触らせて feedback → UX を上げて」＋「Figma みたいな使い勝手（編集できる要素・ショートカット・キーボード操作）」「Layer で並べ替えたい」「Style パネルは できること少ない・分かりにくい・数字は ↑↓ で変えたい」。→ persona-{solo-maker Mai / design-engineer Leo / pm-cant-design Kenji / ds-lead Priya / agency-designer Tom} に as-shipped を触らせて率直 feedback を収集。

**収束した Must（複数ペルソナ＋CEO）→ 実装済（commit d6a2858）**:
- 数値の **↑/↓ ステッパー**（Shift ×10・Alt ×0.1・単位保持）。
- **編集できるプロパティ大幅拡張**: margin L/R（**抜けていた＝バグ**）、border(width/style/color)、box-shadow、letter-spacing、flex-grow/align-self、Position（position+top/right/bottom/left/z-index）+overflow。
- **enum はドロップダウン**（display/flex-direction/justify/align/text-align/position/overflow/border-style）＋flex/position フィールドの条件表示。
- **per-prop リセット(↺)＋override 行ハイライト**、**Undo(⌘Z/ボタン・実履歴)**。
- **Layer パネルで子をドラッグ並べ替え**（ライブ DOM 移動＋reorder intent を agent へ）。
- **Esc→親 / ⌘Z→Undo**（Bezier フォーカス時）。Clarity（「反映するまで実コードは変わりません」・空状態のキーボードヒント）。

**延期（次ラウンド・記録）**:
- スタイル **コピペ ⌘⌥C/V**（Tom 強く要望・throughput）。
- **トークンガバナンス**（Priya）: 逆引き表示・非トークン値の警告・**strict mode**・差分のトークン使用明示・**PR 経由必須/監査ログ export**。＝**企業配布の前提条件**。個人 dogfood では不要。
- **インラインのテキスト/コピー編集**（Mai「ビジュアル編集なのにテキスト触れないのは看板倒れ」）＝構造編集寄り。
- **複数選択一括 / 完全 DOM ツリー / font-family**。
- **webview フォーカス中のショートカット**＝native menu accelerator（⌘K ブリッジと同型）。今は in-field ↑↓＋ボタンで代替。

**ペルソナ別の要点**: Mai＝「触れる領域が狭すぎる」→拡張で前進、テキスト編集はまだ。Leo＝Undo/diff ビュー/flex 子/position が要・selector 脆さ懸念→将来ビルド計装。Kenji＝CSS 生値が怖い→ドロップダウン化で前進、まだ用語の平易化余地。Priya＝**今は組織配布不可**（ガバナンス穴）→個人向けは可・企業向けは延期項目が前提。Tom＝コピペ＆border/shadow＆↑↓が無いと量産に使えない→border/shadow/↑↓ は実装、コピペは次。

> 次アクション: R2 = コピペ ⌘⌥C/V ＋ Priya 向けトークン警告（軽量版）。企業 strict/監査は配布判断時に別 DEC。

## 追記 — R2（2026-06-19）: 並べ替えバグ根治 ＋ Figma/Framer UI 寄せ

CEO「Layer の並び替えがうまくできてない・根本調査して」「もっと Figma/Framer を研究して UI も寄せて」。

**並べ替え根治（commit aa6603e）**: 真因＝**Tauri/WKWebView では HTML5 DnD は dragstart で `dataTransfer.effectAllowed`＋dragover で `dropEffect` を設定しないと drop が成立しない**（既存の動く `useDragReorder`(`lib/use-ordered.ts`) はこれを設定している・初稿は欠落＝onDrop が発火していなかった）。+ overlay `moveNode` を「移動した子」でなく「選択中の親」を再報告するよう修正＝兄弟リストが更新され連続並べ替え可。**教訓: 本アプリの in-app DnD は effectAllowed/dropEffect 必須。**

**Figma/Framer UI 寄せ（commit db8e735・principal-designer 仕様）**: Style パネルを Figma のセクション順（Frame/Position/Layout/Spacing/Fill/Stroke/Effects/Type）に再構成。2 カラムのペア数値入力（W/H・padding・margin・fs/fw・lh/ls・T/R/B/L）、**整列はドロップダウンでなくアイコン SegmentedControl**（flex-direction/justify/align/text-align/border-style・lucide 整列アイコン）、Fill/Stroke/文字色は**スウォッチ＋HEX 行**、flex/position は条件表示、override 行は ring＋hover ↺ reset。Layer パネルは**タグ別 lucide アイコン**＋h-[22px]＋選択=bg-accent の Figma 風ツリー。割り切り（spec §4）＝ラベルドラッグ scrub・複数 Fill・blend mode・grid inspector・dashed/dotted は文字代替・space-around/evenly 省略。

> 次アクション（R3 候補）: ラベルドラッグ scrub・コピペ ⌘⌥C/V・Priya 向けトークン警告（軽量）。
