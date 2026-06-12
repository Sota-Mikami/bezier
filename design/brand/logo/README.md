# Bezier — ロゴ

マーク = **ベジェ曲線 + 制御点ハンドル**のグリフ。デザイナーが一目で「ペンツールだ」と分かる、
プロダクト thesis を内包した記号。**曲線＝エージェントの出力（ink）／ハンドル＝あなたが握るもの（handle-indigo）**。

## ファイル
| ファイル | 用途 |
|---|---|
| `mark.svg` | フルカラーのマーク（曲線=ink / ハンドル=indigo）。明るい背景用 |
| `mark-mono.svg` | 単色（`currentColor`）。極小サイズ・モノクロ・暗背景（色を流し込む） |
| `wordmark.svg` | マーク + 「Bezier」ロックアップ（横） |
| `icon-app.svg` | アプリ/ドック/favicon 用の角丸タイル（dark squircle + 白曲線 + indigo ハンドル） |
| `icon-app-1024.png` / `-512.png` | 上記の書き出し（WebKit レンダ。ImageMagick は cubic を落とすので使わない） |

## 使い分け
- アプリ内ヘッダー・サイトヘッダー：React コンポーネント（`BezierMark`）で `currentColor` + `--primary` を使い、テーマ追従させる（静的 svg を貼らない）。
- ドック/タスクバー/favicon：`icon-app`（タイル付き）。
- 単色が要る所（印影・1色印刷・極小）：`mark-mono`。

## ルール
- アクセント色はハンドル（線＋ドット）にのみ宿す。曲線本体は前景色。
- クリアスペース = マーク高さ分を四周に確保。
- 最小サイズで制御点ドットが潰れるなら、ハンドルを省いて曲線だけにする（`mark-mono` の曲線部）。
- 歪めない・影を付けない・グラデを盛らない（PRINCIPLES 原則5）。

## 再書き出し（PNG）
ImageMagick の内蔵 SVG は cubic ベジェ（`C`）を描画しないため **WebKit(Quick Look) で書き出す**：
```bash
qlmanage -t -s 1024 -o /tmp icon-app.svg   # → /tmp/icon-app.svg.png
```
