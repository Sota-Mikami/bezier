// Bezier logo exploration — a *fan of bézier curves* converging to one bold
// drawn sweep. Aesthetic rule: golden ratio (φ) governs the strand spacing and
// the hook's spiral; the family of light strands = the agent exploring possible
// curves, the single bold strand = the one drawn. One indigo control-handle dot
// marks "the handle you hold." Output: index.html with variants × sizes, on
// dark + light tiles. Render via Chrome headless, eyeball, refine.

import { writeFileSync } from "node:fs";

const PHI = (1 + Math.sqrt(5)) / 2; // 1.6180339887…
const INK = "#1c1c24";
const INDIGO = "#4750d4";
const PAPER = "#f7f6f3";

// ---- math helpers ----------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const fmt = (n) => Number(n.toFixed(2));

// Golden-progression positions in [0,1]: gaps shrink by 1/φ each step so strands
// crowd toward the spine (the feather look). Returns N values, p0=0 … p_{N-1}=1.
function goldenPositions(n) {
  const gaps = [];
  for (let i = 0; i < n - 1; i++) gaps.push(1 / PHI ** i);
  const total = gaps.reduce((s, g) => s + g, 0);
  const pos = [0];
  let acc = 0;
  for (const g of gaps) {
    acc += g / total;
    pos.push(acc);
  }
  return pos; // length n
}

// One cubic strand from a fanned tail into the shared hooked tip.
// p in [0,1]: 0 = outer wing (airy), 1 = spine (bold).
function strand({ p, cx, cy, tip, tipTan, arcR0, arcR1, arcA0, arcA1, tailTanDeg, tailLen, tipLen }) {
  const a = lerp(arcA0, arcA1, p);
  const r = lerp(arcR0, arcR1, p);
  const [ax, ay] = polar(cx, cy, r, a);
  // tail tangent fans with the strand
  const tdeg = lerp(tailTanDeg[0], tailTanDeg[1], p);
  const [tdx, tdy] = polar(0, 0, 1, tdeg);
  const p1x = ax + tdx * tailLen;
  const p1y = ay + tdy * tailLen;
  // approach tip along a shared tangent so all strands curl into one hook
  const p2x = tip[0] - tipTan[0] * tipLen;
  const p2y = tip[1] - tipTan[1] * tipLen;
  return `M${fmt(ax)} ${fmt(ay)} C${fmt(p1x)} ${fmt(p1y)} ${fmt(p2x)} ${fmt(p2y)} ${fmt(tip[0])} ${fmt(tip[1])}`;
}

// Build a fan mark. Returns inner SVG markup (no <svg> wrapper). box = 100.
function fanMark(opts) {
  const {
    n = 11,
    cx = 38, cy = 40,
    tip = [70, 78],
    tipTanDeg = -118,        // direction the strands enter the tip
    arcR0 = 34, arcR1 = 12,  // tail radius: outer wing far, spine near
    arcA0 = -140, arcA1 = -62,
    tailTanDeg = [-44, 8],
    tailLen0 = 20, tailLen1 = 30,
    tipLen0 = 30, tipLen1 = 46,
    wMin = 0.9, wMax = 4.4,  // stroke weight ramp
    ink = INK,
    handle = true,
    color = "mono",          // "mono" = ink only; "duo" = spine indigo
  } = opts;

  const [tdx, tdy] = polar(0, 0, 1, tipTanDeg);
  const pos = goldenPositions(n);
  const paths = pos
    .map((p, i) => {
      const d = strand({
        p, cx, cy, tip, tipTan: [tdx, tdy],
        arcR0, arcR1, arcA0, arcA1, tailTanDeg,
        tailLen: lerp(tailLen0, tailLen1, p),
        tipLen: lerp(tipLen0, tipLen1, p),
      });
      const w = lerp(wMin, wMax, p);
      const op = lerp(0.5, 1, p); // wing strands a touch lighter
      const isSpine = i === pos.length - 1;
      const stroke = color === "duo" && isSpine ? INDIGO : ink;
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(op)}"/>`;
    })
    .join("\n    ");

  // the held control-handle: a small tangent + indigo dot at the spine tail
  let handleMarkup = "";
  if (handle) {
    const [sx, sy] = polar(cx, cy, arcR1, arcA1);
    const [hdx, hdy] = polar(0, 0, 1, tailTanDeg[1]);
    const hx = sx + hdx * 11, hy = sy + hdy * 11;
    handleMarkup = `
    <line x1="${fmt(sx)}" y1="${fmt(sy)}" x2="${fmt(hx)}" y2="${fmt(hy)}" stroke="${INDIGO}" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>
    <circle cx="${fmt(hx)}" cy="${fmt(hy)}" r="2.2" fill="${INDIGO}"/>`;
  }
  return `${paths}${handleMarkup}`;
}

// ---- variants --------------------------------------------------------------
const VARIANTS = {
  "V1 Quill — 11 strands, mono + handle": fanMark({ n: 11, color: "mono", handle: true }),
  "V1b Quill — no handle": fanMark({ n: 11, color: "mono", handle: false }),
  "V2 Sweep — 7 strands, duo spine": fanMark({
    n: 7, color: "duo", handle: true, wMin: 1.3, wMax: 5.2, arcR0: 32, arcR1: 13,
  }),
  "V3 Tight comma — denser hook": fanMark({
    n: 13, color: "mono", handle: true,
    tip: [72, 80], tipTanDeg: -112, arcA0: -150, arcA1: -58, arcR0: 33, arcR1: 11,
    tailTanDeg: [-52, 2], wMin: 0.8, wMax: 4.0,
  }),
  "V4 Wing — wider fan": fanMark({
    n: 12, color: "mono", handle: false,
    cx: 36, cy: 42, tip: [74, 70], tipTanDeg: -126,
    arcR0: 38, arcR1: 12, arcA0: -158, arcA1: -50, tailTanDeg: [-38, 14],
    wMin: 0.8, wMax: 4.8,
  }),
  "V5 Duo wing": fanMark({
    n: 12, color: "duo", handle: false,
    cx: 36, cy: 42, tip: [74, 70], tipTanDeg: -126,
    arcR0: 38, arcR1: 12, arcA0: -158, arcA1: -50, tailTanDeg: [-38, 14],
    wMin: 0.8, wMax: 5.0,
  }),
};

const SIZES = [128, 56, 28];

function tile(inner, bg, sizes) {
  const isDark = bg === "dark";
  const tileBg = isDark ? "#0e0e12" : PAPER;
  // recolor ink for dark tiles
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = sizes
    .map(
      (s) =>
        `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
    )
    .join("");
  return `<div style="display:flex;gap:18px;align-items:center;padding:18px 22px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}

const blocks = Object.entries(VARIANTS)
  .map(
    ([name, inner]) => `
  <div style="margin-bottom:14px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 8px 2px;">${name}</div>
    <div style="display:flex;gap:14px;">
      ${tile(inner, "dark", SIZES)}
      ${tile(inner, "light", SIZES)}
    </div>
  </div>`
  )
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;padding:26px;background:#1a1a1f;font-family:ui-sans-serif,system-ui;}</style>
</head><body>
<div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:18px;">Bezier logo — fan-of-curves exploration (φ-spaced)</div>
${blocks}
</body></html>`;

writeFileSync(new URL("./index.html", import.meta.url), html);
// also write each variant as a standalone .svg for inspection
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  const svg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`;
  writeFileSync(new URL(`./mark-${id}.svg`, import.meta.url), svg);
}
console.log("wrote index.html +", Object.keys(VARIANTS).length, "svgs. φ =", PHI.toFixed(6));
