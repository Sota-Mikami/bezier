<!-- 作成日: 2026-06-25 / Owner: Head of Product -->
# ISSUE-006 — Agentic Map: diff × spec が駆動する「この変更のカバレッジ」ボード

| | |
|---|---|
| **Stage** | Idea → MVP（dogfood で芯を証明中） |
| **Owner** | Head of Product（spec） → Principal Engineer（build）→ QA Lead（verify） |
| **状態** | Draft — CTO / Principal Engineer / AI orchestration レビュー待ち |
| **由来** | CEO 承認済みの方向（2026-06-25 セッション）。DEC-133 の Map-A（スクショ方式）の上に立つ。 |
| **楔** | Bezier の maker-loop の中で最も「Orchestrator / 会話で導く」が弱いと判定された層（DEC-142）を補強する。Map は agent が「この変更で何を撮るべきか」を推論する最初の場所。 |

---

## 1. 問題（誰の・どんな痛みか・なぜ今か）

### 痛みの主体: solo maker（Mai）/ PM who can't design（Kenji）/ design lead（Priya）

**業界の現状（"design source of truth is broken"）**  
Anam Hira（Revyl / ex-Uber）の framing: 「誰も自分のアプリが実際にどう見えるか知らない。intended design は drift し、チームは定期的に人海戦術 QA（デザイナーがFigmaと実アプリを見比べる部屋）に逃げる。」

Bezier でも今この構造がある:
- **maker は Spec を書き、Design を承認し、実装させる。しかし「この実装が Spec の全状態をカバーしているか」は分からない。** 知る手段は Preview で手動に触るか、QA が採点するまで待つだけ。
- **現 Map（DEC-133）の問題**: `scope.routes` は maker が手動で設定する。何を撮るかを決める主体がまだ人間で、かつ「Spec で約束した状態（Empty/Error/Loading 等）をカバーしているか」という次元がない。
- **残った穴**: 「実装したが Spec 要件が抜けている」が見えない。「この変更が影響する画面はどこか」の推論が人手。

### なぜ今か
- DEC-142 コア価値監査で「Orchestrator / 会話で導く」層が最も薄い、と明確に判定された。
- `/bezier:states` が稼働し、Spec に状態定義が機械可読な受入基準として存在するようになった（DEC-105）。
- DEC-133 の Map-A（authed webview → PNG still）が実証済み。パイプラインは存在する。
- 三つが揃った今、「diff × Spec の交点を agent が推論して撮る」が現実の射程に入った。

---

## 2. スコープ（何を作るか）

### 2.1 コンセプト一文

> **agent が code diff × Spec の要件（状態）から「この変更でキャプチャすべきもの」を推論し、worktree で実際に動いているアプリのスクリーンショットを取って、screen × state のグリッドとして見せる。空のセルは「キャプチャできていない（coverage gap）」を意味する。**

### 2.2 ボード構造：screen × state グリッド

```
           | default | empty | error | loading | … (Spec 定義の状態列)
-----------+---------+-------+-------+---------+--------
/dashboard |  [PNG]  |  [?]  | [PNG] |   [?]   |
/settings  |  [PNG]  |  ---  |  ---  |  [PNG]  |
/profile   |   [?]   |  ---  |  ---  |   ---   |
```

- **行 = screen**（ルート単位。agent が diff から導出）
- **列 = state**（Spec の `/bezier:states` が生成した状態定義を参照。default 列は常に存在）
- **セル = キャプチャ済み PNG**、または **empty（gap）**
- `---` = その組み合わせがマニフェストに存在しない（agent が「不要」と判断）
- `[?]` = マニフェストに存在するが未キャプチャ（gap が可視化されている）

### 2.3 Capture Manifest（エージェントが書く設計図）

マニフェストは `<issue.dir>/map/manifest.json` に保存される（`.bezier` 配下 = gitignore = PR に入らない）。

#### 形状（first-cut）

```typescript
interface CaptureManifest {
  version: 1;
  generatedAt: string;        // ISO 8601
  baseBranch: string;         // diff の基点ブランチ（例: "main"）
  entries: ManifestEntry[];
}

interface ManifestEntry {
  id: string;                 // stable slug: "dashboard--empty" など
  label: string;              // 人が読む名前: "Dashboard — Empty State"
  route: string;              // URL パス: "/dashboard"
  state: string;              // 状態ラベル: "default" | "empty" | "error" | "loading" | <custom>
  source: EntrySource;        // このエントリがなぜ存在するか
  reach: Reach;               // このスクリーン+状態にどう到達するか
}

type EntrySource =
  | "diff"          // code diff から自動導出（直接変更したルート）
  | "spec"          // Spec の受入基準から導出（状態の列挙）
  | "diff+spec";    // 両方に紐づく（最も信頼度が高い）

// ★ reach フィールドの定義（これが本仕様の核心）
type Reach =
  | { kind: "url";     url: string }
    // → そのURLに遷移するだけで到達できる（クエリパラム含む）
    // 例: { kind: "url", url: "/dashboard?mode=empty" }

  | { kind: "seed";    command: string; url: string }
    // → DBシード/fixture を実行してからURLに遷移
    // 例: { kind: "seed", command: "npm run seed:empty", url: "/dashboard" }

  | { kind: "steps";   url: string; steps: string[] }
    // → URL に遷移後、順番にUI操作を実行
    // 例: { kind: "steps", url: "/dashboard", steps: ["click:logout", "wait:error-banner"] }

  | { kind: "harness"; note: string; url: string }
    // → 一時的なテストハーネス（専用ページ/フラグ）が必要
    // 例: { kind: "harness", note: "Add ?__bezier_state=empty to override fetch", url: "/dashboard?__bezier_state=empty" }

  | { kind: "manual";  note: string }
    // → 自動到達不可。空セル（可視化された gap）
    // 例: { kind: "manual", note: "Requires real payment failure; no mock path found" }
```

#### `reach` フィールドの重要な含意
- `kind: "url"` と `kind: "seed"` は Bezier が自動キャプチャできる
- `kind: "steps"` は将来の自動化候補（Phase 2 以降）、現時点は maker が手動確認
- `kind: "harness"` は agent が「この URL を試して」と提案し、maker が確認
- `kind: "manual"` は **空セルとして表示** → gap が目に見える
- `kind` が `"steps"` / `"harness"` / `"manual"` のセルは **空セル（gap フラグ）** と同じ扱い（Phase 1）

### 2.4 diff × requirements でターゲットを決める仕組み

```
[信号 A] code diff（vs base branch）
  → 変更されたファイルパス → Next.js ルート導出（DEC-133 changed-route.ts を拡張）
  → 直接影響ルート群: /dashboard, /settings, ...

[信号 B] Spec の受入基準（spec.md + /bezier:states の出力）
  → 状態定義: { screen: "/dashboard", states: ["empty", "error", "data-loaded"] }

[推論ステップ（agent）]
1. diff から影響ルートを導出
2. Spec から各ルートに対応する状態定義を読む
3. 各（ルート × 状態）について reach を推論して書く
4. manifest.json を出力

[キャプチャ実行（Bezier）]
- manifest.json を読む
- reach.kind === "url" | "seed" のエントリを順に処理
- 既存の authed webview + captureRegion パイプライン（DEC-133）で PNG を保存
- `<issue.dir>/map/<entry.id>.png`
```

### 2.5 ギャップ = 空セル（比較ではない）

- `reach.kind === "manual"` のエントリ → セルに「到達不可 / 手動確認が必要」バッジを表示
- キャプチャ試行したが取得できなかったエントリ → セルに「キャプチャ失敗」表示
- マニフェストに存在しないセルは表示しない（`---`）
- **ピクセル比較・前後diff・しきい値判定は一切しない**

### 2.6 再キャプチャのタイミング

- agent のターン完了後、worktree の変更が manifest のルートに触れていれば自動更新（DEC-133 の「ターン後自動再撮影」を拡張）
- maker が明示的に「Map を更新」ボタンを押した時
- manifest.json が更新された時（agent が書き直した時）

### 2.7 セルのインタラクション

- セルクリック → そのルートを Preview で開く（DEC-133 changed-route ナビと同じ仕組み）
- セルクリック（Spec 列あり） → 関連する受入基準にジャンプ（Spec タブへ）
- 「マニフェストを更新」ボタン → agent に manifest 再生成を依頼（`/bezier:map` コマンド経由）

---

## 3. 受入基準（Definition of Done）

以下の基準はすべて、maker が実機で確認できる形で証明できること。

### AC-1: diff 駆動のターゲット決定
- agent に「このルート（`/dashboard/settings`）を変更した実装」を渡した後、`manifest.json` が生成され、変更されたルートを含む entries が存在する
- entries は Spec の状態定義（`/bezier:states` の出力）と照合されており、`source: "diff+spec"` のエントリが存在する

### AC-2: reach フィールドの記述
- 全エントリに `reach.kind` が存在する
- `kind: "url"` のエントリに対して、Bezier が自動キャプチャを実行し PNG が保存される
- `kind: "manual"` のエントリは空セルとしてボードに表示され、note が tooltip 等で読める

### AC-3: ボード表示
- screen（行）× state（列）のグリッドが表示される
- PNG が存在するセルは画像（縮小 still）が表示される
- `reach.kind !== "url"` のセルは「gap」として空（またはバッジ付き）で表示される
- 行ラベルはルートパス、列ラベルは状態名

### AC-4: 空セルが coverage gap として読める
- 見た目だけで「撮れていないセルがある」と maker が判断できる（文字や色でなくても構わない）
- 空セルの tooltip / hover に reach.note が表示されるか、または「gap 理由」が分かる情報が存在する

### AC-5: 再キャプチャ
- agent ターン完了後、manifest のルートに変更があれば自動でキャプチャが走り、PNG が更新される（全手動クリックなしで）
- 「Map を更新」ボタンで明示的にキャプチャを起動できる（現在の DEC-133 動作の継続）

### AC-6: 既存機能の非退行
- DEC-133 の「ターン後自動再撮影」「Preview → Map のキャプチャフロー」が壊れない
- DEC-141 #5 の attach-first Preview（worktree URL 自動検出）が引き続き動作する
- `scope.ts` の `Scope { entry, routes }` は並存する（manifest は scope を置き換えない。scope = entry ポイント制御、manifest = キャプチャ対象の設計図）

---

## 4. スコープ外（CEO 承認済みのカット）

| カットしたもの | 理由 |
|---|---|
| アプリ全体のインベントリ（全ルートを網羅） | "this change" のフォーカスが楔。全体スキャンは別問題 |
| ピクセルパリティ / Figma vs 実装 diff | Bezier の問題定義ではない。Chromatic / Percy が持つ領域 |
| CI / E2E テストランナー | Playwright / Vitest を置き換えない。並走する |
| HTML デザインモックのスクリーンショット | Map は worktree の **実装**（コード）を撮る。モックは Design ボード |
| Live（常時起動の dev server）のスクリーンショット | worktree-per-change のスコープを維持。Live は別エリア |
| Storybook / component isolation | コンポーネント単位ではなく page/route 単位 |
| ビジュアルリグレッション（before/after 比較） | 「変化」ではなく「今この変更が何をカバーしているか」が問い |
| manifest の自動実行（`steps`/`harness` の自動操作） | Phase 1 はキャプチャ到達性の確認まで。自動操作は Phase 2 以降 |

---

## 5. 未解決の問題（CTO / AI orchestration レビュー向け）

### [Q-1] manifest の `reach` 生成を何が担うか
- agent（claude）が spec.md + git diff + repo の構造を読んで `reach` を推論して書く、という想定だが、どのタイミングでどのプロンプトから生成するか
- 選択肢: (a) `/bezier:map` コマンドを maker が明示的に実行 → agent が生成、(b) Spec ステージの `/bezier:states` 完了後に自動トリガー、(c) 実装ターン完了後に diff 判定して自動生成
- **聞きたいこと**: (b)(c) は agent に追加の推論ターンを要求するが、dogfood フェーズのコスト/レイテンシ的に許容できるか

### [Q-2] "screen" の単位をルートとするか、コンポーネントとするか
- 現実装（DEC-133）はルート単位。しかし「`/dashboard` の中の Empty State」はルートではなくコンポーネント状態
- `reach.kind: "url"` が URL パラメータやフラグで状態を切り替えられる前提だが、全ての状態が URL で表現できるわけではない
- **聞きたいこと**: Phase 1 は「ルート単位 + URL 到達可能な状態のみ」に絞るべきか

### [Q-3] Spec の状態定義との接続の形式
- `/bezier:states` は現在 `spec.md` の受入基準として自然言語で書かれる。manifest の state 列はその自然言語をどう機械可読なリストに変換するか
- 選択肢: (a) agent が spec.md を読んで state ラベルを自由に抽出（柔軟だが不安定）、(b) `/bezier:states` がフロントマターや JSON ブロックで構造化 state リストも出力する（変更が必要だが安定）
- **聞きたいこと**: (b) の方向で `/bezier:states` スキルを拡張すべきか

### [Q-4] 再キャプチャのトリガーとコスト管理
- ターン完了ごとに自動でキャプチャすると、長い実装セッションでは何度も走る
- DEC-133 では「プレビュー可視時のみ」「変更ページに限定」で制限している。manifest 版でも同じ制約を引き継ぐか
- **聞きたいこと**: manifest が大きい（エントリが 10+ ある）場合の時間上限をどう設定するか

### [Q-5] 認証 / データ依存の状態への到達
- "Error" 状態はサーバーエラーを意図的に起こす必要がある
- "Empty" 状態は DB が空の状態が必要（seed が必要）
- **聞きたいこと**: `reach.kind: "seed"` の `command` を Bezier が実際に実行するか（worktree で `npm run seed:empty` を走らせる）、あるいは maker への指示のみにとどめるか（Phase 1 は指示のみが安全か）

### [Q-6] manifest の決定論と再現性
- 同じ diff + spec でも agent の推論が変わりうる（非決定論的）
- manifest の entries を手動で編集（追加・削除・`reach` を書き換え）できるUIが必要か
- **聞きたいこと**: manifest の "agent draft → maker edit → lock" ワークフローを設けるか、それとも再生成コスト次第で「毎回 agent に再生成させれば良い」か

### [Q-7] 共有ページ（journey.ts）での Map の扱い
- 現在の共有ページ Map タブは「公開アプリ各ルートを縮小 iframe で並べる」（DEC-100）
- 新 Map は worktree 専用（共有リンクに worktree の stills を含める形は既存の仕組みとどう整合するか）
- **聞きたいこと**: 共有 Map は「キャプチャ済み stills を静止画として埋め込む」形（現在の design/html の共有と同じ）でよいか

---

## 6. フェーズ計画

### Phase 1 — 最小有効スライス（diff → URL 到達可能エントリのキャプチャ）

**目標**: 「agent が diff を見て manifest を書き、URL で到達できる状態を自動キャプチャしてボードに表示する」が1回転する

**含むもの**:
- `manifest.json` のスキーマ定義（`src/lib/manifest.ts`）
- `/bezier:map` コマンド（agent に manifest 生成を依頼するスラッシュコマンド）
- Bezier が manifest を読んで `reach.kind === "url"` のエントリを authed webview でキャプチャ
- ボード UI: screen（行）× state（列）グリッド（state 列は manifest から動的生成）
- 空セル（`kind !== "url"` または未キャプチャ）の表示

**含まないもの**（Phase 1 では skip）:
- `reach.kind: "steps"` の自動実行
- `reach.kind: "seed"` の command 実行
- `/bezier:states` からの自動 state 取得（Phase 1 は agent が spec.md を読んで自由抽出）
- ターン後の自動 manifest 再生成（Phase 1 は maker が `/bezier:map` を明示実行）
- セルクリック → Spec 受入基準へのジャンプ

**成功の証拠**: CEO が `/dashboard` を変更する Issue で `/bezier:map` を実行し、manifest が生成され、`/dashboard` の PNG が撮れてボードに表示される。空セルが少なくとも1つある。

---

### Phase 2 — Spec 統合（states × 自動 manifest 更新）

**追加するもの**:
- `/bezier:states` の出力から state ラベルを機械可読に抽出（スキル拡張 or agent 抽出）
- 実装ターン完了後に diff 判定して manifest 自動更新
- セルクリック → 対応する受入基準にジャンプ
- `reach.kind: "steps"` の maker 向け表示（「このステップを実行後に確認して」）

---

### Phase 3 — 到達性の拡張

**追加するもの**:
- `reach.kind: "harness"` の URL を Bezier が試みてキャプチャ
- `reach.kind: "seed"` の command を worktree で安全に実行（サンドボックス考慮）
- manifest の maker 手動編集 UI（`reach` を上書き可能に）
- 共有ページ Map タブの stills 埋め込み

---

## 7. 新規性とベストプラクティスの主張

### 既存の比較対象

| ツール | 何をするか | Bezier Map との違い |
|---|---|---|
| Storybook | コンポーネントを isolation で列挙 | コードベースの構造を前提。diff × requirements の交点を推論しない |
| Chromatic / Percy | コミット間のピクセル差分 | 変化を検出する（regression）。Bezier は「今何がカバーされているか」を示す（coverage） |
| Playwright | E2E テスト = 事前定義のシナリオを実行 | テストを人が書く必要がある。agent が `reach` を推論して書く、という層がない |
| Linear + PR bot | PR に変更ファイルを列挙 | スクリーンショットなし。状態の次元がない |

### Bezier Map が新しい点

1. **diff ∩ requirements = ターゲット。人間が決めない。** code diff と Spec（受入基準）の交点を agent が推論してキャプチャ対象を決める。今まで「何をテストするか」は人間が書いていた。
2. **`reach` フィールド = 「状態への到達方法」の形式化。** "Empty State" がどう作れるかを agent が推論して宣言する。その宣言が coverage gap を可視化する唯一の機構。
3. **空セルが情報。** ピクセル比較や PASS/FAIL でなく、「そもそも撮れていない」が gap。これは regression detection（変化したか）ではなく coverage awareness（カバーできているか）という別の問い。
4. **maker loop に埋め込まれている。** Spec → Design → Build のループの中で Map が自然に呼ばれる（/bezier:map）。CI ランナーや外部ダッシュボードに飛ばない。

### ベストプラクティスの主張が成立する条件
- maker が「自分の変更の全状態を一目で把握した」という体験を dogfood で確認できること
- 業界標準は「visual regression = 変化の検出」だが、Bezier は「coverage = 状態の網羅確認」を先に定義すること

Sierra フレームとの整合: 既存の QA ツール（Playwright / Chromatic）を置き換えず、その上に「maker が使える coverage 推論層」として差し込む（SoA として既存 SoR の上に立つ）。

---

## 8. 並行作業・依存

| 依存元 | 状態 |
|---|---|
| DEC-133 Map-A（authed webview → PNG still） | 実装済み・dogfood 確認待ち |
| DEC-133 changed-route.ts（diff → Next.js ルート導出） | 実装済み・テスト 10 件 |
| `/bezier:states` スキル（spec.md への状態定義出力） | 実装済み |
| `scope.ts`（`Scope { entry, routes }`） | 実装済み。manifest は scope を置き換えない |
| attach-first Preview（DEC-141 #5） | 実装済み・dogfood 確認待ち |

## 9. 参照

- `app/src/lib/scope.ts` — 既存 scope モデル
- `app/src/components/issues/issue-map.tsx` — 現 Map コンポーネント
- `app/src/lib/verify.ts` — machine evidence 収集（diff → files/sensitive areas）
- `playbook/decisions-log.md` DEC-133, DEC-141, DEC-142
- `playbook/research/2026-06-19_preview-open-changed-route-feasibility.md`
- `playbook/research/2026-06-18_preview-coverage-matrix.md`
