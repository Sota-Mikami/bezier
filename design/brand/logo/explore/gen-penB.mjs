// Bezier logo — pen-tool motif arranged so the ANGLES read as a "B", unified by
// a single gradient (no per-element color; better favicon legibility).
// Vocabulary kept: square anchor (repo start) · handle line + round knob (the
// control you hold) · the curve (what the AI draws). Composition suggests B.

import { writeFileSync } from "node:fs";
const INK = "#1c1c24", INDIGO = "#4750d4", VIOLET = "#8b7cf6", PAPER = "#f7f6f3";
const fmt = (n) => Number(n.toFixed(2));

// shared-gradient primitives (all reference url(#g))
const diamond = (P, s) => { const h = s/2; return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`; };
const square = (P, s) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="1" fill="url(#g)"/>`;
const knob = (C, r) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line = (a, b, w) => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// Each variant returns the inner elements (anchor + handle + knob + curve).
const V = {
  // B1 — vertical spine handle (square top → round knob bottom), curve = 2 bowls
  "B1 spine + 2-bowl curve": [
    line([30, 22], [30, 80], 6),
    stroke("M30 22 C 60 22 66 40 42 51 C 66 52 66 72 30 80", 6),
    square([30, 22], 12), knob([30, 80], 8),
  ],
  // B2 — top horizontal handle (square → knob), curve sweeps the bowls down
  "B2 top handle + bowl drop": [
    line([28, 24], [74, 24], 6),
    stroke("M28 24 C 28 50 70 40 42 52 C 70 60 60 80 28 80", 6),
    square([28, 24], 12), knob([74, 24], 8),
  ],
  // B3 — faithful-to-#1 but bent into a B: anchor left, knob right, curve doubles
  "B3 image#1 bent to B": [
    line([24, 30], [82, 30], 5),
    stroke("M24 30 C 56 30 60 48 38 52 C 60 56 60 82 30 82", 6),
    diamond([24, 30], 12), knob([82, 30], 8),
  ],
  // B4 — single bold bowl (reads B/P), spine handle, knob caps the spine
  "B4 single-bowl spine": [
    line([30, 22], [30, 80], 6),
    stroke("M30 22 C 72 24 72 50 30 51", 6),
    stroke("M30 51 C 70 52 72 80 30 80", 6),
    square([30, 22], 12), knob([30, 80], 8),
  ],
  // B5 — diagonal/italic B: anchor top-left, knob lower-right, leaning bowls
  "B5 italic B": [
    line([30, 22], [70, 76], 5),
    stroke("M30 22 C 62 22 64 40 44 49 C 66 52 64 70 50 80", 6),
    square([30, 22], 12), knob([70, 76], 8),
  ],
  // B6 — knob up (held point at top), curve forms B body downward
  "B6 knob-up": [
    line([34, 22], [72, 22], 5),
    stroke("M34 22 C 34 48 68 42 42 52 C 70 60 60 82 34 82", 6),
    square([34, 22], 11), knob([72, 22], 8),
  ],
  // B7 — minimal B: spine + one continuous S that hints both bowls
  "B7 minimal S-B": [
    line([30, 24], [30, 78], 6),
    stroke("M30 24 C 64 26 62 49 34 51 C 62 53 64 76 30 78", 7),
    square([30, 24], 12), knob([30, 78], 8.5),
  ],
  // B8 — bold favicon B
  "B8 favicon-bold": [
    line([30, 24], [30, 78], 8),
    stroke("M30 24 C 66 26 66 49 38 51 C 66 53 66 76 30 78", 8),
    square([30, 24], 15), knob([30, 78], 10),
  ],
  // R1 — lowercase "r": curved stem drops, handle-arm reaches up-right to knob
  "R1 r — stem + arm (≈image#1)": [
    line([30, 30], [74, 24], 5),
    stroke("M30 30 C 26 50 30 66 40 82", 6),
    square([30, 30], 12), knob([74, 24], 8),
  ],
  // R2 — "r" where the CURVE is the arm hooking right, stem = straight handle
  "R2 r — arm-curve + stem": [
    line([30, 24], [30, 80], 6),
    stroke("M30 30 C 44 26 62 28 70 42", 6),
    square([30, 24], 12), knob([30, 80], 8),
  ],
  // R3 — bold favicon r
  "R3 r favicon-bold": [
    line([30, 28], [72, 22], 7),
    stroke("M30 28 C 25 50 30 68 42 82", 8),
    square([30, 28], 14), knob([72, 22], 9.5),
  ],
};

// gradients: indigo→violet (saturated, reads on dark AND light), + an ink→indigo
const GRADS = {
  "indigo→violet": [INDIGO, VIOLET],
  "ink→indigo": [INK, INDIGO],
};

function svgFor(inner, g, size, bg) {
  // on dark bg, lift the ink end so it doesn't vanish
  const stops = bg === "dark" && g[0] === INK ? ["#cfcfe6", VIOLET] : g;
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}${inner.join("")}</svg>`;
}
const SIZES = [104, 56, 32, 20, 16];
function tile(inner, g, bg) {
  const tileBg = bg === "dark" ? "#0e0e12" : PAPER;
  const svgs = SIZES.map((s) => svgFor(inner, g, s, bg)).join("");
  return `<div style="display:flex;gap:14px;align-items:center;padding:14px 18px;background:${tileBg};border-radius:14px;">${svgs}</div>`;
}
// primary sheet: indigo→violet gradient
const blocks = Object.entries(V).map(([name, inner]) => `
  <div style="margin-bottom:11px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 5px 2px;">${name}</div>
  <div style="display:flex;gap:12px;">${tile(inner, GRADS["indigo→violet"], "dark")}${tile(inner, GRADS["indigo→violet"], "light")}</div></div>`).join("");
writeFileSync(new URL("./index-penB.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — pen-tool "B", unified gradient indigo→violet (104/56/32/20/16px · dark | light)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(V)) {
  const id = name.split(" ")[0].toLowerCase();
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${INDIGO}"/><stop offset="1" stop-color="${VIOLET}"/></linearGradient></defs>`;
  writeFileSync(new URL(`./penb-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${defs}\n    ${inner.join("\n    ")}\n</svg>\n`);
}
console.log("wrote index-penB.html +", Object.keys(V).length, "svgs");
