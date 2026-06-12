// Bezier logo — refine: FEWER strands, tighter spread, each line deliberate.
// (CEO: "広がりすぎ・もっと線を少なく美しく")

import { writeFileSync } from "node:fs";

const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24";
const INDIGO = "#4750d4";
const PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const fmt = (n) => Number(n.toFixed(2));

function goldenPositions(n, bias) {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const g = 1 - Math.pow(1 - t, PHI);
    pos.push(lerp(t, g, bias));
  }
  return pos;
}
function strand({ p, O, rootDeg, rootLen, spreadDeg, tipR0, tipR1, curlDeg, tipHandle, lenBias }) {
  const [rx, ry] = dir(rootDeg);
  const P1 = [O[0] + rx * rootLen, O[1] + ry * rootLen];
  const tDeg = rootDeg + lerp(-spreadDeg, spreadDeg, p);
  const k = Math.max(0, 1 - Math.abs(p - lenBias) * 2);
  const tR = lerp(tipR0, tipR1, k);
  const T = [O[0] + dir(tDeg)[0] * tR, O[1] + dir(tDeg)[1] * tR];
  const [cx, cy] = dir(tDeg + curlDeg);
  const P2 = [T[0] - cx * tipHandle, T[1] - cy * tipHandle];
  return `M${fmt(O[0])} ${fmt(O[1])} C${fmt(P1[0])} ${fmt(P1[1])} ${fmt(P2[0])} ${fmt(P2[1])} ${fmt(T[0])} ${fmt(T[1])}`;
}
function fanMark(opts) {
  const cfg = {
    n: 9, O: [34, 78], rootDeg: -72, rootLen: 30, spreadDeg: 34,
    tipR0: 64, tipR1: 84, curlDeg: 28, tipHandle: 30, lenBias: 0.6,
    wMin: 0.85, wMax: 1.7, bias: 0.5, dotR: 2.6, handleLen: 8, ...opts,
  };
  const pos = goldenPositions(cfg.n, cfg.bias);
  const paths = pos.map((p) => {
    const d = strand({ ...cfg, p });
    const w = lerp(cfg.wMax, cfg.wMin, Math.abs(p - 0.5) * 2);
    const op = lerp(0.7, 0.95, 1 - Math.abs(p - 0.5) * 2 * 0.35);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(op)}"/>`;
  }).join("\n    ");
  const [hx, hy] = dir(cfg.rootDeg);
  const h = `
    <line x1="${fmt(cfg.O[0])}" y1="${fmt(cfg.O[1])}" x2="${fmt(cfg.O[0] + hx * cfg.handleLen)}" y2="${fmt(cfg.O[1] + hy * cfg.handleLen)}" stroke="${INDIGO}" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="${fmt(cfg.O[0])}" cy="${fmt(cfg.O[1])}" r="${cfg.dotR}" fill="${INDIGO}"/>`;
  return `${paths}${h}`;
}

const VARIANTS = {
  "R1 — 9 strands, spread 34": fanMark({ n: 9, spreadDeg: 34 }),
  "R2 — 7 strands, spread 32": fanMark({ n: 7, spreadDeg: 32, wMax: 1.9, wMin: 1.0 }),
  "R3 — 11 strands, spread 36": fanMark({ n: 11, spreadDeg: 36, wMax: 1.5, wMin: 0.75 }),
  "R4 — 8 strands, calm spread 28": fanMark({ n: 8, spreadDeg: 28, curlDeg: 22, wMax: 1.8, wMin: 0.95 }),
  "R5 — 9 strands, more curl 36": fanMark({ n: 9, spreadDeg: 34, curlDeg: 36, lenBias: 0.62 }),
  "R6 — 7 strands, long upper wing": fanMark({ n: 7, spreadDeg: 34, curlDeg: 30, lenBias: 0.7, tipR1: 88, wMax: 1.9, wMin: 1.0 }),
};

const SIZES = [128, 64, 40, 24];
function tile(inner, bg) {
  const isDark = bg === "dark";
  const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${markup}</svg>`).join("");
  return `<div style="display:flex;gap:16px;align-items:center;padding:16px 20px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}
const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:12px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 6px 2px;">${name}</div>
    <div style="display:flex;gap:14px;">${tile(inner, "dark")}${tile(inner, "light")}</div>
  </div>`).join("");
writeFileSync(new URL("./index-refine.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — fewer strands, tighter spread (128/64/40/24px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./refine-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-refine.html +", Object.keys(VARIANTS).length, "svgs");
