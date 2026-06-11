<!-- 作成日: 2026-06-12 / Owner: CEO+CoS / 親=product/specs/2026-06-11_ia-and-issue-model.md -->
# Preview Runner ロードマップ — web → Tauri → mobile（platform 別に additive）

> dogfood で「continuum 自身（Tauri アプリ）を continuum でプレビューすると `window.__TAURI_INTERNALS__.invoke` undefined でフォルダ開く等が落ちる」に直面。CEO 判断：**web 優先は維持しつつ、continuum を continuum で改修したいので Tauri を先に対応**。

## 0. 第一原理：ループは platform 非依存。platform 依存は「プレビュー面」だけ
continuum の核（**worktree で AI が実装 → diff → Accept**）は **git＋エージェントだけ**なので、web/native どの repo でもそのまま動く。platform 依存なのは **Design＝実物プレビューの runner** のみ。
→ 一般化＝ループを作り直すのでなく **「Preview Runner」を platform 別に additive に足す**。「Mac アプリ＝Tauri だけでない（Electron/素のSwift/Flutter…）」ので、**パターンに応じて runner を増やす**。

## 1. Runner 抽象化
```
PreviewRunner（target に応じて切替）
├ web      : dev server → iframe                          ← ✅ 完成（slice 2.5/2.5.1）
├ tauri    : 本物の Tauri dev 窓を spawn（native も動く）   ← ★ 次の目標（b）
├ electron : 同様に実アプリ窓を spawn（後）
├ ios      : iOS Simulator 起動 → ストリーム/スクショ（後・需要次第）
├ android  : Emulator 起動 → ストリーム/スクショ（後・需要次第）
└ fallback : diff＋スクショ手貼り（runner 未対応 target でもループは回る）
```
target 判定：repo の構成から推定（`src-tauri/` あり→tauri、`electron`/`capacitor`/Expo→各、package.json `scripts.dev`→web…）。設定で上書き可。

## 2. なぜ Tauri は「iframe にモック」でなく「本物の窓」か（技術判断）
- 親（continuum=`localhost:3210`）と iframe（worktree=`localhost:4179`）は **別オリジン**（ポート違い）→ 親から `iframe.contentWindow` に触れず **外からモック注入できない**。
- 仮に注入できても native 操作は **inert（張りぼて）**。フォルダは実際には開けない。
- → **忠実な Tauri プレビュー＝本物の Tauri dev 窓を spawn**（native API が実際に動く＝Open-folder も本当にテストできる）。

## 3. 2段の進め方
### (a) 応急（安い・視覚レビューを通す）＝今回は採らず保留
continuum の web 層を Tauri 不在でもクラッシュしない degrade（`ipc.invoke` 系を Tauri 無ければ stub＋「プレビュー不可」表示）。→ iframe で**見た目は出る**が native は inert。**CEO は (b) を目指すので、これは保険として後回し**（必要なら小改修で入る）。

### (b) Tauri runner = worktree を本物の Tauri 窓で起動 ★目標
`npm run tauri dev` を worktree で spawn → 別窓で実アプリ。必要な工事：
1. **`src-tauri/target`（Rust ビルドキャッシュ）も clonefile**（`cp -c -R`、node_modules と同じ手）→ cargo がゼロから再ビルドしない（target は巨大なので必須）。
2. **dev ポートを worktree 用に上書き**：continuum の `tauri.conf.json` は `beforeDevCommand: npm run dev -- -p 3210` / `devUrl: localhost:3210` を**ハードコード**→ 第2インスタンスが衝突。worktree 用に空きポートへ上書きする仕組み（env / 一時 config / 引数）。
3. **spawn / kill のライフサイクル**：Implement 後 or Design で「Tauri 窓を起動」。Design ペインに「別窓で起動中」＋dev ログ表示（iframe でなく status）。stop/discard/issue 離脱で kill。
4. **target 判定**：`src-tauri/` があれば runner=tauri を既定に（web の iframe runner と切替）。
- 留意：別窓 UX（埋め込みでない）/ 初回 Rust ビルドは clonefile target でも多少待つ / ポート上書きが continuum 固有設定に依存。

## 4. mobile（iOS/Android）= web 実証 ＋ 需要が出てから
Simulator/Emulator 起動＋ビルド基盤＝platform 固有で工数大。投機的に作らない。runner = simulator 起動＋スクショ/ストリームを Design ペインに。

## 5. 当面 native repo をブロックしない
runner 未対応でも**ループ自体は動く**（AI 実装＋diff は見れる）。プレビューだけ fallback（diff＋スクショ）で回せる。

## 6. 次アクション
- **(b) Tauri runner を実装**（§3-b）。まず `target` clonefile ＋ ポート上書き ＋ spawn/kill ＋ tauri target 判定。
- web runner は完成・維持。mobile は据え置き。
