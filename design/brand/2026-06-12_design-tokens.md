<!-- 作成日: 2026-06-12 / Owner: Principal Designer / 実装は app/site の globals.css -->
# Bezier — デザイントークン

> 具体値の SSOT。判断基準は `PRINCIPLES.md`、根拠は `2026-06-12_brand-strategy.md`。
> 実装は `app/src/app/globals.css` と `site/src/app/globals.css`（OKLCH で定義）。

---

## 1. カラー哲学

- **ニュートラル基調 + ハンドル1色。** 飾りの色を持たない（原則1・5）。
- ニュートラルは無彩のグレーにせず、**わずかに色を含ませる**：light = ほのかに温かい off-white、dark = ほのかに "ink"（ハンドル色相 266 を極少量）。クリニカルでなく職人的に。
- 純白・純黒を大面積に使わない。

## 2. ハンドルカラー（ブランドアクセント）

ペンツールのハンドルの色 = ブルー寄りインディゴ（色相 ≈ 266）。Figma の青と Linear の紫の **あいだ**。
**用途は3つだけ**：①プライマリアクション ②アクティブな制御点 / 注釈 ③エージェントの変更マーク。

| トークン | Light | Dark | 用途 |
|---|---|---|---|
| `--primary` | `oklch(0.50 0.21 266)` | `oklch(0.50 0.21 266)` | 主アクション（両モード共通＝ブランド一貫） |
| `--primary-foreground` | `oklch(0.99 0.01 266)` | `oklch(0.99 0.01 266)` | 主アクション上の文字（白） |
| `--ai` | `oklch(0.52 0.20 266)` | `oklch(0.70 0.17 266)` | エージェント変更マーク（左罫・下線・ドット） |
| `--ring` | `oklch(0.55 0.18 266)` | `oklch(0.62 0.17 266)` | フォーカスリング = ハンドル色（"掴んでいる"の合図） |

## 3. ニュートラル

### Light
| トークン | 値 | 備考 |
|---|---|---|
| `--background` | `oklch(0.993 0.0015 95)` | ほのかに温かい白（純白でない） |
| `--foreground` | `oklch(0.22 0.01 266)` | ink near-black（純黒でない） |
| `--card` | `oklch(1 0 0)` | 作業面はわずかに持ち上げる |
| `--muted` | `oklch(0.965 0.003 95)` | |
| `--muted-foreground` | `oklch(0.50 0.012 266)` | 副次テキスト |
| `--accent` | `oklch(0.955 0.022 266)` | ハンドル極淡サーフェス（hover/選択） |
| `--accent-foreground` | `oklch(0.44 0.16 266)` | 上記の上の文字 |
| `--border` | `oklch(0.915 0.004 95)` | 線は控えめに |
| `--input` | `oklch(0.915 0.004 95)` | |

### Dark
| トークン | 値 | 備考 |
|---|---|---|
| `--background` | `oklch(0.175 0.008 266)` | true dark + 極少 ink |
| `--foreground` | `oklch(0.97 0.004 95)` | |
| `--card` | `oklch(0.21 0.009 266)` | |
| `--muted` | `oklch(0.27 0.01 266)` | |
| `--muted-foreground` | `oklch(0.71 0.012 266)` | |
| `--accent` | `oklch(0.30 0.035 266)` | |
| `--accent-foreground` | `oklch(0.86 0.05 266)` | |
| `--border` | `oklch(1 0 0 / 9%)` | |
| `--input` | `oklch(1 0 0 / 12%)` | |

### 状態色（両モード・控えめ彩度＝脅さない）
| | Light | Dark |
|---|---|---|
| `--destructive` | `oklch(0.56 0.20 25)` | `oklch(0.66 0.18 25)` |
| success（必要時） | `oklch(0.58 0.12 150)` | `oklch(0.70 0.13 150)` |
| warning（必要時） | `oklch(0.70 0.13 75)` | `oklch(0.78 0.13 75)` |

## 4. タイポgrフィ

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

- ターミナル/ログの背景は **黒（#000）にしない**。`--card` か、それより一段沈めた `oklch(0.20 0.009 266)`（dark時）/ `oklch(0.975 0.003 95)`（light時）。
- 文字は `--foreground` 階調＋mono。進行中の行だけ `--ai`(ハンドル色) でほのかに。
- 緑のハッカー文字を使わない。ステータスは穏やかなドット（実行中=ハンドル色 / 待ち=warning / 完了=success / 失敗=destructive、いずれも低彩度）。

## 8. 実装メモ
- localStorage キー：`bezier:theme` / `bezier:settings`（旧 `continuum:*` から移行）。
- `--ai` は既存実装が参照（agent 変更マーク）。ハンドル色に統一。
- ロゴのアクセントは `--primary`（ハンドル線＋ドット）。曲線本体は `--foreground`。
