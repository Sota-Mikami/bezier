// Bezier logo — the REAL bézier abstraction (image #1), kept simple: ONE square
// anchor + ONE tangent handle line + ONE round knob + ONE curve. Unified by a
// single gradient. The curve's ANGLE only *hints* at a fragment of B / r — we
// don't draw the whole letter. The curve leaves the anchor along the handle's
// tangent (real pen-tool behaviour), then bends.

import { writeFileSync } from "node:fs";
const INK = "#1c1c24", INDIGO = "#4750d4", VIOLET = "#8b7cf6", PAPER = "#f7f6f3";
const fmt = (n) => Number(n.toFixed(2));
const U = (a, b) => { const dx=b[0]-a[0], dy=b[1]-a[1]; const L=Math.hypot(dx,dy)||1; return [dx/L, dy/L]; };

const diamond = (P, s) => { const h=s/2; return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`; };
const square = (P, s) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="1" fill="url(#g)"/>`;
const knob = (C, r) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line = (a, b, w) => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

// one anchor + handle + knob + curve. tan1 = handle-tangent length the curve
// inherits; c2/E shape the bend. anchorShape diamond|square.
function pen(o) {
  const A=o.A, K=o.K, w=o.w??6;
  const d = U(A, K);
  const c1 = [A[0]+d[0]*o.tan1, A[1]+d[1]*o.tan1];
  const parts = [
    line(A, K, o.wH ?? w),
    stroke(`M${fmt(A[0])} ${fmt(A[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(o.c2[0])} ${fmt(o.c2[1])} ${fmt(o.E[0])} ${fmt(o.E[1])}`, w),
    (o.shape==="square"?square:diamond)(A, o.aS ?? 12),
    knob(K, o.kR ?? 8),
  ];
  return parts;
}

// Each variant: same simple anatomy, different curve angle = a different hint.
const V = {
  // faithful to image #1 — curve leaves right, plunges to lower-right (stem/tail)
  "P1 faithful #1": pen({ A:[24,38], K:[84,38], tan1:30, c2:[66,60], E:[58,86] }),
  // the curve bulges right & back = the BOWL of a B/b (just the bowl, one curve)
  "P2 B-bowl hint": pen({ A:[30,28], K:[80,28], tan1:30, c2:[78,62], E:[36,64] }),
  // shallower bowl, lands lower — reads like the lower bowl of a B
  "P3 lower-bowl": pen({ A:[30,34], K:[80,34], tan1:28, c2:[80,74], E:[34,78] }),
  // r-arm: curve makes a short hook up-right then settles (arm of an r)
  "P4 r-arm hint": pen({ A:[30,72], K:[78,40], tan1:24, c2:[70,40], E:[64,52] }),
  // image#1 but the curve hooks back a touch at the end (more letter-ish)
  "P5 #1 + end hook": pen({ A:[24,36], K:[84,36], tan1:34, c2:[70,70], E:[50,84] }),
  // steeper, more vertical drop (stem-like, hints r/b stem)
  "P6 steep stem": pen({ A:[28,30], K:[82,30], tan1:22, c2:[60,66], E:[52,90] }),
  // knob lower-right (handle angled down) — tangent leads the curve into a bowl
  "P7 angled handle": pen({ A:[28,30], K:[78,58], tan1:30, c2:[74,78], E:[40,80] }),
  // bold favicon take of the faithful form
  "P8 favicon-bold": pen({ A:[26,38], K:[82,38], tan1:28, c2:[66,62], E:[56,86], w:8, wH:7, aS:15, kR:10 }),
  // square anchor instead of diamond
  "P9 square anchor": pen({ A:[24,38], K:[84,38], tan1:30, c2:[66,60], E:[58,86], shape:"square", aS:11 }),
  // wide gentle — curve barely bends (calm, like the start of a stroke)
  "P10 gentle": pen({ A:[24,42], K:[84,42], tan1:40, c2:[72,56], E:[64,78] }),
};

const GRAD = [INDIGO, VIOLET];
function svgFor(inner, size, bg) {
  const stops = GRAD;
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}${inner.join("")}</svg>`;
}
const SIZES = [104, 56, 32, 20, 16];
function tile(inner, bg) {
  const tileBg = bg === "dark" ? "#0e0e12" : PAPER;
  const svgs = SIZES.map((s) => svgFor(inner, s, bg)).join("");
  return `<div style="display:flex;gap:14px;align-items:center;padding:14px 18px;background:${tileBg};border-radius:14px;">${svgs}</div>`;
}
const blocks = Object.entries(V).map(([name, inner]) => `
  <div style="margin-bottom:11px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 5px 2px;">${name}</div>
  <div style="display:flex;gap:12px;">${tile(inner, "dark")}${tile(inner, "light")}</div></div>`).join("");
writeFileSync(new URL("./index-pen2.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — true bézier abstraction (image#1), gradient, curve angle hints B/r fragment (104/56/32/20/16px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(V)) {
  const id = name.split(" ")[0].toLowerCase();
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${INDIGO}"/><stop offset="1" stop-color="${VIOLET}"/></linearGradient></defs>`;
  writeFileSync(new URL(`./pen2-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${defs}\n    ${inner.join("\n    ")}\n</svg>\n`);
}
console.log("wrote index-pen2.html +", Object.keys(V).length, "svgs");
