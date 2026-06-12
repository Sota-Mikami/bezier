# Bezier — ロゴ

確定形：**D1（2026-06-12, DEC-048）**。**抽象ペンツール**のマーク。プロダクト thesis を内包する。

- **四角アンカー（中空ダイヤ）** = リポジトリの起点（あなたが置く制御点）
- **ハンドル線 + 丸つまみ（中空サークル）** = あなたが握って操作する制御点
- **曲線** = エージェントが描く実装（"Hold the handles. The agent draws the curve."）

構造ルール：四角と丸は**必ずハンドル線で結ぶ**（繋がってこそベジェ）。曲線はアンカーで**ハンドルと接線一致（collinear）**してから右下へ優雅にスイープ。ノードは**中空**＋均一 gap で境界を確保。四角と丸は**視覚的に同サイズ**（ダイヤは円の約1.18倍）。

カラー：**モノクロ "lit black"**。全要素が `currentColor` ＋ 1方向の微 sheen グラデ（光の当たり＝ベタ塗りでない）。**色のアクセントは無し**（旧 handle-indigo は DEC-048 で全廃）。

## ファイル
| ファイル | 用途 |
|---|---|
| `mark.svg` | マーク（中空ノード・lit-black グラデ）。明背景用 |
| `mark-mono.svg` | 単色フラット（ink）。1色印刷・極小・特殊用途 |
| `mark-favicon.svg` | **塗りつぶしノード**版（中空が潰れる ≤24px 用）。prefers-color-scheme でテーマ反転 |
| `wordmark.svg` | マーク + 「Bezier」ロックアップ（横） |
| `icon-app-white.svg` / `icon-app-dark.svg` | アプリ/ドック用 角丸タイル（白タイル＋lit-black / 黒タイル＋白）。白タイルが既定 |
| `icon.svg` | テーマ対応 favicon（塗り版・modern browser 用） |
| `apple-icon.png` / `favicon.ico` | 書き出し（apple-touch=白タイル / .ico=mid-tone で light/dark 両タブ対応） |

生成：`explore/build-locked.mjs`（SVG アセット＋ React コンポーネントを書き出し）。アイコン再生成は `npx tauri icon <icon-source-white.png>`（app/ で実行）。

## 使い分け
- アプリ内ヘッダー・サイトヘッダー：React コンポーネント **`BezierMark`**（`currentColor`＋微 sheen、テーマ追従）。静的 svg を貼らない。
- ドック/タスクバー：`icon-app-white`（既定）。
- favicon：`icon.svg`（modern）＋ `favicon.ico`（mid-tone フォールバック）。極小は塗り版（`mark-favicon`）。

## ルール
- 色相を足さない（モノクロ）。歪めない・影を盛らない・グラデを派手にしない（PRINCIPLES 原則5）。
- クリアスペース = マーク高さ分を四周に確保。
- 最小サイズ（≤24px）で中空ノードが潰れる場面は**塗り版**（`mark-favicon`）に切替。

## 再書き出し（PNG）
WebKit(Chrome headless / Quick Look) で書き出す（ImageMagick の内蔵 SVG は cubic `C` を落とすので最終はブラウザレンダ推奨）：
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=out.png --window-size=1024,1024 file://$PWD/icon-app-white.svg
```
