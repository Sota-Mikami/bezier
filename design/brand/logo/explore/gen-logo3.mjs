// Bezier logo v3 — refined DIVERGENT plume. One origin → strands hug as one root,
// then peel into a silky fan that all curl the same way (feather elegance).
// Golden ratio: angular spacing + the envelope's spiral growth. Aim = beautiful
// as a *form*, premium, legible down to a favicon.

import { writeFileSync } from "node:fs";

const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24";
const INDIGO = "#4750d4";
const PAPER = "#f7f6f3";

const lerp = (a, b, t) => a + (b - a) * t;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const fmt = (n) => Number(n.toFixed(2));

// smooth golden distribution in [0,1]: ease using powers of 1/φ then normalize,
// blended with linear so it's dense-but-not-clumped.
function goldenPositions(n, bias = 0.5) {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const g = 1 - Math.pow(1 - t, PHI); // golden ease-out
    pos.push(lerp(t, g, bias));
  }
  return pos;
}

// A strand that shares a long common root with its siblings, then arcs to a
// fanned tip with a shared curl direction.
function strand({ p, O, rootDeg, rootLen, spreadDeg, tipR0, tipR1, curlDeg, tipHandle }) {
  const [rx, ry] = dir(rootDeg);
  const P1 = [O[0] + rx * rootLen, O[1] + ry * rootLen]; // shared root handle
  // tip direction fans symmetrically around rootDeg by ±spreadDeg
  const tDeg = rootDeg + lerp(-spreadDeg, spreadDeg, p);
  const tR = lerp(tipR0, tipR1, Math.abs(p - 0.5) * 2); // center strands longest
  const T = [O[0] + dir(tDeg)[0] * tR, O[1] + dir(tDeg)[1] * tR];
  // second handle: pull back from tip along (tip dir + curl) → all tips sweep same way
  const [cx, cy] = dir(tDeg + curlDeg);
  const P2 = [T[0] - cx * tipHandle, T[1] - cy * tipHandle];
  return `M${fmt(O[0])} ${fmt(O[1])} C${fmt(P1[0])} ${fmt(P1[1])} ${fmt(P2[0])} ${fmt(P2[1])} ${fmt(T[0])} ${fmt(T[1])}`;
}

function fanMark(opts) {
  const {
    n = 17,
    O = [44, 80],
    rootDeg = -86,        // the shared root points up
    rootLen = 30,         // long → strands hug as one stroke before splitting
    spreadDeg = 46,       // half-angle of the plume
    tipR0 = 70, tipR1 = 78,
    curlDeg = 26,         // shared curl → feather sweep
    tipHandle = 30,
    bias = 0.55,
    wMin = 0.7, wMax = 1.25,
    ink = INK,
    accentIdx = null,     // index of a single bold indigo "drawn" strand
    handle = true,
  } = opts;

  const pos = goldenPositions(n, bias);
  const paths = pos.map((p, i) => {
    const d = strand({ p, O, rootDeg, rootLen, spreadDeg, tipR0, tipR1, curlDeg, tipHandle });
    // inner (root) overlap reads bold; individual strands stay fine. center a touch fuller.
    const w = lerp(wMax, wMin, Math.abs(p - 0.5) * 2);
    const op = lerp(0.55, 0.92, 1 - Math.abs(p - 0.5) * 2 * 0.5);
    const isAccent = accentIdx !== null && i === accentIdx;
    const stroke = isAccent ? INDIGO : ink;
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${fmt(isAccent ? w + 0.6 : w)}" stroke-linecap="round" opacity="${fmt(isAccent ? 1 : op)}"/>`;
  }).join("\n    ");

  let handleMarkup = "";
  if (handle) {
    const [hx, hy] = dir(rootDeg);
    handleMarkup = `
    <line x1="${fmt(O[0])}" y1="${fmt(O[1])}" x2="${fmt(O[0] + hx * 8)}" y2="${fmt(O[1] + hy * 8)}" stroke="${INDIGO}" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="2.4" fill="${INDIGO}"/>`;
  }
  return `${paths}${handleMarkup}`;
}

const VARIANTS = {
  "F plume — 17 silky, gentle curl": fanMark({}),
  "F2 plume — accent strand (the drawn one)": fanMark({ accentIdx: 12 }),
  "G upright fountain — symmetric": fanMark({
    n: 19, O: [50, 82], rootDeg: -90, rootLen: 32, spreadDeg: 40, curlDeg: 0, tipR0: 72, tipR1: 80,
  }),
  "H diagonal blossom — dynamic": fanMark({
    n: 17, O: [34, 80], rootDeg: -72, rootLen: 30, spreadDeg: 52, curlDeg: 30, tipR0: 70, tipR1: 80,
  }),
  "I tighter plume — denser, less spread": fanMark({
    n: 21, O: [46, 82], rootDeg: -88, rootLen: 34, spreadDeg: 34, curlDeg: 20, tipR0: 74, tipR1: 82,
    wMin: 0.55, wMax: 1.1, bias: 0.6,
  }),
  "J windswept — strong one-way curl": fanMark({
    n: 18, O: [40, 78], rootDeg: -82, rootLen: 28, spreadDeg: 44, curlDeg: 40, tipR0: 68, tipR1: 80,
  }),
};

const SIZES = [128, 56, 28, 18];

function tile(inner, bg) {
  const isDark = bg === "dark";
  const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${markup}</svg>`
  ).join("");
  return `<div style="display:flex;gap:16px;align-items:center;padding:18px 22px;background:${tileBg};border-radius:16px;">${svgs}</div>`;
}

const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:14px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#8a8a94;margin:0 0 8px 2px;">${name}</div>
    <div style="display:flex;gap:14px;">${tile(inner, "dark")}${tile(inner, "light")}</div>
  </div>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;padding:26px;background:#1a1a1f;font-family:ui-sans-serif,system-ui;}</style></head><body>
<div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:18px;">Bezier logo v3 — refined divergent plume (sizes 128/56/28/18)</div>
${blocks}</body></html>`;

writeFileSync(new URL("./index3.html", import.meta.url), html);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./v3-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index3.html +", Object.keys(VARIANTS).length, "svgs");
