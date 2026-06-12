<!-- 作成日: 2026-06-12 / 改訂: 2026-06-12 モノクロ化(DEC-048) / Owner: Principal Designer / 実装は app/site の globals.css -->
# Bezier — デザイントークン

> 具体値の SSOT。判断基準は `PRINCIPLES.md`、根拠は `2026-06-12_brand-strategy.md`。
> 実装は `app/src/app/globals.css` と `site/src/app/globals.css`（OKLCH で定義）。
> **2026-06-12 DEC-048：ブランドを完全モノクロ化。** 旧「handle-indigo（色相266）」アクセントは廃止。

---

## 1. カラー哲学

- **モノクロ。** ink + グレーのみ。ブランドに色相を持たない（原則1・5）。装飾色も、差し色のアクセントも持たない。
- 階層は **色ではなく濃淡**で作る。プライマリ = ink（最も濃い）。
- 純白・純黒を大面積に使わない：light = ほのかに温かい off-white、dark = ほのかに沈んだ地。ニュートラルは無彩〜極低彩度（職人的、クリニカルでない）。
- **唯一の非ニュートラル = `--destructive`（機能的な赤）。** それ以外に色相は出さない。
- ロゴと UI が一致：ロゴはモノクロ **"lit black"**（光の当たりで微グラデ＝ベタ塗りでない）。UI も ink/グレーで揃える。

## 2. プライマリ（モノクロ・色ではなく濃淡）

| トークン | Light | Dark | 用途 |
|---|---|---|---|
| `--primary` | `oklch(0.24 0 0)` ink | `oklch(0.92 0 0)` near-white | 主アクション（濃淡で反転） |
| `--primary-foreground` | `oklch(0.99 0 0)` | `oklch(0.20 0 0)` | 主アクション上の文字 |
| `--ai` | `oklch(0.32 0 0)` | `oklch(0.70 0 0)` | エージェント変更 / アクティブ制御点マーク（強いグレー） |
| `--ring` | `oklch(0.55 0 0)` | `oklch(0.62 0 0)` | フォーカスリング（ニュートラル） |

## 3. ニュートラル ramp

### Light
| トークン | 値 | 備考 |
|---|---|---|
| `--background` | `oklch(0.993 0.0015 95)` | ほのかに温かい白（純白でない） |
| `--foreground` | `oklch(0.22 0 0)` | ink near-black（純黒でない） |
| `--card` | `oklch(1 0 0)` | 作業面はわずかに持ち上げ |
| `--muted` | `oklch(0.965 0.003 95)` | |
| `--muted-foreground` | `oklch(0.50 0 0)` | 副次テキスト |
| `--accent` | `oklch(0.955 0 0)` | 淡グレーサーフェス（hover/選択） |
| `--accent-foreground` | `oklch(0.44 0 0)` | 上記の上の文字 |
| `--border` / `--input` | `oklch(0.915 0.004 95)` | 線は控えめに |

### Dark
| トークン | 値 | 備考 |
|---|---|---|
| `--background` | `oklch(0.175 0 0)` | true dark（無彩） |
| `--foreground` | `oklch(0.97 0.004 95)` | ほのかに温かい白 |
| `--card` | `oklch(0.21 0 0)` | |
| `--muted` | `oklch(0.27 0 0)` | |
| `--muted-foreground` | `oklch(0.71 0 0)` | |
| `--accent` | `oklch(0.30 0 0)` | |
| `--accent-foreground` | `oklch(0.86 0 0)` | |
| `--border` | `oklch(1 0 0 / 9%)` | |

### 状態色（機能色のみ・控えめ彩度）
| | Light | Dark |
|---|---|---|
| `--destructive` | `oklch(0.56 0.20 25)` | `oklch(0.66 0.18 25)` |
| success（必要時） | `oklch(0.58 0.12 150)` | `oklch(0.70 0.13 150)` |
| warning（必要時） | `oklch(0.70 0.13 75)` | `oklch(0.78 0.13 75)` |

> 状態色は「機能」であり「ブランドの色」ではない。多用しない。通常 UI はモノクロで成立させる。

## 4. タイポグラフィ

- フォント：system stack（オフライン static-export のため next/font 不使用）。
  - sans：`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif`
  - mono：`ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`
- スケール：見出しはトラッキング詰め（`tracking-tight`）、本文は標準。数値/コード/パスは mono。

## 5. 形・余白

- `--radius`: `0.625rem`（継承）。派生スケール（sm/md/lg/xl…）は globals.css の `@theme inline` を継承。
- スペーシング：4 / 8px グリッド。余白多め。

## 6. モーション（"曲線のように"＝名前を体現）

> **linear イージング禁止。** すべてベジェ。速く（≤240ms）、可逆、bounce 無し。

```css
--ease-handle:  cubic-bezier(0.22, 1, 0.36, 1);   /* 標準: 出だし速く終わり静か */
--ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);   /* 双方向の移動 */
--ease-enter:   cubic-bezier(0.16, 1, 0.3, 1);    /* 入場（出現） */
--dur-fast: 120ms;
--dur:      180ms;
--dur-slow: 240ms;
```

- 出現/消滅 = opacity + わずかな translate/scale（≤4px / ≤0.98）。
- ホバー/プレスは即時の背景微変化。

## 7. エージェント作業面（"黒い画面を溶かす"＝原則4）

- ターミナル/ログの背景は **黒（#000）にしない**。`--card` か、それより一段沈めたニュートラル（dark時 `oklch(0.20 0 0)` / light時 `oklch(0.975 0.003 95)`）。
- 文字は `--foreground` 階調＋mono。進行中の行だけ `--ai`（強グレー）でほのかに強調。
- 緑のハッカー文字を使わない。ステータスは穏やかなドット（実行中=`--ai` / 待ち=warning / 完了=success / 失敗=destructive、いずれも低彩度）。

## 8. ロゴ & 実装メモ

- **ロゴ＝モノクロ "lit black"。** 抽象ペンツール（四角アンカー＋ハンドル線＋丸つまみ＋曲線）。全要素 `currentColor`＋微 sheen グラデ（テーマ追従）。色のアクセントは持たない。
- アセット：`design/brand/logo/`（`mark.svg` / `mark-mono.svg` / `mark-favicon.svg` / `wordmark.svg` / `icon-app*.svg`）。app/site の `BezierMark` コンポーネントが SSOT 実装。
- localStorage キー：`bezier:theme` / `bezier:settings`。
- `--ai` は agent 変更マークが参照（強グレーに統一）。
