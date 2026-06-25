// Bezier brand tokens → Remotion. SSOT: ../../design/brand/2026-06-12_design-tokens.md
// 完全モノクロ・light 基調・ベジェ ease（DEC-048）。色相は出さない（機能色のみ例外）。
import { Easing } from "remotion";

// --- Color (light theme, exact oklch tokens; Chromium supports oklch()) ---
export const C = {
  bg: "oklch(0.993 0.0015 95)", // ほのかに温かい off-white（純白でない）
  fg: "oklch(0.22 0 0)", // ink near-black（純黒でない）
  card: "oklch(1 0 0)",
  muted: "oklch(0.965 0.003 95)",
  mutedFg: "oklch(0.50 0 0)",
  accent: "oklch(0.955 0 0)",
  accentFg: "oklch(0.44 0 0)",
  border: "oklch(0.915 0.004 95)",
  primary: "oklch(0.24 0 0)",
  primaryFg: "oklch(0.99 0 0)",
  ai: "oklch(0.32 0 0)", // エージェント変更 / 強グレー
  ring: "oklch(0.55 0 0)",
  // 機能色（控えめ・多用しない）
  success: "oklch(0.58 0.12 150)",
  warning: "oklch(0.70 0.13 75)",
  destructive: "oklch(0.56 0.20 25)",
} as const;

// --- Type ---
export const FONT = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
} as const;

// --- Motion: linear 禁止・すべてベジェ・bounce 無し（design-tokens §6）---
export const EASE = {
  handle: Easing.bezier(0.22, 1, 0.36, 1), // 標準: 出だし速く終わり静か
  enter: Easing.bezier(0.16, 1, 0.3, 1), // 入場
  inout: Easing.bezier(0.65, 0, 0.35, 1), // 双方向
} as const;

// --- Layout ---
export const PAD = 132; // 横の余白（多め）
