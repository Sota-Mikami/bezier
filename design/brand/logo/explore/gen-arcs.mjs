// Bezier logo — concentric ARCS from a corner dot (per CEO + reference image).
// A dot sits lower-left; from it, circle-lines of growing radius sweep up-right.
// Each arc = a cubic-bézier approximation of a circular arc (keeps the bézier
// grammar). φ governs the radius growth → nautilus-like, laminar, beautiful.
// The outermost arc is bold (the drawn leading edge); inner arcs are fine.

import { writeFileSync } from "node:fs";
const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;
const fmt = (n) => Number(n.toFixed(2));

// cubic bézier approximation of a circular arc, center O, radius r, a0→a1 (deg)
function arcPath(O, r, a0, a1) {
  const A0 = rad(a0), A1 = rad(a1);
  const k = (4 / 3) * Math.tan((A1 - A0) / 4);
  const p0 = [O[0] + r * Math.cos(A0), O[1] + r * Math.sin(A0)];
  const p3 = [O[0] + r * Math.cos(A1), O[1] + r * Math.sin(A1)];
  const p1 = [p0[0] - k * r * Math.sin(A0), p0[1] + k * r * Math.cos(A0)];
  const p2 = [p3[0] + k * r * Math.sin(A1), p3[1] - k * r * Math.cos(A1)];
  return `M${fmt(p0[0])} ${fmt(p0[1])} C${fmt(p1[0])} ${fmt(p1[1])} ${fmt(p2[0])} ${fmt(p2[1])} ${fmt(p3[0])} ${fmt(p3[1])}`;
}

function arcMark(opts) {
  const cfg = {
    n: 7, O: [26, 80],
    rMin: 16, rMax: 74, grow: 1.0,   // grow>0 → golden-ish outward spacing
    a0: -104, a1: -16,               // angular sector (up → right)
    aSpin: 0,                        // per-arc end-angle shift → spiral/spread
    aStartSpin: 0,                   // per-arc start-angle shift
    wInner: 1.0, wOuter: 3.0,        // fine inner → bold outer leading edge
    dotR: 3.2, ...opts,
  };
  // golden radii: gaps grow by φ outward (nautilus). normalize to [rMin,rMax].
  const gaps = [];
  for (let i = 0; i < cfg.n - 1; i++) gaps.push(PHI ** (i * cfg.grow));
  const tot = gaps.reduce((s, g) => s + g, 0) || 1;
  const radii = [0]; let acc = 0;
  for (const g of gaps) { acc += g / tot; radii.push(acc); }
  const paths = radii.map((t, i) => {
    const r = lerp(cfg.rMin, cfg.rMax, t);
    const a0 = cfg.a0 + cfg.aStartSpin * t;
    const a1 = cfg.a1 + cfg.aSpin * t;
    const w = lerp(cfg.wInner, cfg.wOuter, t);
    const op = lerp(0.7, 1, t);
    return `<path d="${arcPath(cfg.O, r, a0, a1)}" fill="none" stroke="${INK}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(op)}"/>`;
  }).join("\n    ");
  const dot = `<circle cx="${fmt(cfg.O[0])}" cy="${fmt(cfg.O[1])}" r="${cfg.dotR}" fill="${INDIGO}"/>`;
  return `${paths}\n    ${dot}`;
}

const VARIANTS = {
  "A 7 arcs — even sector": arcMark({ n: 7 }),
  "B 6 arcs — golden grow": arcMark({ n: 6, grow: 0.5, wOuter: 3.2 }),
  "C 8 arcs — spiral spin": arcMark({ n: 8, aSpin: 22, aStartSpin: -10, grow: 0.4, wInner: 0.9, wOuter: 3.0 }),
  "D 5 arcs — bold few": arcMark({ n: 5, rMin: 20, wInner: 1.6, wOuter: 3.6, dotR: 3.6 }),
  "E 9 arcs — fine fan, bold edge": arcMark({ n: 9, rMin: 14, wInner: 0.8, wOuter: 3.4, grow: 0.3 }),
  "F 7 arcs — wider sweep": arcMark({ n: 7, a0: -112, a1: -4, aSpin: 14, grow: 0.4 }),
};

const SIZES = [128, 64, 40, 24, 16];
function tile(inner, bg) {
  const isDark = bg === "dark"; const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${markup}</svg>`).join("");
  return `<div style="display:flex;gap:16px;align-items:center;padding:16px 20px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}
const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:12px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 6px 2px;">${name}</div>
  <div style="display:flex;gap:14px;">${tile(inner, "dark")}${tile(inner, "light")}</div></div>`).join("");
writeFileSync(new URL("./index-arcs.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — concentric arcs from a corner dot (128/64/40/24/16px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./arcs-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-arcs.html");
