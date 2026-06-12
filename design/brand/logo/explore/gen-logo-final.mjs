// Bezier logo — FINAL tuning of variant H (diagonal divergent blossom).
// Origin lower-left → silky fan opens up-right, all tips share a curl (feather).
// φ governs strand spacing. Plus a SMALL-SIZE mark (few bold strands) for favicon.

import { writeFileSync } from "node:fs";

const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24";
const INDIGO = "#4750d4";
const PAPER = "#f7f6f3";

const lerp = (a, b, t) => a + (b - a) * t;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const fmt = (n) => Number(n.toFixed(2));

function goldenPositions(n, bias = 0.55) {
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
  // center strands longest; lenBias shifts the longest toward the upper wing
  const k = 1 - Math.abs(p - lenBias) * 2;
  const tR = lerp(tipR0, tipR1, Math.max(0, k));
  const T = [O[0] + dir(tDeg)[0] * tR, O[1] + dir(tDeg)[1] * tR];
  const [cx, cy] = dir(tDeg + curlDeg);
  const P2 = [T[0] - cx * tipHandle, T[1] - cy * tipHandle];
  return `M${fmt(O[0])} ${fmt(O[1])} C${fmt(P1[0])} ${fmt(P1[1])} ${fmt(P2[0])} ${fmt(P2[1])} ${fmt(T[0])} ${fmt(T[1])}`;
}

function fanMark(opts) {
  const {
    n = 18, O = [33, 78], rootDeg = -70, rootLen = 30, spreadDeg = 48,
    tipR0 = 64, tipR1 = 82, curlDeg = 28, tipHandle = 30, lenBias = 0.58,
    wMin = 0.7, wMax = 1.3, bias = 0.55, handle = true, dotR = 2.4,
  } = opts;
  const pos = goldenPositions(n, bias);
  const paths = pos.map((p) => {
    const d = strand({ p, O, rootDeg, rootLen, spreadDeg, tipR0, tipR1, curlDeg, tipHandle, lenBias });
    const w = lerp(wMax, wMin, Math.abs(p - 0.5) * 2);
    const op = lerp(0.6, 0.92, 1 - Math.abs(p - 0.5) * 2 * 0.45);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(op)}"/>`;
  }).join("\n    ");
  let h = "";
  if (handle) {
    const [hx, hy] = dir(rootDeg);
    h = `
    <line x1="${fmt(O[0])}" y1="${fmt(O[1])}" x2="${fmt(O[0] + hx * 8)}" y2="${fmt(O[1] + hy * 8)}" stroke="${INDIGO}" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="${dotR}" fill="${INDIGO}"/>`;
  }
  return `${paths}${h}`;
}

// micro-tuning grid around H
const VARIANTS = {
  "H1 base":               fanMark({}),
  "H2 tighter spread 42":  fanMark({ spreadDeg: 42, curlDeg: 26 }),
  "H3 more curl 34":       fanMark({ spreadDeg: 46, curlDeg: 34 }),
  "H4 denser 22 strands":  fanMark({ n: 22, spreadDeg: 46, curlDeg: 28, wMin: 0.55, wMax: 1.15 }),
  "H5 steeper root -78":   fanMark({ rootDeg: -78, spreadDeg: 50, curlDeg: 30 }),
  "H6 long upper wing":    fanMark({ spreadDeg: 50, curlDeg: 30, lenBias: 0.66, tipR1: 86 }),
  // SMALL-SIZE mark: few bold strands, same gesture, holds at favicon size
  "S small mark — 6 bold": fanMark({ n: 6, spreadDeg: 44, curlDeg: 26, rootLen: 26, tipR0: 66, tipR1: 80, wMin: 2.0, wMax: 3.4, bias: 0.4, dotR: 3.4 }),
  "S2 small mark — 7 bold":fanMark({ n: 7, spreadDeg: 46, curlDeg: 28, rootLen: 26, tipR0: 64, tipR1: 80, wMin: 1.8, wMax: 3.0, bias: 0.45, dotR: 3.2 }),
};

const SIZES = [128, 64, 32, 20];

function tile(inner, bg) {
  const isDark = bg === "dark";
  const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
  ).join("");
  return `<div style="display:flex;gap:16px;align-items:center;padding:16px 20px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}

const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:12px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 6px 2px;">${name}</div>
    <div style="display:flex;gap:14px;">${tile(inner, "dark")}${tile(inner, "light")}</div>
  </div>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;padding:24px;background:#1a1a1f;font-family:ui-sans-serif,system-ui;}</style></head><body>
<div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier logo — H final tuning + small-size mark (128/64/32/20px)</div>
${blocks}</body></html>`;

writeFileSync(new URL("./index-final.html", import.meta.url), html);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./final-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-final.html +", Object.keys(VARIANTS).length, "svgs");
