# Bezier Pre-launch — Remotion

動画のモーション/テロップ/CTAレイヤー（Concept A2「The Orchestrator, for designers」）。
**素材ゼロでもプレビューできる**＝実録画の箇所はプレースホルダ枠。録画ができたら差し替える。

## 使い方
```bash
cd remotion
npm install
npm run dev        # Remotion Studio（ブラウザでプレビュー）
npm run still      # 1フレームを out/still.png に書き出し（確認用）
npm run render     # out/bezier-prelaunch.mp4 に書き出し（Chromium DL あり）
npm run typecheck  # 型チェック
```

## どこを直す？
- **コピー・尺・URL・素材**: `src/content.ts`（ここが SSOT。`COPY`/`DUR`/`WAITLIST_URL`/`CLIPS`）
- **色・フォント・ease**: `src/theme.ts`（ブランドトークン）
- **各シーンの画**: `src/scenes.tsx`（S0..S5）
- **共有部品**: `src/ui.tsx`

## 実録画の差し替え（録画後）
1. 撮ったクリップを `remotion/public/` に置く（例 `public/clip1-direct.mov`）。
2. `src/content.ts` の `CLIPS` にファイル名を入れる（例 `direct: "clip1-direct.mov"`）。
3. プレースホルダが自動で `<OffthreadVideo>` に切り替わる。

## 構成（72s @30fps）
S0 Open/自己像 → S1 Direct → S2 Review★ → S3 Parallel/Board★ → S4 Ship → S5 Payoff+CTA
（詳細は `../storyboard/2026-06-25_storyboard-v1.md` / `../script/2026-06-25_script-v1_EN-JP.md`）

## TODO
- [ ] `WAITLIST_URL` を確定値に（CTA に焼く）
- [ ] 録画クリップを `public/` に置いて `CLIPS` を埋める
- [ ] BGM/SE（任意）
