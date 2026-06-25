// 共有コンポーネント & モーションヘルパー。すべてモノクロ・ベジェ・bounce 無し。
import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { C, EASE, FONT } from "./theme";

// --- 入場フェード（opacity + わずかな上方向 translate ≤8px）---
export const useFadeUp = (delay = 0, rise = 8) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });
  return { opacity: p, transform: `translateY(${(1 - p) * rise}px)` } as const;
};

// --- シーン全体の in/out（隣シーンとクロス）---
export const SceneWrap: React.FC<{
  dur: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ dur, children, style }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });
  const fadeOut = interpolate(frame, [dur - 12, dur], [1, 0], {
    extrapolateLeft: "clamp",
    easing: EASE.inout,
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        color: C.fg,
        fontFamily: FONT.sans,
        opacity: Math.min(fadeIn, fadeOut),
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// --- mono eyebrow ---
export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const a = useFadeUp(delay, 6);
  return (
    <div
      style={{
        ...a,
        fontFamily: FONT.mono,
        fontSize: 19,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: C.mutedFg,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
};

// --- キャプション（EN 太字 + JP 副え）行ごと stagger ---
export const Caption: React.FC<{
  en: readonly string[];
  ja: readonly string[];
  delay?: number;
  size?: number;
  align?: "left" | "center";
}> = ({ en, ja, delay = 0, size = 58, align = "left" }) => {
  return (
    <div style={{ textAlign: align }}>
      {en.map((line, i) => {
        const a = useFadeUp(delay + i * 6);
        return (
          <div
            key={`en-${i}`}
            style={{
              ...a,
              fontSize: size,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.08,
              color: C.fg,
            }}
          >
            {line}
          </div>
        );
      })}
      <div style={{ height: 14 }} />
      {ja.map((line, i) => {
        const a = useFadeUp(delay + en.length * 6 + 4 + i * 5);
        return (
          <div
            key={`ja-${i}`}
            style={{
              ...a,
              fontSize: Math.round(size * 0.46),
              fontWeight: 500,
              lineHeight: 1.3,
              color: C.mutedFg,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

// --- micro テロップ ---
export const Micro: React.FC<{
  en: string;
  ja?: string;
  delay?: number;
  mono?: boolean;
}> = ({ en, ja, delay = 0, mono }) => {
  const a = useFadeUp(delay, 6);
  return (
    <div style={{ ...a }}>
      <span
        style={{
          fontFamily: mono ? FONT.mono : FONT.sans,
          fontSize: 22,
          color: C.accentFg,
          fontWeight: 500,
        }}
      >
        {en}
      </span>
      {ja ? (
        <span style={{ fontSize: 20, color: C.mutedFg, marginLeft: 14 }}>
          {ja}
        </span>
      ) : null}
    </div>
  );
};

// --- 実録画の枠（src があれば動画・無ければプレースホルダ）---
export const ScreenFrame: React.FC<{
  label: string;
  src?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  compact?: boolean;
}> = ({ label, src, style, children, compact }) => {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        background: C.card,
        boxShadow:
          "0 1px 0 rgba(0,0,0,0.02), 0 30px 70px -34px rgba(20,20,30,0.22)",
        overflow: "hidden",
        ...style,
      }}
    >
      {src ? (
        <OffthreadVideo
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Placeholder label={label} compact={compact} />
      )}
      {children}
    </div>
  );
};

// プレースホルダ＝アプリ画面に見える faux UI + 差し替え案内
const Placeholder: React.FC<{ label: string; compact?: boolean }> = ({
  label,
  compact,
}) => {
  return (
    <AbsoluteFill>
      {/* faux top bar */}
      <div
        style={{
          height: compact ? 26 : 38,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 14px",
          background: C.muted,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: compact ? 7 : 9,
              height: compact ? 7 : 9,
              borderRadius: 99,
              background: C.border,
            }}
          />
        ))}
      </div>
      {/* faux content lines */}
      <div style={{ padding: compact ? 16 : 28, display: "grid", gap: compact ? 10 : 16 }}>
        <div style={{ height: compact ? 12 : 18, width: "46%", borderRadius: 6, background: C.accent }} />
        <div style={{ height: compact ? 9 : 12, width: "82%", borderRadius: 6, background: C.muted }} />
        <div style={{ height: compact ? 9 : 12, width: "70%", borderRadius: 6, background: C.muted }} />
        <div style={{ height: compact ? 9 : 12, width: "76%", borderRadius: 6, background: C.muted }} />
      </div>
      {/* 差し替え案内 */}
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: compact ? 13 : 16,
            color: C.mutedFg,
            letterSpacing: "0.04em",
            background: "rgba(255,255,255,0.7)",
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}
        >
          ▶ {label}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// --- 控えめなワードマーク（ロゴに頼らない＝テキスト）---
export const Wordmark: React.FC<{ size?: number; delay?: number }> = ({
  size = 40,
  delay = 0,
}) => {
  const a = useFadeUp(delay, 6);
  return (
    <div
      style={{
        ...a,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        color: C.fg,
      }}
    >
      Bezier
    </div>
  );
};

// status dot
export const Dot: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 9,
}) => (
  <div style={{ width: size, height: size, borderRadius: 99, background: color }} />
);

// 未使用 import 警告回避（Img を将来ロゴ用に残す）
export const _Img = Img;
