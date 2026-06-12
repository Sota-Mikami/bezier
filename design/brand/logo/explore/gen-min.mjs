// Bezier logo — minimal: 3–5 deliberate strands. Each curve placed for beauty.
import { writeFileSync } from "node:fs";
const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const fmt = (n) => Number(n.toFixed(2));
function goldenPositions(n, bias) {
  if (n === 1) return [0.5];
  const pos = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); const g = 1 - Math.pow(1 - t, PHI); pos.push(lerp(t, g, bias)); }
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
  const cfg = { n: 4, O: [36, 76], rootDeg: -74, rootLen: 28, spreadDeg: 32,
    tipR0: 60, tipR1: 86, curlDeg: 30, tipHandle: 30, lenBias: 0.62,
    wMin: 1.6, wMax: 2.6, bias: 0.5, dotR: 3.2, handleLen: 8, ...opts };
  const pos = goldenPositions(cfg.n, cfg.bias);
  const paths = pos.map((p) => {
    const d = strand({ ...cfg, p });
    const k = cfg.n === 1 ? 0 : Math.abs(p - 0.5) * 2;
    const w = lerp(cfg.wMax, cfg.wMin, k);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${fmt(w)}" stroke-linecap="round"/>`;
  }).join("\n    ");
  const [hx, hy] = dir(cfg.rootDeg);
  const h = `
    <line x1="${fmt(cfg.O[0])}" y1="${fmt(cfg.O[1])}" x2="${fmt(cfg.O[0] + hx * cfg.handleLen)}" y2="${fmt(cfg.O[1] + hy * cfg.handleLen)}" stroke="${INDIGO}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="${fmt(cfg.O[0])}" cy="${fmt(cfg.O[1])}" r="${cfg.dotR}" fill="${INDIGO}"/>`;
  return `${paths}${h}`;
}
const VARIANTS = {
  "M3 — 3 strands": fanMark({ n: 3, spreadDeg: 30, curlDeg: 30, lenBias: 0.62 }),
  "M3b — 3 strands, wider": fanMark({ n: 3, spreadDeg: 38, curlDeg: 34, lenBias: 0.6 }),
  "M4 — 4 strands": fanMark({ n: 4, spreadDeg: 32, curlDeg: 30, lenBias: 0.64 }),
  "M4b — 4 strands, calm": fanMark({ n: 4, spreadDeg: 27, curlDeg: 24, lenBias: 0.6 }),
  "M5 — 5 strands": fanMark({ n: 5, spreadDeg: 34, curlDeg: 30, lenBias: 0.62, wMax: 2.4, wMin: 1.4 }),
  "M5b — 5 strands, long wing": fanMark({ n: 5, spreadDeg: 32, curlDeg: 34, lenBias: 0.72, tipR1: 90, wMax: 2.4, wMin: 1.4 }),
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
writeFileSync(new URL("./index-min.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — minimal 3–5 strands (128/64/40/24/16px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./min-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-min.html");
