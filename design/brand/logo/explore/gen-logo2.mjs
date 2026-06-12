// Bezier logo v2 — DIVERGENT fan. One origin (the repo / the point you hold) →
// thin bézier curves emerge as ONE stroke, then peel apart and blossom outward
// (the agent spreading one source into many ideas/designs). Aesthetic rule: the
// golden ratio governs the angular spacing of the spray + each strand's curl.
// One indigo control dot marks the held origin. Render, eyeball, refine.

import { writeFileSync } from "node:fs";

const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24";
const INDIGO = "#4750d4";
const PAPER = "#f7f6f3";

const lerp = (a, b, t) => a + (b - a) * t;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const fmt = (n) => Number(n.toFixed(2));

// golden positions in [0,1]; gaps grow by φ so the spray opens (sparse base → wide top)
function goldenPositions(n, grow = true) {
  const gaps = [];
  for (let i = 0; i < n - 1; i++) gaps.push(grow ? PHI ** i : (1 / PHI) ** i);
  const total = gaps.reduce((s, g) => s + g, 0);
  const pos = [0];
  let acc = 0;
  for (const g of gaps) { acc += g / total; pos.push(acc); }
  return pos;
}

// One divergent strand: shared origin O, shared emergence tangent, fanned tip.
function strand({ p, O, emergeDeg, baseLen, tipDeg0, tipDeg1, tipR0, tipR1, tipTanDelta, tipLen0, tipLen1, curl }) {
  const [ex, ey] = dir(emergeDeg);
  // all strands share (nearly) the same first handle → they're born as one stroke
  const p1x = O[0] + ex * baseLen;
  const p1y = O[1] + ey * baseLen;
  // tip fans along an arc measured from O
  const tDeg = lerp(tipDeg0, tipDeg1, p);
  const tR = lerp(tipR0, tipR1, p);
  const [tx, ty] = dir(tDeg);
  const Tx = O[0] + tx * tR;
  const Ty = O[1] + ty * tR;
  // tip tangent: along the radial, rotated by a φ-scaled curl so ends sweep
  const tanDeg = tDeg + lerp(-tipTanDelta, tipTanDelta, p) + curl;
  const [dtx, dty] = dir(tanDeg);
  const tipLen = lerp(tipLen0, tipLen1, p);
  const p2x = Tx - dtx * tipLen;
  const p2y = Ty - dty * tipLen;
  return { d: `M${fmt(O[0])} ${fmt(O[1])} C${fmt(p1x)} ${fmt(p1y)} ${fmt(p2x)} ${fmt(p2y)} ${fmt(Tx)} ${fmt(Ty)}`, T: [Tx, Ty] };
}

function fanMark(opts) {
  const {
    n = 12,
    O = [34, 74],
    emergeDeg = -80,          // born pointing up
    baseLen = 16,
    tipDeg0 = -150, tipDeg1 = -18,
    tipR0 = 58, tipR1 = 50,
    tipTanDelta = 8,
    tipLen0 = 26, tipLen1 = 22,
    curl = -10,
    wMin = 0.7, wMax = 1.7,
    grow = true,
    ink = INK,
    color = "mono",          // mono | duo (one indigo strand)
    handle = true,
  } = opts;

  const pos = goldenPositions(n, grow);
  const items = pos.map((p) => strand({
    p, O, emergeDeg, baseLen, tipDeg0, tipDeg1, tipR0, tipR1, tipTanDelta, tipLen0, tipLen1, curl,
  }));
  const paths = items.map(({ d }, i) => {
    const p = pos[i];
    const w = lerp(wMin, wMax, 1 - Math.abs(p - 0.5) * 2 * 0.4); // mid strands slightly fuller
    const op = lerp(0.45, 0.95, p);
    const isAccent = color === "duo" && i === Math.round(pos.length * 0.5);
    const stroke = isAccent ? INDIGO : ink;
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(isAccent ? 1 : op)}"/>`;
  }).join("\n    ");

  let handleMarkup = "";
  if (handle) {
    // a tiny tangent + indigo dot at the origin = the control point you hold
    const [hx, hy] = dir(emergeDeg);
    handleMarkup = `
    <line x1="${fmt(O[0])}" y1="${fmt(O[1])}" x2="${fmt(O[0] + hx * 9)}" y2="${fmt(O[1] + hy * 9)}" stroke="${INDIGO}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="2.6" fill="${INDIGO}"/>`;
  }
  return `${paths}${handleMarkup}`;
}

const VARIANTS = {
  "A spray — 12 thin, mono + origin dot": fanMark({}),
  "A2 spray — no dot": fanMark({ handle: false }),
  "B narrow blossom — uplift": fanMark({
    n: 13, O: [40, 78], emergeDeg: -85, baseLen: 18,
    tipDeg0: -140, tipDeg1: -42, tipR0: 60, tipR1: 56, curl: -16, wMin: 0.6, wMax: 1.5,
  }),
  "C wide peacock": fanMark({
    n: 14, O: [30, 80], emergeDeg: -72, baseLen: 14,
    tipDeg0: -158, tipDeg1: -8, tipR0: 62, tipR1: 52, tipTanDelta: 12, curl: -6, wMin: 0.6, wMax: 1.6,
  }),
  "D fountain — symmetric-ish, duo": fanMark({
    n: 13, O: [50, 84], emergeDeg: -90, baseLen: 20,
    tipDeg0: -150, tipDeg1: -30, tipR0: 64, tipR1: 64, tipTanDelta: 10, curl: 0,
    grow: false, color: "duo", wMin: 0.7, wMax: 1.5,
  }),
  "E gust — leftward curl spray": fanMark({
    n: 12, O: [44, 76], emergeDeg: -100, baseLen: 16,
    tipDeg0: -176, tipDeg1: -56, tipR0: 56, tipR1: 58, tipTanDelta: 6, curl: -20, wMin: 0.6, wMax: 1.5,
  }),
};

const SIZES = [128, 56, 28];

function tile(inner, bg) {
  const isDark = bg === "dark";
  const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
  ).join("");
  return `<div style="display:flex;gap:18px;align-items:center;padding:18px 22px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}

const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:14px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 8px 2px;">${name}</div>
    <div style="display:flex;gap:14px;">${tile(inner, "dark")}${tile(inner, "light")}</div>
  </div>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;padding:26px;background:#1a1a1f;font-family:ui-sans-serif,system-ui;}</style></head><body>
<div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:18px;">Bezier logo v2 — DIVERGENT (one origin → spreads out)</div>
${blocks}</body></html>`;

writeFileSync(new URL("./index2.html", import.meta.url), html);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./v2-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index2.html +", Object.keys(VARIANTS).length, "svgs");
