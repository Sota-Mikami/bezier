// Bezier logo — MONOCHROME "lit black" rule (per CEO + Typeless ref). Black-based
// but not flat: a subtle gradient simulates light hitting the mark (sheen), so it
// reads dimensional. Inverse on dark = soft white sheen. Same bézier abstraction
// (square anchor + handle line + round knob + one curve).

import { writeFileSync } from "node:fs";
const fmt = (n) => Number(n.toFixed(2));
const U = (a, b) => { const dx=b[0]-a[0], dy=b[1]-a[1]; const L=Math.hypot(dx,dy)||1; return [dx/L, dy/L]; };

const diamond = (P, s) => { const h=s/2; return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`; };
const square = (P, s) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="1" fill="url(#g)"/>`;
const knob = (C, r) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line = (a, b, w) => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

const deg = (d) => [Math.cos(d*Math.PI/180), Math.sin(d*Math.PI/180)];
// HANDLE LINE (square anchor ↔ round knob) is always a clear, continuous
// connector — that's what makes it read as bézier. The curve launches from the
// SAME anchor at angle cDeg (0=right, 90=down) and bends to E, staying attached.
function pen(o) {
  const A=o.A, K=o.K, w=o.w??7, wH=o.wH ?? w;
  const cd = deg(o.cDeg ?? 22);
  const c1 = [A[0]+cd[0]*(o.tan1??26), A[1]+cd[1]*(o.tan1??26)];
  return [
    line(A, K, wH),                                  // the connector — always present
    stroke(`M${fmt(A[0])} ${fmt(A[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(o.c2[0])} ${fmt(o.c2[1])} ${fmt(o.E[0])} ${fmt(o.E[1])}`, w),
    (o.shape==="square"?square:diamond)(A, o.aS ?? 13),
    knob(K, o.kR ?? 9),
  ];
}

const FORMS = {
  // image#1: handle = clear horizontal connector; curve hugs briefly then drops
  "F1 image#1 (hug→drop)": pen({ A:[26,40], K:[78,40], cDeg:20, tan1:26, c2:[60,64], E:[52,88] }),
  // early drop → handle line fully clear above the curve
  "F2 early drop":         pen({ A:[26,40], K:[76,40], cDeg:42, tan1:24, c2:[56,66], E:[50,88] }),
  // corner drop (Γ/r): curve falls almost straight from the anchor
  "F3 corner drop (r)":    pen({ A:[28,38], K:[78,38], cDeg:70, tan1:20, c2:[42,64], E:[60,86] }),
  // B-bowl: handle connector on top, curve bulges right & back (hint of B)
  "F4 B-bowl":             pen({ A:[30,30], K:[78,30], cDeg:30, tan1:24, c2:[78,60], E:[38,62] }),
  // bold favicon take of image#1
  "F5 bold":               pen({ A:[26,40], K:[76,40], cDeg:24, tan1:24, c2:[58,64], E:[52,88], w:9, wH:9, aS:16, kR:11 }),
};

// "lit black" gradient (light from top-left): lifted charcoal → deep ink.
// On dark surfaces, invert to a soft white sheen so it's also not flat.
function defs(theme) {
  // userSpaceOnUse → one continuous light direction across the WHOLE mark, and
  // it paints horizontal strokes (objectBoundingBox collapses on zero-height).
  const [a, b] = theme === "dark" ? ["#ffffff", "#b9b9c6"] : ["#41414e", "#0c0c11"];
  return `<defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="22" y1="14" x2="78" y2="94">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient></defs>`;
}
function mark(inner, theme, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs(theme)}${inner.join("")}</svg>`;
}
// app-icon tile (white, rounded, soft shadow — like the Typeless ref)
function appTile(inner, theme, px = 104) {
  const bg = theme === "dark" ? "#0e0e12" : "#ffffff";
  const shadow = theme === "dark" ? "0 1px 0 #2a2a32" : "0 6px 16px rgba(0,0,0,0.18)";
  const pad = Math.round(px * 0.16);
  return `<div style="width:${px}px;height:${px}px;border-radius:${Math.round(px*0.23)}px;background:${bg};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">
    ${mark(inner, theme, px - pad * 2)}</div>`;
}

const SMALL = [40, 24, 16];
function row(name, inner) {
  const lightSmall = SMALL.map((s) => mark(inner, "light", s)).join("");
  const darkSmall = SMALL.map((s) => mark(inner, "dark", s)).join("");
  return `<div style="margin-bottom:14px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 6px 2px;">${name}</div>
    <div style="display:flex;gap:18px;align-items:center;">
      ${appTile(inner, "light", 104)}
      <div style="display:flex;gap:14px;align-items:center;padding:10px 16px;background:#fff;border-radius:14px;">${lightSmall}</div>
      ${appTile(inner, "dark", 104)}
      <div style="display:flex;gap:14px;align-items:center;padding:10px 16px;background:#0e0e12;border-radius:14px;">${darkSmall}</div>
    </div></div>`;
}
const blocks = Object.entries(FORMS).map(([n, inner]) => row(n, inner)).join("");
writeFileSync(new URL("./index-bw.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — monochrome "lit black" (Typeless-style sheen, not flat)</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">each row: white app-tile · white favicons 40/24/16 · dark app-tile · dark favicons</div>${blocks}</body>`);
// emit svgs (light theme gradient)
for (const [name, inner] of Object.entries(FORMS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./bw-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${defs("light")}\n    ${inner.join("\n    ")}\n</svg>\n`);
}
console.log("wrote index-bw.html +", Object.keys(FORMS).length, "svgs");
