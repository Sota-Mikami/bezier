# CTO Review — ISSUE-006 Agentic Map
> 作成: 2026-06-25 / Principal Engineer  
> 対象: `product/issues/ISSUE-006.md`  
> 接地: 実コードを読んで判定（DEC-133 実装・DEC-141 attach-first・`capture_region` Rust コマンド）

---

## 0. 一行 Verdict

**GO-with-caveats** — Phase 1 は buildable。ただし「entry.id の安定性」をコード側で解決してから着手すること（後述 BLOCKER）。

---

## 1. 実装基盤の現状確認

### 1.1 DEC-133 Map-A の実際のコード

**キャプチャパイプライン**（DEC-133 Map-A）は以下 3 層で完成している:

```
captureRouteStill (preview-pane.tsx:456-475)
  → captureRegion (ipc.ts:246-253)
  → Rust capture_region (lib.rs:724-768)
  → macOS screencapture -x -R {x,y,w,h} {out_path}
```

制約は lib.rs:735 に明記: **`out_path` は `.bezier` ストア内でなければ拒否**。これは manifest.json / PNG の保存先 `<issue.dir>/map/` が既に `.bezier` 配下であることと整合する。

**現在の Map の形**: `scope.routes` (string[]) → flat 1 列グリッド。各ルートに 1 PNG (`<issue.dir>/map/<slug>.png`)。`routeSlug("/dashboard")` → `"dashboard"`。

**自動撮影**: preview-pane.tsx:519-529 — エージェントのターン終了 (`turnEnded = status==="ready" && agentが停止`) に `applyChangedRoute({ capture: true })` が走り、変更した 1 ルートだけ再撮影。これは ISSUE-006 の「ターン後再撮影」ベースとして使える。

**一括撮影のオーケストレーション** (build-review.tsx:49-73):
```
IssueMap.onCapture(routes) 
  → setTab("preview")       # Preview タブに強制切替（webview を可視に）
  → setCaptureReq({ routes, nonce: prev+1 })
  → PreviewPane の nonce effect が発火
  → navigateAndSettle(route) × N + captureRouteStill(route) × N
  → handleCaptureDone() → setTab("map")  # Map に戻る
```

### 1.2 `/bezier:states` の実際の出力形式

`commandPack()` (prompts.ts:967, 1063-1081) の `/bezier:states` コマンドは:
- spec.md の "acceptance criteria" に**自然言語**で状態を書く
- 構造化 JSON/YAML は出力しない
- 出力例: `"- Empty: when the list has 0 items, show an illustration + a 'Create your first X' CTA"`

これは Q-3 への回答に直結する（後述）。

### 1.3 attach-first Preview (DEC-141 #5)

preview-pane.tsx:543-553: `captureReq` nonce effect の先頭でガード:
```typescript
if (status !== "ready") { onCaptureDone?.(); return; }
```
Preview がサーバー未起動状態なら capture は即座に no-op で終了する。これは正しい挙動。

---

## 2. Engineering Open Questions — 具体的推奨

### Q-1: Manifest 生成のトリガーとコスト

**推奨: (a) `/bezier:map` 明示実行のみ（Phase 1）**

理由:
- (b) `/bezier:states` 完了後の自動: `spec.md` への書き込みはエージェントが自由テキストで行う。「完了」イベントは構造化されていない（pty の文字ストリームからは検知不能）。実装コストが高くリスクあり。
- (c) ターン完了後の自動: 1 ターンごとに diff + spec.md 読み + reach 推論 = Claude API コスト 2-8k トークン/ターン。dogfood スケールでも毎ターン走ると積み上がる。

コスト/レイテンシ的に許容できるか: **許容できない（自動の場合）**。manifest 生成は diff → ルート導出 → spec.md 読み → 各ルート×状態の reach 推論という実質的な reasoning タスク。1 回の明示実行なら問題なし。

Phase 2 で「実装ターン完了後に `diff ∩ manifest.routes` を見て、影響ルートがあれば manifest の reach.kind==="url" エントリだけを**再キャプチャ**（再生成ではなく）」を追加すれば足りる。manifest 再生成は maker が明示的に行う運用で十分。

### Q-2: "screen" 単位はルートとすべきか

**推奨: Phase 1 はルート単位 + URL 到達可能な状態のみ。コンポーネント単位は Phase 3 以降。**

コード上の根拠: `capture_region` は `screencapture -R {x,y,w,h}` で **画面領域** を撮る (lib.rs:752-755)。DOM 要素の座標を取るには `eval_with_callback` チャネル (DEC-131 Edit Mode) が必要だが、これは「値を返す」であり「その座標を capture_region に渡す」は別途実装が必要。Phase 1 の工数に収まらない。

URL パラメータ (`/dashboard?mode=empty`) による状態切替は `navigateAndSettle` がそのまま使えるため「URL 到達可能な状態」は Phase 1 に含められる。

### Q-3: `/bezier:states` との接続形式

**推奨: Phase 1 は (a) agent が spec.md を読んで自由抽出。Phase 2 で `/bezier:states` に構造化ブロック追加。**

ただし BLOCKER 対策として: manifest.ts で **Bezier 側が state ラベルを正規化**する（`"Empty State"` / `"empty"` / `"empty-state"` → `"empty"`）。agent の出力文字列を ID にそのまま使わない。詳細は §3 BLOCKER を参照。

Phase 2 で `/bezier:states` コマンドが spec.md に以下を追記するよう拡張する:
```markdown
<!-- bezier:states:start -->
states: [empty, error, loading, authenticated, unauthenticated]
<!-- bezier:states:end -->
```
これを Bezier が読めば manifest 生成の推論コストが下がる。

### Q-4: 再キャプチャのトリガーとコスト管理

**推奨: ターン後は「変更ルートのみ」再キャプチャ（現 DEC-133 動作を manifest に拡張）。manifest が大きい場合の上限は 120 秒のタイムアウトで十分。**

現在の `applyChangedRoute({ capture: true })` は 1 ルートのみ。manifest がある場合は:
1. `changedPathsFromStatus` で変更ファイルを取得
2. `deriveRoutesFromChangedFiles` で影響ルートを導出
3. manifest エントリのうち `entry.route ∈ 影響ルート && entry.reach.kind === "url"` のみ再キャプチャ

これなら 1 ターン後の最大キャプチャ数は「変更ルートに紐づく URL エントリ数」に限定される。通常 1-3 エントリ ≈ 5-15 秒。許容範囲。

「manifest が 10+ エントリある場合」の全体再キャプチャ（"Map を更新" ボタン）: 10 エントリ × (4.5s settle + 撮影) ≈ 50-60 秒。現在の `capturingMapRef` ガードで重複実行は防げている。120 秒タイムアウトを captureNonceRef effect (preview-pane.tsx:538-584) に追加すれば十分。

### Q-5: 認証 / データ依存の状態への到達

**推奨: Phase 1 は `reach.kind: "seed"` コマンドを Bezier は実行しない。表示のみ（gap 扱い）。**

理由:
- seed コマンドは destructive になりえる（テーブルを DROP / データを消す）
- pty 実行権限は Bezier にある (DEC-132 buildLaunch) が、maker の明示的承認なしに自動実行するのはリスクが高い
- Phase 1 は `kind: "url"` のみ自動実行。`seed` / `steps` / `harness` / `manual` は全て gap セル表示

Phase 3 で "Bezier がコマンドを実行する前に確認ダイアログを出す" 形を取ること。

### Q-6: Manifest の決定論と再現性

**推奨: "agent draft → Bezier が ID を正規化 → maker が `reach` を手編集可能" 運用。manifest 全再生成は明示操作で行う。**

ID の安定性は Bezier 側で保証する（§3 BLOCKER を参照）。`reach` の手動編集 UI は Phase 3。Phase 1 では agent が manifest.json を書いたら maker がテキストエディタ（またはコードエディタ）で直接編集できる（manifest は gitignore だが `<issue.dir>` 配下にあるのでエディタからアクセスできる）。

「毎回 agent に再生成させれば良い」か: **Phase 1 はコストを考慮して YES**。ただし再生成ごとに ID が変わると PNG が孤立するため、Bezier が古い PNG を manifest と照合してクリーンアップする仕組みが必要（§3 SHOULD 参照）。

### Q-7: 共有ページ (journey.ts) での Map 扱い

**推奨: Phase 1 は journey.ts の Map タブを変更しない。Phase 3 で manifest PNG を静止画として埋め込む。**

現 journey.ts:315-327 の Map タブは「公開アプリの各ルートを iframe で表示」—これは worktree スクリーンショットとは別物。stakeholders は "公開済みアプリ" を見るもの、makers は "この変更のカバレッジ" を見るものと分ける。

---

## 3. 技術リスクと対処

### [BLOCKER] entry.id が非決定論的になる — grid が毎回バラバラになる

**根拠**: agent が `/bezier:map` を実行するたびに state ラベルの表記が変わりうる。`"empty"` / `"Empty"` / `"empty-state"` / `"Empty State"` は全て異なるファイルパスに化ける。前回の PNG が孤立し、grid に古い stills が混在する。

**対処 (実装必須、Phase 1 着手前)**:
- `app/src/lib/manifest.ts` に `manifestEntryId(route: string, state: string): string` を追加
  ```typescript
  export function manifestEntryId(route: string, state: string): string {
    const r = routeSlug(route);        // 既存: "/dashboard" → "dashboard"
    const s = state.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
    return `${r}--${s}`;
  }
  // "/dashboard" + "Empty State" → "dashboard--empty-state"
  // "/dashboard" + "empty" → "dashboard--empty"
  ```
- Bezier が manifest.json を読む際に `entry.id` を **再計算** (agent の値は無視)。ファイルパスは必ず `manifestEntryId(entry.route, entry.state)` 由来にする
- `/bezier:map` のコマンドテキストに `state: lowercase-kebab-case必須、標準名推奨: default/empty/error/loading/authenticated/unauthenticated` を明記

### [SHOULD] `navigateAndSettle` は「意図した状態が実際に描画されたか」を保証しない

**根拠**: manifest の `reach.url = "/dashboard?__bzState=empty"` に遷移しても、アプリが `__bzState` を無視して通常画面を表示する場合、PNG は default と同じに見える。grid は "empty" 列に誤った stills を表示する。

**対処**:
- Phase 1 のコマンドプロンプト: "URL パラメータで実際に状態が切り替わることが確認できている場合のみ `kind: url` を使え。不確かなら `kind: manual` にして理由を書け"
- 中期: `navigateAndSettle` 後に `embed_browser_eval` で DOM に固有のマーカー要素が存在するか確認する option を追加 (Phase 2)

### [SHOULD] 孤立 PNG（ID ドリフト後の残骸）

**根拠**: manifest が再生成されると `<issue.dir>/map/` 配下に旧 ID の PNG が残る。`readManifest` 実行時に旧ファイルを削除する仕組みがない。

**対処**: `writeManifest` または manifest 読み込み後の初期化で:
```typescript
// 既存 PNGs と新 manifest のエントリ ID を差分してほかのを削除
const expected = new Set(manifest.entries.map(e => manifestEntryId(e.route, e.state)));
const actual = await listDir(`${issue.dir}/map/`); // .png ファイル一覧
for (const f of actual) if (!expected.has(stem(f))) await deleteFile(f);
```
dogfood スケールでは即必要ではないが Phase 1 の実装に含めること（後回しにすると永遠に残る）。

### [NICE] journey.ts の Map タブは worktree 版と別物

共有ページの stakeholder は "公開アプリの各ルート iframe" を見る。maker は "このイシューの変更のカバレッジ PNG グリッド" を見る。受け取り側が混乱する可能性がある。

**対処**: Phase 3 で対応。Phase 1 では共有ページの Map タブは変更しない。

### [NICE] macOS 専用キャプチャ

`screencapture` コマンドは macOS のみ。cross-platform 展開時に対応が必要。dogfood 期は問題なし。

---

## 4. 既存コードとの統合リスク / 退行評価

| リスク | 影響箇所 | 評価 | 対処 |
|---|---|---|---|
| `scope.routes` と manifest の並存 | build-review.tsx、issue-map.tsx | LOW | manifest 不在時は現行 scope グリッドにフォールバック。`startCapture` に両方のパスを保持 |
| DEC-133 auto-capture (`applyChangedRoute`) | preview-pane.tsx:477-515 | LOW | manifest エントリへの拡張は既存 `capturingMapRef` ガード + nonce 機構をそのまま使える |
| DEC-141 attach-first 待機状態でのキャプチャ | preview-pane.tsx:543-553 | NONE | `status !== "ready"` ガードで既に no-op。正しい挙動 |
| DEC-120/130 単一 webview コーディネータ | embedded-browser.tsx | NONE | `captureReq` nonce pattern は coordinator に触れない (DEC-133 方針継続) |
| DEC-141 dev サーバー起動時タブ自動切替 | build-review.tsx:86-96 | LOW | `capturingMapRef` ガードがあるが、サーバー再起動 + 一括キャプチャ中は race がありうる。dogfood で確認 |

**DEC-133 退行リスク**: manifest を追加しても scope-based 撮影のコードパスを削除しない限りゼロ。`onCapture` prop は `scope.routes` ベースのまま manifest 不在時に使い続ける。

**DEC-141 退行リスク**: `preview-url` ファイル読み込みと `lsof` 検出は preview-pane.tsx の `use-preview-server` フックが管理しており、manifest キャプチャは捕まえない。影響なし。

---

## 5. Phase 1 コンクリートビルドプラン

**目標**: `/bezier:map` で manifest 生成 → URL エントリを自動キャプチャ → screen × state グリッド表示 → 空セルで gap 可視化。全て 1 ターンで試せること。

### 新規ファイル

**`app/src/lib/manifest.ts`** (~80 lines)
- `CaptureManifest` / `ManifestEntry` / `Reach` 型
- `manifestPath(issue)` → `<issue.dir>/map/manifest.json`
- `manifestEntryId(route, state)` → stable slug（BLOCKER 対処）
- `mapManifestStillPath(issue, entryId)` → `<issue.dir>/map/<entryId>.png`
- `readManifest(issue)` / `writeManifest(issue, manifest)` — `readFile`/`writeFile` IPC 経由
- `urlEntries(manifest)` → `reach.kind === "url"` のみ

### 変更ファイル

**`app/src/lib/prompts.ts`** (~+50 lines)  
`EN_COMMANDS` / `JA_COMMANDS` に `/bezier:map` コマンド追加:
- `git diff --name-only <base>` で変更ファイルを取得
- `spec.md` の acceptance criteria + states を読む
- 各 (route × state) の reach を推論
- `<issue.dir>/map/manifest.json` に書き出す
- state ラベル規則: lowercase-kebab-case、標準名推奨
- reach 判定基準: URL パラメータで確実に到達できるものだけ `kind: "url"` (不確かなら `kind: "manual"`)

**`app/src/components/issues/issue-map.tsx`** (~+120 lines net)  
- `readManifest(issue)` を `readScope` と並行で読む
- manifest がある場合: 2D グリッド描画
  - rows = manifest から distinct routes (順序は manifest 順)
  - cols = manifest から distinct states (常に "default" を先頭に)
  - セル: PNG あり→画像 / `kind !== "url"` → gap バッジ + `reach.note` tooltip / PNG なし → "not captured"
- manifest がない場合: 既存 scope フラット グリッド（後方互換）
- "Map を更新" ボタン: manifest ありなら `onCapture(entries)` / なしなら `onCapture(scope.routes)` (既存)

**`app/src/components/issues/build-review.tsx`** (~+30 lines)  
- `startCapture` を `routes: string[]` と `entries: ManifestEntry[]` の両対応に
- `captureReq` 型を拡張: `{ routes?: string[]; entries?: ManifestEntry[]; nonce: number }`

**`app/src/components/issues/preview-pane.tsx`** (~+25 lines)  
- nonce effect (lines 538-584) のキャプチャループを拡張:
  - `captureReq.entries` がある場合: `for entry of entries where entry.reach.kind==="url"` → `navigateAndSettle(entry.reach.url)` → `captureRouteStill` に `mapManifestStillPath(issue, manifestEntryId(entry.route, entry.state))` を渡す
  - `captureReq.routes` がある場合: 既存ロジック（後方互換）

**`app/src/lib/scope.ts`** (~+5 lines)  
- `routeSlug` のまま。manifest 側の slug は manifest.ts で定義するため変更不要。

**i18n** (~+12 keys 各 en/ja): `map.gapBadge`, `map.gapTooltip`, `map.generateManifest`, `map.noManifest`, `map.gridStateHeader`, `map.gridRouteLabel`, `map.captureEntries`

**テスト** (~+8 cases):
- `manifest.ts`: `manifestEntryId` の表記ゆれ正規化（5 ケース）
- `manifest.ts`: `readManifest` のパース（不正 JSON / 欠損フィールドへの degrade）
- `issue-map.test.tsx`: manifest fixture での 2D グリッド描画（rows × cols の確認）

### Rust 変更: ゼロ

### 完成の証拠 (spec §2.6 の "成功の証拠" と対応)
1. CEO が `/dashboard` を変更する Issue で `/bezier:map` を実行
2. `<issue.dir>/map/manifest.json` が生成され、少なくとも `route: "/dashboard", state: "default"` のエントリが存在する
3. "Map を更新" ボタンで `/dashboard` の PNG が撮れてグリッドに表示される
4. `kind: "manual"` のエントリが 1 つ以上あり、空セルとしてグリッドに表示される

---

## 6. Verdict と優先度サマリ

| 優先度 | 項目 | 何をするか |
|---|---|---|
| **BLOCKER** | `manifestEntryId` の正規化 | manifest.ts に実装。着手前に必須 |
| **BLOCKER** | manifest コマンドの state ラベル規則 | prompts.ts のコマンドテキストに明記 |
| **SHOULD** | 孤立 PNG クリーンアップ | `writeManifest` または読み込み時に旧 PNG を削除 |
| **SHOULD** | `navigateAndSettle` の限界を文書化 | コマンドテキストで "不確かなら manual" を徹底 |
| **NICE** | journey.ts Map タブの Phase 3 計画を記録 | decisions-log に将来 DEC として予告 |

**最終 Verdict**: `reach.kind === "url"` のキャプチャパイプラインは DEC-133 がほぼ完成させており、追加工数は manifest 型定義 + UI グリッドリファクタ + スラッシュコマンドテキスト。entry.id の正規化 (BLOCKER) を最初に固めれば、Phase 1 は 2-3 セッションで出荷できる。**GO with caveats — BLOCKER 2 件を Phase 1 着手前に resolve すること。**
