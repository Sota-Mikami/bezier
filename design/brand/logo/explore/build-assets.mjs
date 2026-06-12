// Bezier logo — FINAL asset builder. Locks variant H (diagonal divergent
// blossom) and emits the official SVG set + an in-context presentation sheet.
// One origin (indigo handle you hold) → a silky φ-spaced fan blossoms up-right.

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

// ---- locked params ---------------------------------------------------------
const FULL = {
  n: 20, O: [32, 79], rootDeg: -70, rootLen: 30, spreadDeg: 48,
  tipR0: 62, tipR1: 86, curlDeg: 30, tipHandle: 30, lenBias: 0.64,
  wMin: 0.6, wMax: 1.28, bias: 0.55, dotR: 2.4, handleLen: 8,
};
const SMALL = {
  n: 6, O: [30, 76], rootDeg: -68, rootLen: 25, spreadDeg: 42,
  tipR0: 60, tipR1: 82, curlDeg: 26, tipHandle: 28, lenBias: 0.5,
  wMin: 2.2, wMax: 3.6, bias: 0.42, dotR: 3.6, handleLen: 7,
};

function strands(cfg, color) {
  const pos = goldenPositions(cfg.n, cfg.bias);
  return pos.map((p) => {
    const d = strand({ ...cfg, p });
    const w = lerp(cfg.wMax, cfg.wMin, Math.abs(p - 0.5) * 2);
    const op = lerp(0.62, 0.92, 1 - Math.abs(p - 0.5) * 2 * 0.4);
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${fmt(op)}"/>`;
  }).join("\n  ");
}

function handle(cfg, withIndigo = true) {
  const [hx, hy] = dir(cfg.rootDeg);
  const c = withIndigo ? INDIGO : INK;
  return `<line x1="${fmt(cfg.O[0])}" y1="${fmt(cfg.O[1])}" x2="${fmt(cfg.O[0] + hx * cfg.handleLen)}" y2="${fmt(cfg.O[1] + hy * cfg.handleLen)}" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="${fmt(cfg.O[0])}" cy="${fmt(cfg.O[1])}" r="${cfg.dotR}" fill="${c}"/>`;
}

function svg(inner, size = 100) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n  ${inner}\n</svg>\n`;
}

// ---- emit official SVGs ----------------------------------------------------
const out = (name, content) => writeFileSync(new URL(`../${name}`, import.meta.url), content);

// mark.svg — ink fan + indigo handle (primary, light surfaces)
out("mark.svg", svg(`${strands(FULL, INK)}\n  ${handle(FULL, true)}`));
// mark-mono.svg — single ink color, handle in ink too (monochrome contexts)
out("mark-mono.svg", svg(`${strands(FULL, INK)}\n  ${handle(FULL, false)}`));
// mark-favicon.svg — small simplified, holds at <=20px
out("mark-favicon.svg", svg(`${strands(SMALL, INK)}\n  ${handle(SMALL, true)}`));

// wordmark.svg — mark + "Bezier"
const wordmark = `<svg width="220" height="64" viewBox="0 0 220 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">
  <g transform="translate(2 2) scale(0.6)">
    ${strands(FULL, INK)}
    ${handle(FULL, true)}
  </g>
  <text x="74" y="41" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif" font-size="30" font-weight="650" letter-spacing="-0.01em" fill="${INK}">Bezier</text>
</svg>\n`;
out("wordmark.svg", wordmark);

// icon-app.svg — mark on a rounded dark tile (app icon / favicon tile)
const tileMark = strands(FULL, "#e9e8ef") + "\n    " + handle(FULL, true);
const iconApp = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">
  <rect width="1024" height="1024" rx="228" fill="#0e0e12"/>
  <g transform="translate(160 150) scale(7.04)">
    ${tileMark}
  </g>
</svg>\n`;
out("icon-app.svg", iconApp);

// ---- React component (theme-aware: strands=currentColor, handle=--primary) --
function strandsJSX(cfg) {
  const pos = goldenPositions(cfg.n, cfg.bias);
  return pos.map((p) => {
    const d = strand({ ...cfg, p });
    const w = lerp(cfg.wMax, cfg.wMin, Math.abs(p - 0.5) * 2);
    const op = lerp(0.62, 0.92, 1 - Math.abs(p - 0.5) * 2 * 0.4);
    return `      <path d="${d}" stroke="currentColor" strokeWidth={${fmt(w)}} strokeLinecap="round" opacity={${fmt(op)}} />`;
  }).join("\n");
}
function handleJSX(cfg) {
  const [hx, hy] = dir(cfg.rootDeg);
  return `      <line x1={${fmt(cfg.O[0])}} y1={${fmt(cfg.O[1])}} x2={${fmt(cfg.O[0] + hx * cfg.handleLen)}} y2={${fmt(cfg.O[1] + hy * cfg.handleLen)}} stroke="var(--primary)" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={${fmt(cfg.O[0])}} cy={${fmt(cfg.O[1])}} r={${fmt(cfg.dotR)}} fill="var(--primary)" />`;
}
const component = `// The Bezier mark — a φ-spaced fan of bézier curves diverging from ONE origin
// (one repo → many ideas). Strands = currentColor (the agent's drawn curves);
// the origin control-point + handle = --primary ("the handle you hold").
// Generated by design/brand/logo/explore/build-assets.mjs — edit there, not here.

export function BezierMark({
  className,
  title = "Bezier",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" fill="none" role="img" aria-label={title} className={className}>
${strandsJSX(FULL)}
${handleJSX(FULL)}
    </svg>
  );
}
`;
writeFileSync(new URL("../../../../site/src/components/bezier-mark.tsx", import.meta.url), component);
writeFileSync(new URL("../../../../app/src/components/bezier-mark.tsx", import.meta.url), component);

// ---- presentation sheet ----------------------------------------------------
const darkTile = (inner, s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${inner.replaceAll(INK, "#e9e8ef")}</svg>`;
const lightTile = (inner, s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${inner}</svg>`;

const fullInner = `${strands(FULL, INK)}\n${handle(FULL, true)}`;
const smallInner = `${strands(SMALL, INK)}\n${handle(SMALL, true)}`;

const sheet = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:40px;background:#15151a;font-family:ui-sans-serif,system-ui;color:#cfcfd6;}
  h2{font-size:13px;color:#8a8a94;font-weight:600;margin:28px 0 10px;}
  .row{display:flex;gap:18px;align-items:center;flex-wrap:wrap;}
  .card{background:#0e0e12;border-radius:18px;padding:22px 26px;display:flex;gap:18px;align-items:center;}
  .light{background:${PAPER};}
  .appicon{width:120px;height:120px;border-radius:27px;background:#0e0e12;display:flex;align-items:center;justify-content:center;}
  .hdr{display:flex;align-items:center;gap:12px;background:#0e0e12;border:1px solid #23232b;border-radius:12px;padding:12px 18px;}
  .hdr.l{background:#fff;border-color:#e7e6e2;}
  .word{font:650 22px/1 ui-sans-serif;letter-spacing:-0.01em;}
</style></head><body>
<div style="font:700 18px ui-sans-serif;color:#eee;">Bezier — final mark (variant H · 1点から発散 · φ-spaced)</div>

<h2>MARK — dark / light, 112·64·40·24·16px</h2>
<div class="row">
  <div class="card">${[112,64,40,24,16].map(s=>darkTile(fullInner,s)).join("")}</div>
  <div class="card light">${[112,64,40,24,16].map(s=>lightTile(fullInner,s)).join("")}</div>
</div>

<h2>SMALL MARK (favicon) — 40·24·16px, holds tiny</h2>
<div class="row">
  <div class="card">${[40,24,16].map(s=>darkTile(smallInner,s)).join("")}</div>
  <div class="card light">${[40,24,16].map(s=>lightTile(smallInner,s)).join("")}</div>
</div>

<h2>APP ICON</h2>
<div class="row">
  <div class="appicon">${darkTile(fullInner,82)}</div>
  <div class="appicon" style="width:64px;height:64px;border-radius:15px;">${darkTile(fullInner,44)}</div>
  <div class="appicon" style="width:40px;height:40px;border-radius:10px;">${darkTile(smallInner,28)}</div>
</div>

<h2>HEADER LOCKUP</h2>
<div class="row">
  <div class="hdr l"><svg width="30" height="30" viewBox="0 0 100 100">${fullInner}</svg><span class="word" style="color:${INK}">Bezier</span></div>
  <div class="hdr"><svg width="30" height="30" viewBox="0 0 100 100">${fullInner.replaceAll(INK,"#e9e8ef")}</svg><span class="word" style="color:#e9e8ef">Bezier</span></div>
</div>
</body></html>`;
writeFileSync(new URL("./index-sheet.html", import.meta.url), sheet);
console.log("emitted mark.svg / mark-mono.svg / mark-favicon.svg / wordmark.svg / icon-app.svg + index-sheet.html");
