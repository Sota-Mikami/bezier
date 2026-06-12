// Bezier logo — patterns v2. Lines truly EMANATE from the origin dot, gentle
// ~quarter-circle sweep (lower-left → upper-right), strands spaced apart. Core =
// offset strands off one gentle base; plus distinct alternatives. Favicon-tested.

import { writeFileSync } from "node:fs";
const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;
const fmt = (n) => Number(n.toFixed(2));
const dir = (deg) => [Math.cos(rad(deg)), Math.sin(rad(deg))];

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
  const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
  const dx = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0]);
  const dy = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1]);
  const L = Math.hypot(dx, dy) || 1;
  return [[x, y], [dy/L, -dx/L]]; // point, left-normal
}
function sample(seg, per = 26) {
  const pts = [];
  for (let j = 0; j <= per; j++) { const t = j / per; const [p, n] = cubic(seg[0], seg[1], seg[2], seg[3], t); pts.push({ p, n, t }); }
  return pts;
}
function smooth(points) {
  if (points.length < 2) return "";
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6];
    const c2 = [p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6];
    d += ` C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}
const path = (d, w, color = INK, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${op}"/>`;
const dot = (O, r = 3.2, c = INDIGO) => `<circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="${r}" fill="${c}"/>`;
const sq = (P, s = 4.5, c = INK) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="0.8" fill="${c}"/>`;

// GENTLE base: a ~quarter-circle from O (lower-left) to tip (upper-right)
const BASE = [[30, 80], [34, 54], [54, 42], [80, 42]];

// offset strands off BASE: all start at O, spaced, bunched at O → open at tip
function offsetStrands({ n, gap, originBunch = 0.1, rampPow = 0.9, wInner = 1.2, wOuter = 2.6, boldOuter = true, lenTrim = 0, color = INK, accentOuter = false }) {
  const base = sample(BASE);
  return Array.from({ length: n }, (_, i) => {
    const lim = 1 - lenTrim * (i / Math.max(1, n - 1));
    const pts = base.filter((b) => b.t <= lim).map((b) => {
      const ramp = originBunch + (1 - originBunch) * Math.pow(b.t, rampPow);
      return [b.p[0] + b.n[0] * gap * i * ramp, b.p[1] + b.n[1] * gap * i * ramp];
    });
    const tt = i / Math.max(1, n - 1);
    const w = boldOuter ? lerp(wInner, wOuter, tt) : lerp(wOuter, wInner, tt);
    const c = accentOuter && i === n - 1 ? INDIGO : color;
    return path(smooth(pts), w, c);
  }).join("\n    ");
}
const O = BASE[0];

// ---- curated patterns ------------------------------------------------------
const PATTERNS = {
  "Q3 gentle · 3 strands": `${offsetStrands({ n: 3, gap: 9 })}\n    ${dot(O)}`,
  "Q4 gentle · 4 strands": `${offsetStrands({ n: 4, gap: 7.5 })}\n    ${dot(O)}`,
  "Q5 gentle · 5 strands": `${offsetStrands({ n: 5, gap: 6.5 })}\n    ${dot(O)}`,
  "Q5f tip-fan · 5": `${offsetStrands({ n: 5, gap: 7, lenTrim: 0.18 })}\n    ${dot(O)}`,
  "Q4w wider gaps · 4": `${offsetStrands({ n: 4, gap: 9, originBunch: 0.2 })}\n    ${dot(O)}`,
  "Q5d duo (indigo outer) · 5": `${offsetStrands({ n: 5, gap: 6.5, accentOuter: true })}\n    ${dot(O)}`,
  "Q5b bold inner edge · 5": `${offsetStrands({ n: 5, gap: 6.5, boldOuter: false, wOuter: 3.0 })}\n    ${dot(O)}`,
  // distinct alternatives:
  "PEN handle + curve": (() => {
    const a = BASE;
    const curve = `M${a[0][0]} ${a[0][1]} C${a[1][0]} ${a[1][1]} ${a[2][0]} ${a[2][1]} ${a[3][0]} ${a[3][1]}`;
    return [
      path(curve, 3.0, INK),
      `<line x1="${a[0][0]}" y1="${a[0][1]}" x2="${a[1][0]}" y2="${a[1][1]}" stroke="${INDIGO}" stroke-width="1.5" stroke-linecap="round"/>`,
      `<line x1="${a[3][0]}" y1="${a[3][1]}" x2="${a[2][0]}" y2="${a[2][1]}" stroke="${INDIGO}" stroke-width="1.5" stroke-linecap="round"/>`,
      sq(a[0], 5), sq(a[3], 5), dot(a[1], 2.4), dot(a[2], 2.4),
    ].join("\n    ");
  })(),
  "LEAF open petal": (() => {
    const T = [80, 42];
    const outer = `M30 80 C 32 50 48 40 ${T[0]} ${T[1]}`;
    const inner = `M30 80 C 52 72 64 56 ${T[0]} ${T[1]}`;
    return [path(outer, 2.6), path(inner, 2.0), dot(O), sq(T, 4.5)].join("\n    ");
  })(),
  "COMET answer + ghosts": (() => {
    const ghosts = offsetStrands({ n: 3, gap: 6, wInner: 1.0, wOuter: 1.0, boldOuter: true })
      .replaceAll(`stroke-width="1"`, `stroke-width="1" opacity="0.45"`);
    const bold = path(smooth(sample(BASE).map((b) => b.p)), 3.4, INK);
    return `${ghosts}\n    ${bold}\n    ${dot(O, 3.4)}`;
  })(),
  "SHEAF near-straight · 4": (() => {
    const n = 4;
    const s = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1), ang = -80 + t * 44, len = lerp(56, 48, Math.abs(t - 0.5) * 2);
      const T = [O[0] + dir(ang)[0] * len, O[1] + dir(ang)[1] * len];
      const c1 = [O[0] + dir(ang)[0] * len * 0.55 - 3, O[1] + dir(ang)[1] * len * 0.55];
      const c2 = [T[0] - 5, T[1] + 3];
      return path(`M${O[0]} ${O[1]} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(T[0])} ${fmt(T[1])}`, 2.4);
    }).join("\n    ");
    return `${s}\n    ${dot(O)}`;
  })(),
};

const SIZES = [96, 48, 32, 20, 16];
function tile(inner, bg) {
  const isDark = bg === "dark"; const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${markup}</svg>`).join("");
  return `<div style="display:flex;gap:14px;align-items:center;padding:14px 18px;background:${tileBg};border-radius:14px;">${svgs}</div>`;
}
const blocks = Object.entries(PATTERNS).map(([name, inner]) => `
  <div style="margin-bottom:11px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 5px 2px;">${name}</div>
  <div style="display:flex;gap:12px;">${tile(inner, "dark")}${tile(inner, "light")}</div></div>`).join("");
writeFileSync(new URL("./index-patterns2.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — logo patterns v2 · gentle quarter-arc, lines from the dot (96/48/32/20/16px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(PATTERNS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./p2-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-patterns2.html +", Object.keys(PATTERNS).length, "svgs");
