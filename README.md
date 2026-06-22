<p align="center">
  <img src="design/brand/logo/icon-app-512.png" width="96" alt="Bezier" />
</p>

<h1 align="center">Bezier</h1>

<p align="center"><strong>ハンドルを握る。曲線はエージェントが描く。</strong></p>

<p align="center">プロダクトデザイナー &amp; PdM のためのエージェント・ワークベンチ。<br/>
（Bezier — ベジェ、と読む）</p>

---

Bezier は、プロダクトデザイナー &amp; PdM が AI エージェントに本物のソフトウェアを作らせる場所です。
あなたは少数の**制御点**（やりたいこと・画面への注釈・taste）を置く。エージェントが**実装**を描く。
コマンドは打たず、レビューできる差分が手元に届きます。

ベジェ曲線が少数の制御点とハンドルで全体を決めるように — あなたは要点だけを握り、滑らかな結果が描かれます。

## ダウンロード（macOS）

最新版は **[Releases](https://github.com/Sota-Mikami/bezier/releases/latest)** から。

1. `Bezier_x.y.z_aarch64.dmg`（Apple Silicon）をダウンロード
2. dmg を開き、Bezier を **Applications にドラッグ**
3. **初回だけ**: 未署名ビルドのため macOS にブロックされます。ターミナルで隔離属性を外してから開いてください:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Bezier.app
   ```

   （`sudo` 不要。別の場所に置いた場合はパスを合わせる）

> 最近の macOS（Sequoia 以降）では未署名アプリで「開発元を確認できない／壊れている」と出て、**システム設定 → プライバシーとセキュリティの「このまま開く」が出ない・効かない**ことがあります。上の `xattr` コマンドが確実です。
>
> 現状は **Apple Silicon・未署名（adhoc）** ビルドのための手順です。Developer ID 署名＋notarize（＝この手順が不要になる）＋自動アップデートは配布を広げる段で対応します。ソースからビルドする場合は [開発](#開発) を参照。

## できること

- **チャットから始まる** — やりたいことを書くと、エージェントが Spec を起草し、隔離された worktree で実装まで進める
- **どんなスタックでもプレビュー** — Next / Vite / Astro / SvelteKit … ローカルで動くものはそのまま Live で確認
- **画面に直接、注釈** — プレビューにピン・ペン・矩形で指示。その注釈がそのまま修正依頼になる
- **Spec と Design を一望** — 対話の横で Spec とプレビューがライブに変化、差分も視覚的に確認
- **チームに共有** — 作った画面を 1 リンクで（Design / Preview / QA）。受け取った人は普段の認証情報でそのまま試せる（バックエンド変更ゼロの同一オリジン proxy）
- **エンジニアに引き継ぐ** — Spec・受入基準・決定・QA がコードと同じ PR の diff に同梱されて渡る（`docs/handoff/`）。再導出なしで実装に入れる
- **安全なマージ** — 各 Issue は隔離された worktree/branch。Commit → Open PR で main を汚さない
- **決定が残る** — なぜそう決めたかがコードと同じ commit に。既存コンポーネントに沿って描き、辿れる
- **離れていても気づける** — エージェント完了・共有 ready・プレビュー起動などをデスクトップ通知（見ていない時だけ・クリックでその Issue へ）
- **黒い画面に怯えない** — エージェントの作業は作業面に溶けて見える。隠さないが、脅さない

## 構成

| パス | 中身 |
|---|---|
| `app/` | デスクトップアプリ（Tauri v2 + Next.js / React 19 / Tailwind v4） |
| `site/` | ランディング（ウェイトリスト）+ Docs |
| `design/brand/` | ブランド戦略 / デザイン原則 / トークン / ロゴ（SSOT） |
| `playbook/` | 戦略・意思決定ログ・運用 |
| `product/` | Issue / Spec / 原則 |

## 開発

```bash
# アプリ（デスクトップ）
cd app && npm install && npm run tauri dev

# サイト（LP / Docs）
cd site && npm install && npm run dev
```

ローカルで `.app` をビルドする場合: `cd app && npm run tauri -- build --bundles app`。
**リリース**は `v*` タグを push すると [GitHub Actions](.github/workflows/release.yml) が macOS の `.dmg` をビルドして [Releases](https://github.com/Sota-Mikami/bezier/releases) に添付します（例: `git tag v0.1.1 && git push origin v0.1.1`）。

## ブランド

- デザイン原則: [`design/brand/PRINCIPLES.md`](design/brand/PRINCIPLES.md)
- ブランド戦略: [`design/brand/2026-06-12_brand-strategy.md`](design/brand/2026-06-12_brand-strategy.md)
- デザイントークン: [`design/brand/2026-06-12_design-tokens.md`](design/brand/2026-06-12_design-tokens.md)
- ロゴ: [`design/brand/logo/`](design/brand/logo/)
