// S0..S5。各シーンは Series 内で local frame（0..dur）を受ける。
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, EASE, FONT, PAD } from "./theme";
import { COPY, CLIPS, WAITLIST_URL } from "./content";
import {
  SceneWrap,
  Eyebrow,
  Caption,
  Micro,
  ScreenFrame,
  Wordmark,
  Dot,
  useFadeUp,
} from "./ui";

// 背景に薄く並ぶボードタイル（S0 用の気配）
const FaintTiles: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 40], [0, 0.1], {
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {[
        { top: 150, left: 1180, w: 520, h: 320 },
        { top: 520, left: 1320, w: 460, h: 300 },
        { top: 360, left: 980, w: 360, h: 240 },
      ].map((t, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: t.top,
            left: t.left,
            width: t.w,
            height: t.h,
            borderRadius: 16,
            border: `1px solid ${C.border}`,
            background: C.card,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

// ============ S0 — Open / 自己像 ============
export const S0: React.FC<{ dur: number }> = ({ dur }) => (
  <SceneWrap dur={dur}>
    <FaintTiles />
    <AbsoluteFill style={{ padding: PAD, justifyContent: "center" }}>
      <div style={{ position: "absolute", top: PAD, left: PAD }}>
        <Eyebrow>{COPY.s0.eyebrow}</Eyebrow>
      </div>
      <div>
        {COPY.s0.heroEn.map((line, i) => {
          const a = useFadeUp(14 + i * 8, 10);
          return (
            <div
              key={i}
              style={{
                ...a,
                fontSize: 96,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
                color: i === 0 ? C.fg : C.mutedFg,
              }}
            >
              {line}
            </div>
          );
        })}
        <div style={{ height: 26 }} />
        {COPY.s0.heroJa.map((line, i) => {
          const a = useFadeUp(40 + i * 6, 8);
          return (
            <div
              key={i}
              style={{ ...a, fontSize: 34, fontWeight: 500, color: C.mutedFg, lineHeight: 1.35 }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  </SceneWrap>
);

// faux chat panel（S1）
const ChatPanel: React.FC = () => {
  const a = useFadeUp(8, 8);
  return (
    <div
      style={{
        ...a,
        flex: 1,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        background: C.card,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ fontFamily: FONT.mono, fontSize: 15, color: C.mutedFg, letterSpacing: "0.04em" }}>
        CHAT
      </div>
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          background: C.primary,
          color: C.primaryFg,
          padding: "16px 20px",
          borderRadius: 14,
          fontSize: 24,
          lineHeight: 1.4,
        }}
      >
        {COPY.s1.chat}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.ai }}>
        <Dot color={C.ai} />
        <span style={{ fontSize: 22, color: C.ai }}>Building a live preview…</span>
      </div>
    </div>
  );
};

// ============ S1 — Direct ============
export const S1: React.FC<{ dur: number }> = ({ dur }) => (
  <SceneWrap dur={dur}>
    <AbsoluteFill style={{ padding: PAD, gap: 40, justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 32, height: 560 }}>
        <ChatPanel />
        <div style={{ flex: 1.15 }}>
          <ScreenFrame
            label="CLIP 1 · running preview"
            src={CLIPS.direct || undefined}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Caption en={COPY.s1.en} ja={COPY.s1.ja} delay={20} size={48} />
        <Micro en={COPY.s1.microEn} ja={COPY.s1.microJa} delay={40} mono />
      </div>
    </AbsoluteFill>
  </SceneWrap>
);

// 注釈オーバーレイ（S2）— pin/box/pen を stagger で draw
const Annotations: React.FC = () => {
  const f = useCurrentFrame();
  const pin = interpolate(f, [26, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.handle });
  const box = interpolate(f, [70, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.handle });
  const pen = interpolate(f, [120, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.handle });
  return (
    <AbsoluteFill>
      <svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="none">
        {/* box（描かれる）*/}
        <rect
          x="120" y="120" width="430" height="150" rx="10"
          fill="none" stroke={C.ai} strokeWidth="3"
          strokeDasharray={1160}
          strokeDashoffset={1160 * (1 - box)}
          opacity={box > 0 ? 0.9 : 0}
        />
        {/* pen（自由線）*/}
        <path
          d="M620 360 q 60 -50 130 -10 q 50 30 120 -6"
          fill="none" stroke={C.ai} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={320}
          strokeDashoffset={320 * (1 - pen)}
          opacity={pen > 0 ? 0.9 : 0}
        />
      </svg>
      {/* pin + ラベル */}
      <div
        style={{
          position: "absolute",
          left: "16%",
          top: "30%",
          transform: `scale(${pin})`,
          transformOrigin: "left top",
          opacity: pin,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: 99, background: C.fg, boxShadow: `0 0 0 5px ${C.bg}` }} />
        <div
          style={{
            background: C.fg,
            color: C.primaryFg,
            fontSize: 19,
            padding: "8px 14px",
            borderRadius: 10,
            whiteSpace: "nowrap",
          }}
        >
          {COPY.s2.pin}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============ S2 — Review the running screen ★ ============
export const S2: React.FC<{ dur: number }> = ({ dur }) => (
  <SceneWrap dur={dur}>
    <AbsoluteFill style={{ padding: PAD, display: "flex", flexDirection: "row", gap: 56, alignItems: "center" }}>
      <div style={{ width: 620, flexShrink: 0 }}>
        <Caption en={COPY.s2.en} ja={COPY.s2.ja} delay={10} size={56} />
        <div style={{ height: 26 }} />
        <Micro en={COPY.s2.microEn} ja={COPY.s2.microJa} delay={26} />
      </div>
      <div style={{ flex: 1, height: 600 }}>
        <ScreenFrame label="CLIP 2 · running screen" src={CLIPS.review || undefined} style={{ width: "100%", height: "100%" }}>
          {!CLIPS.review ? <Annotations /> : null}
        </ScreenFrame>
      </div>
    </AbsoluteFill>
  </SceneWrap>
);

// 通知トースト（S3）
const Toast: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [120, 138], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.handle });
  return (
    <div
      style={{
        position: "absolute",
        top: PAD,
        right: PAD,
        transform: `translateY(${(1 - p) * -10}px)`,
        opacity: p,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 18px",
        boxShadow: "0 20px 50px -28px rgba(20,20,30,0.3)",
      }}
    >
      <Dot color={C.success} size={11} />
      <span style={{ fontSize: 21, color: C.fg }}>{COPY.s3.notify}</span>
    </div>
  );
};

// ============ S3 — Parallel / Board ★ ============
export const S3: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const selected = interpolate(f, [180, 200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.handle });
  const tiles = [
    { name: "Direction A", status: "working", color: C.ai, clip: CLIPS.boardA },
    { name: "Direction B", status: "ready", color: C.success, clip: CLIPS.boardB },
    { name: "Direction C", status: "working", color: C.warning, clip: CLIPS.boardC },
  ];
  return (
    <SceneWrap dur={dur}>
      <Toast />
      <AbsoluteFill style={{ padding: PAD, gap: 36, justifyContent: "center" }}>
        <div style={{ maxWidth: 1200 }}>
          {COPY.s3.en.map((line, i) => {
            const a = useFadeUp(8 + i * 7, 7);
            return (
              <div key={i} style={{ ...a, fontSize: 40, fontWeight: i === 0 ? 700 : 600, color: i === 0 ? C.fg : C.mutedFg, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {line}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 28, height: 420 }}>
          {tiles.map((t, i) => {
            const a = useFadeUp(20 + i * 6, 8);
            const isSel = i === 1;
            return (
              <div key={i} style={{ ...a, flex: 1, display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Dot color={t.color} />
                  <span style={{ fontSize: 20, color: C.mutedFg }}>{t.name}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 14, color: C.mutedFg, marginLeft: "auto" }}>
                    {t.status}
                  </span>
                </div>
                <ScreenFrame
                  label={`CLIP 3 · ${t.name}`}
                  src={t.clip || undefined}
                  compact
                  style={{
                    flex: 1,
                    outline: isSel ? `3px solid ${C.fg}` : "none",
                    outlineOffset: 3,
                    opacity: isSel ? 1 : 1 - selected * 0.35,
                    transition: "none",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Micro en={COPY.s3.trustEn} ja={COPY.s3.trustJa} delay={40} mono />
        </div>
      </AbsoluteFill>
    </SceneWrap>
  );
};

// ============ S4 — Ship / hand off ============
export const S4: React.FC<{ dur: number }> = ({ dur }) => {
  const linkA = useFadeUp(14, 8);
  const prA = useFadeUp(26, 8);
  return (
    <SceneWrap dur={dur}>
      <AbsoluteFill style={{ padding: PAD, gap: 40, justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 32, height: 460 }}>
          <div style={{ flex: 1.1 }}>
            <ScreenFrame label="CLIP 4 · share + open PR" src={CLIPS.ship || undefined} style={{ width: "100%", height: "100%" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, justifyContent: "center" }}>
            <div style={{ ...linkA, border: `1px solid ${C.border}`, background: C.card, borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <Dot color={C.success} size={11} />
              <span style={{ fontFamily: FONT.mono, fontSize: 22, color: C.fg }}>bezier.app/s/3f9a…</span>
              <span style={{ fontSize: 18, color: C.mutedFg, marginLeft: "auto" }}>link copied</span>
            </div>
            <div style={{ ...prA, border: `1px solid ${C.border}`, background: C.card, borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <Dot color={C.ai} size={11} />
              <span style={{ fontSize: 22, color: C.fg }}>Open pull request</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 16, color: C.mutedFg, marginLeft: "auto" }}>main untouched</span>
            </div>
          </div>
        </div>
        <Caption en={COPY.s4.en} ja={COPY.s4.ja} delay={20} size={46} />
      </AbsoluteFill>
    </SceneWrap>
  );
};

// ============ S5 — Payoff + CTA ============
export const S5: React.FC<{ dur: number }> = ({ dur }) => {
  const closeEn = useFadeUp(14, 10);
  const closeJa = useFadeUp(26, 8);
  const cta = useFadeUp(48, 8);
  return (
    <SceneWrap dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, padding: PAD }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...closeEn, fontSize: 76, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, color: C.fg }}>
            {COPY.s5.closeEn}
          </div>
          <div style={{ ...closeJa, fontSize: 34, fontWeight: 500, color: C.mutedFg, marginTop: 18 }}>
            {COPY.s5.closeJa}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, marginTop: 18 }}>
          <Wordmark size={40} delay={40} />
          <div style={{ ...cta, fontSize: 21, color: C.mutedFg }}>{COPY.s5.descriptor}</div>
          <div style={{ ...cta, display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
            <div
              style={{
                background: C.primary,
                color: C.primaryFg,
                fontSize: 26,
                fontWeight: 600,
                padding: "16px 30px",
                borderRadius: 999,
              }}
            >
              {COPY.s5.cta}
            </div>
            {WAITLIST_URL ? (
              <span style={{ fontFamily: FONT.mono, fontSize: 22, color: C.mutedFg }}>{WAITLIST_URL}</span>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    </SceneWrap>
  );
};
