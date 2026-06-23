<!-- 作成日: 2026-06-23 / Owner: CTO (Claude) → CEO / branch: feat/maker-loop-edit-surfaces -->
# Maker ループ刷新 — 実装スペック（コア価値ギャップ対応）

> 由来: 2026-06-23 のコア価値監査（`2026-06-23_core-value-cto-audit.md`）→ CEO と build-vs-buy を握った結果の実装計画。
> 4 ワークストリーム。**E-3 / E-4 は実装・検証済（branch にコミット済）**。**E-1 / E-2 は本スペックで設計確定 → ペルソナ自己レビュー → CEO 承認 → first-cut 実装 → CEO dogfood** の順（理由 = §方針）。

## 方針（なぜ 2 つ実装・2 つ設計か）

- CEO 指示 = 「議論したベスト UX/アーキ/実装で**進め切る** → 承認依頼の前に**ペルソナがセルフレビュー**して**改善の道筋**を立てる → 承認」。
- **E-3（ハンドオフ）/ E-4（オーケストレーションのループ哲学）= ロジック/プロンプト**。tsc/eslint/vitest で**完全に静的検証可能** → 実装済み。
- **E-1（編集面）/ E-2（BlockNote）= インタラクティブ**（webview/iframe 注入・エディタ刷新）。**私もペルソナ Agent も「クリックして」検証できない**。最初の実地検証は CEO の dogfood。さらに **E-2 は毎日使う `spec.md` を別エディタで上書きする＝破損リスク**。
- よって最も価値が出る順序 = **大きい 2 つは「設計を先にペルソナ・レビュー」→ 改善の道筋を反映してから first-cut 実装**。これは CEO の要求フロー（自己レビュー→改善の道筋→承認）と完全一致。確定設計を blind 実装してから直すより手戻りが少ない。

---

## E-3 ✅ ハンドオフ（実装済・コミット ffa8fe0）

- **バグ修正**: `openPR` の compare-URL フロー（DEC-141 #3）が `ref.prUrl` を一切セットせず → 自動マージ検知と「Open PR」リンク再表示が無言で停止（= ハンドオフ後 Bezier が PR を忘れる）。push 成功後に compare URL を **PR-opened マーカー**として永続化（`writeWorktreeRef`＋`setRef`/`setPrUrl`）。マージ検知はブランチで `ghPrState` を引くので、マーカーがあれば正しく復活。
- **prefill 強化**: `docs/handoff/<id>.md`（既に diff に同梱される意図/受入基準/QA/preview-env バンドル）に **公開レビューリンク**（`share-urls.json[issue.id]`）を追記 → 引き継ぐエンジニアが**動くもの**を即開ける（localhost と違いそのまま開ける）。
- **CEO 確定方針との一致**: 「必要コンテキストを PR に prefill → 操作者が調整 → GitHub GUI で作成」= 現フロー＋リンク強化＋バグ修正で達成。アプリ内の担当者指定/通知は**作らない**（GitHub に委ねる）。
- 検証: tsc0/eslint0/vitest96。Rust 変更なし。
- フォローアップ: 人が「Create」した後の**正規 PR URL** を `gh pr view --json url` で解決（Rust `gh_pr_view` 追加）して compare URL を上書き＝リンクが正規 PR を指す。今は compare URL で機能上十分。

## E-4 ✅ オーケストレーション = 非線形ループ哲学（実装済・コミット efd2d82）

- **問題**: 看板「AI Agent Orchestrator」の実体が**一回限りの線形シードプロンプト**（Clarify→Spec→Design→Implement）。AI はループを跨いで能動誘導せず、**後ろに戻る**概念も無し。状態機械も無し（status=open/in-progress/merged のみ）。
- **CEO 確定方針**: 「**完了ゲートは作らない**（作りながら反復＝ウォーターフォールにならない）。ステータス自体は持って良い。AI が**前にも後ろにも**次の一手を提案するガイド役」。
- **実装**: `bezierGuideDoc`（**毎ターン読まれる durable ガイド**）に `loopBlock`（en/ja・型でパリティ強制）を新設＝「Bezier はループ・**完了ゲート無し**・意味ある一手ごとに**1つの next move を能動提案**（前=要件→デザイン→プロト→共有/引き継ぎ／後=プロトで気づいた穴→spec 修正）・現在地は**自分で見て**把握・**強制しない**・Spec⇄実装を同期」。
- **意図的に状態機械にしない**: CEO が「Spec 完了という状態は無い」と明言。重い state machine は不採用。「現在地（terrain）の可視化チップ」は UI=dogfood 反復に回す（§E-4 next）。
- 検証: tsc0/eslint0/vitest96。Rust 変更なし。
- **E-4 next（dogfood 反復・UI）**: `lib/loop-state.ts`（純関数・単体テスト可）で issue の terrain を**事実**として導出（spec 本文有/`design/`html 数/プロト稼働/共有・PR 有無）→ ヘッダに「今ここ」チップで可視化＋agent シードにも terrain を明示注入。UI なので CEO dogfood 前提で後追い。

---

## E-1 🎯 編集面の分離＋共通化（設計確定・実装は承認後 first-cut）

### CEO 確定の面モデル

| 面 | 編集 | コメント/Pen | 反映 |
|---|---|---|---|
| **md（要件定義）** | 書く（E-2 のエディタ） | コメント | エディタが md に直接保存（E-2） |
| **HTML モック（デザイン検討）** | **Layer＋Style＋テキスト編集** | コメント＋Pen | **その HTML ファイルに直接・確定的に書き戻し（agent 不要）** |
| **Preview（実装）** | なし | コメント＋Pen | コメント/Pen → agent 指示（既存レール） |

### いまの捻れ（監査で判明）

重い編集（Layer/Style/Text）が **Preview の native webview** に乗り、**HTML モックは編集不可の置物**（`issue-design.tsx:322` `sandbox=""` `srcDoc`）。CEO の希望と**逆**。

### アーキテクチャ（共通化＝CEO「うまくできる所は共通化してスケーラブルに綺麗に」）

**鍵となる発見**: ビジュアル編集エンジン `OVERLAY_JS`（`lib/bezier-overlay.ts`）は**自己完結した注入スクリプト**で、native webview への結合は**トランスポートだけ**（`embed_browser_eval` で注入・`embed_browser_drain` で `window.__bzEdit.q` を吸い上げ）。**iframe（same-origin srcDoc）なら同じスクリプトが direct `contentWindow` で動く**。→ エンジンは**そのまま再利用**、**新しい継ぎ目はトランスポート抽象だけ**。

1. **`VisualEditTransport` インターフェース**（新規 `lib/visual-edit-transport.ts`）:
   ```
   interface VisualEditTransport {
     evalJs(code: string): Promise<void>;        // OVERLAY_JS 注入 / コマンド実行
     drain(): Promise<BzEdit[]>;                  // キュー吸い上げ
   }
   ```
   - `webviewTransport(embedId)` = 既存 Tauri `embed_browser_eval`/`embed_browser_drain` ラップ（現 use-visual-edit のコードを移設）。
   - `iframeTransport(iframeEl)` = `iframe.contentWindow.eval(code)` ＋ `contentWindow.__bzEdit.q.splice(0)` を直接読む（IPC 不要・同期）。same-origin srcDoc 前提。
2. **`use-visual-edit.ts` をトランスポート注入に**: フックは `VisualEditTransport` を受け取り、注入/activate/drain ループ/apply/setText/moveNode を**トランスポート越し**に呼ぶ（現状の Tauri 直呼びを置換）。`visual-edit-panels.tsx`（Layer/Style パネル）は**完全に面非依存**＝無改造で再利用。
3. **HTML モックを編集可能に**（`issue-design.tsx`）: Edit Mode 中の variant は `sandbox="allow-scripts allow-same-origin"`＋`srcDoc`（生成 HTML は自分の信頼物）。マウントで `iframeTransport` を作り `use-visual-edit` に渡す。
4. **確定的な書き戻し**（新規 `serializeVariant`）: 編集後、`iframe.contentDocument.documentElement.outerHTML` から **overlay host（`#__bz_overlay_host`）と注入 script を除去**して整形 → `writeFile(variant.path)`。**agent 不要・即時・決定論的**（overlay の編集は inline style / textContent / 並べ替え＝全て live DOM 変異なので serialize で捕捉）。保存は debounce＋「破棄=reload」。
5. **Preview を comment+pen only に**（`preview-pane.tsx`）: Edit Mode トグルと visual-edit 配線を Preview から撤去（`AnnotationLayer` のコメント/Pen は存置）。`webviewTransport` は当面 dormant（将来 native Tauri アプリのライブ編集で再利用余地・記録）。
6. **per-surface ツール gating を明示**（`annotation-surfaces.ts` 隣に小さな宣言）: md=comment / mock=layer+style+text+comment+pen / preview=comment+pen。`⌘⇧A`（注釈）と Edit Mode の排他（DEC-131 CP1）は mock 面で踏襲。

### 反映の綺麗な二分（CEO「綺麗な実装」）
- **モックの編集 → ファイルに直接書き戻し（決定論・自作で速い）**。
- **Preview/md の編集・指示 → agent 経由（repo の作法でユーザーの agent が書く）**。
- = 「確定的に書ける所は自作で速く、repo コードは AI に委ねる」責務分離。

### リスク / dogfood で見る点
- iframe 注入の same-origin 制約（srcDoc は same-origin 扱い＝OK のはず・dogfood で実機確認）。
- `serializeVariant` の整形品質（生成モックは throwaway なので outerHTML 整形で可）。
- セレクタ脆さ（既知・`cssPath` nth-of-type）。モックは静的なので Preview より安定。
- 検証不能点 = **クリック動作**。だから設計レビュー→承認→first-cut→**CEO dogfood** の順。

---

## E-2 🎯 md エディタを BlockNote 化（設計確定・実装は承認後 first-cut）

### CEO 確定方針
- 「今の md エディタも悪くないが、**乗り換えた方が全体の完成度が上がる** → BlockNote にしたい」。md 面は「**書く＋コメント**」で十分。
- BlockNote = **無料**（コア MPL-2.0）。XL（AI/多段組）は使わない＝$0。

### 最重要リスク = `spec.md` を壊さない（md が SoT）
`spec.md` は **agent が読み書きし git にコミットされる Markdown**。BlockNote はブロック JSON が内部表現で、md 変換は**ロッシー**（API 名 `blocksToMarkdownLossy`）。**毎保存で agent の spec が壊れる/整形が飛ぶのは不可**。

### 採用アーキテクチャ = **Markdown を SoT に保つ**
1. **ファイルは常に Markdown**（現状維持）。`slot-editor.tsx` の watch-poll／conflict 機構（agent 外部編集の検知・マージ）を**そのまま土台に**。
2. **読み込み**: ファイル md → `tryParseMarkdownToBlocks` → BlockNote 表示。
3. **保存**: BlockNote → `blocksToMarkdownLossy` → md ファイル書き込み（debounce）。**round-trip を spec 代表形（見出し/箇条書き/チェックボックス/表/コード/リンク）で単体テスト**して非破壊を担保（破壊するなら採用見送り→ TipTap or 現 CodeMirror 継続）。
4. **agent 外部編集**: ファイル md が変わったら（poll）再パースしてブロック再構築（編集中フォーカスは上書きしない＝現 slot-editor の作法踏襲）。
5. **テキスト選択コメント → AI**: BlockNote の選択範囲（ProseMirror selection）に「コメント」アクション → **既存の `sendDesignFeedback`/`docFeedbackPrompt` レールに乗せる**（注釈→agent の glue は既にある）。Liveblocks の有料コメントは**使わない**（CEO 方針）。アンカーは選択テキスト＋前後文脈で表現（行が動いても意味で再特定）。
6. **依存**: `@blocknote/core`＋`@blocknote/react`＋`@blocknote/mantine`（or shadcn ラッパ）。コアのみ＝$0。`package.json` に追加。

### 影響ファイル
`components/workspace/markdown-editor.tsx`（CodeMirror→BlockNote 置換）/ `slot-editor.tsx`（保存・watch・conflict を BlockNote 入出力に）/ `issue-docs.tsx`・`issue-design.tsx`（doc 面に選択コメント surface 追加）/ `lib/prompts.ts`（doc コメントは既存 `docFeedbackPrompt` 流用）。

### リスク / dogfood で見る点
- **round-trip 非破壊が全て**（単体テストで gate・代表 spec で実証してから本実装）。
- スラッシュ/ペースト/画像・表など現状の Notion 風機能の同等性。
- 検証不能点 = タイピング体感 → CEO dogfood。

---

## ペルソナ自己レビュー結果 → 改善の道筋（確定）

レビュアー: principal-engineer / qa-lead / Mai(solo-maker) / Kenji(pm-cant-design) / Priya(ds-lead) / Daniel(handoff-eng) / Leo(design-eng)。**E-3/E-4 = ship 可**（cheap な改善2点は適用済）。E-1/E-2 は下記を実装前に織り込む。

### 収束した最重要シグナル（= 再シーケンス推奨）
1. **terrain（E-4 後続）を「後で」→「次・最優先」へ昇格**。loop doctrine はプロンプト文だけだと Clippy 化（Mai/Leo/Kenji/PE 全員一致）。「今どこか」を UI チップ＋agent シードに**明示注入**して初めて提案が賢くなる＝orchestrator を本物にする最高レバレッジ。
2. **BlockNote（E-2）の優先度を下げる**。主ペルソナ Mai が「今のエディタで困ってない・後回しでいい」。痛点は editor でなく terrain と mock 翻訳品質。
3. **HTML モック生成が repo の部品/トークンを使えているかが、モック工程の存在価値を決める（Mai）**。使えてないと「置物を磨くだけ」＝spec から直接実装の方が速い。**moat（repo 規約継承）の核**。

### E-1 実装前の必須対応
- **[HIGH] 生成 HTML の `<meta CSP>`/`X-Frame-Options` を Edit Mode マウント前に除去**（PE — でないと eval 注入がブロックされる）。
- **[HIGH] `serializeVariant` の overlay-host 除去を単体テスト**（QA — 漏れると commit HTML に overlay が混入）。
- **[MED] iframeTransport の drain は `__bzEdit.drain()` ヘルパを poll**（PE — reorder イベントのレース回避）。
- **[MED] mock 保存時に構造 diff を agent context に自動注入**（Leo — prose 再説明の seam を消す。"反映は agent 経由のみ" は保ちつつ agent が指示でなく diff を読む）。
- 受入: discard=disk から reload / タブ復帰で再注入 / annotate⊻edit 排他 / preview に Edit 無し / same-origin 注入の実機確認（QA）。

### E-1 + 実装の DS 逸脱対策（Priya・チーム期は必須／solo は段階導入）
- スタイルパネルに**トークン候補表示＋DS 外値に警告**（raw CSS のままなら org 導入不可）。
- **モック→実装の reconciliation**: 実装前に inline style を `design-system.md` トークンに突き合わせ「対応トークン/無し」を明示、無し=承認ゲート（magic number の repo 流入防止）。
- per-value 変更ログ（git diff 以上の粒度・将来）。

### E-2 実装前の必須ゲート
- **[HIGH] round-trip 非破壊ゲートを実 spec.md で**（PE/QA/Leo）: 見出しレベル/箇条書き/チェックボックス/表/コード/リンク/太字斜体。構造欠落＝**BlockNote 採用却下→現 CodeMirror 継続**。
- **[HIGH] 保存後 `baselineRef` を更新**（PE — でないと毎 agent ターンで幻の「外部変更」conflict バナー）。
- 選択コメント→AI 後に**変更サマリ（diff）を提示**（Kenji — 他セクションを黙って書き換えない確認）。

### ハンドオフ（E-3 強化・Daniel）
- **[cheap] PR 本文に review リンク＋受入基準を直接 prefill**（compare URL の `body=`・commit ファイルへ潜らせない）。
- QA 行に**実行ステータス**（env X で実行/未実行）— auto-seed と実走を区別。
- **stubbed-surface インベントリ**（mock 返却の file/関数・RLS bypass・未試行エラー）＋ backend provenance（最低 `SUPABASE_URL`）。`publish-env.json` 空は write 時に hard 警告。
- 決定ログに **Rejected options** 節。

### E-4 後続（terrain・最優先昇格）
- `lib/loop-state.ts`（純・単体テスト）で terrain を事実導出 → ヘッダ「今ここ」チップ＋agent シードへ注入。提案を**内容接地**（Kenji「3 roles 定義／flow は 1」級の具体性）。
- 共有コメント→agent 届達 v1（GH 非同期）＋**非 GitHub 受信者フロー**（Mai）。

### 適用済みの cheap 改善（このレビューから即反映）
- E-4: loop doctrine を「返信の最後・作業が一区切り時のみ 1 提案（途中・保存毎には出さない）」に絞り込み（QA/Mai のうるさい化対策）。
- E-3: merge-detection 呼び出し側に `prUrl` が compare URL である旨のコメント追加（QA）。

---

## 着手順（承認後・再シーケンス反映）
1. ペルソナ自己レビュー → 改善の道筋（**完了**・本セクション上）。
2. **CEO 承認待ち** ← 今ここ（E-3/E-4 を prod 反映＋下記の再シーケンスを green-light）。
3. **terrain（E-4 後続）を最優先で**: `lib/loop-state.ts`＋「今ここ」チップ＋agent シード注入。loop doctrine を内容接地にする（これ無しだと提案がノイズ化＝レビュー総意）。
4. **E-1 first-cut**: 上の必須対応（CSP 除去・serializeVariant テスト・drain ヘルパ・mock 保存 diff→agent context）込みで実装 → 静的検証 → CEO dogfood。**モック生成が repo 部品/トークンを使えているかを最初に確認**（Mai）。
5. **E-2（後ろへ）**: round-trip 非破壊ゲートを実 spec.md で先行 → 通れば first-cut → dogfood（通らなければ CodeMirror 継続）。
6. ハンドオフ強化（PR body prefill・QA 実行ステータス・stubbed inventory）と DS 逸脱対策（Priya）を段階的に。

(コア価値監査 = `2026-06-23_core-value-cto-audit.md`。)
