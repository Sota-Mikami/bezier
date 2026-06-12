// Bezier logo — OFFSET strands (per CEO + reference): one graceful base curve
// from the origin dot (lower-left) sweeping up-right & curling; 3–5 strands are
// parallel offsets of it — bunched at the origin, opening slightly toward the
// tips (combed-feather look). Even gaps, same flow. Indigo dot = the origin.

import { writeFileSync } from "node:fs";
const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (n) => Number(n.toFixed(2));

// evaluate a cubic at t, return [point, unitTangent]
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
  const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
  const dx = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0]);
  const dy = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1]);
  const L = Math.hypot(dx, dy) || 1;
  return [[x, y], [dx/L, dy/L]];
}
// sample a base path (array of cubic segments) → [{p,n,t}] with global t in [0,1]
function sampleBase(segs, per = 22) {
  const pts = [];
  segs.forEach((s, si) => {
    for (let j = (si === 0 ? 0 : 1); j <= per; j++) {
      const lt = j / per;
      const [p, tan] = cubic(s[0], s[1], s[2], s[3], lt);
      pts.push({ p, n: [tan[1], -tan[0]] }); // left normal
    }
  });
  pts.forEach((pt, i) => (pt.t = i / (pts.length - 1)));
  return pts;
}
// smooth path through points (Catmull-Rom → bézier)
function smooth(points) {
  if (points.length < 2) return "";
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i], p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0]-p0[0])/6, p1[1] + (p2[1]-p0[1])/6];
    const c2 = [p2[0] - (p3[0]-p1[0])/6, p2[1] - (p3[1]-p1[1])/6];
    d += ` C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

function offsetMark(opts) {
  const cfg = {
    base: [
      [[30, 82], [25, 50], [33, 26], [55, 22]],   // rise from origin, lean to top
      [[55, 22], [73, 18], [85, 33], [78, 54]],   // arc over right & start the curl
    ],
    n: 4, gap: 7.5, originBunch: 0.12, rampPow: 0.85,
    wInner: 1.1, wOuter: 2.6, boldOuter: true, lenTrim: 0.0,
    dotR: 3.2, ...opts,
  };
  const base = sampleBase(cfg.base);
  // φ-spaced offsets so gaps feel natural
  const offs = [];
  for (let i = 0; i < cfg.n; i++) offs.push(i);
  const strands = offs.map((i, idx) => {
    const dist = cfg.gap * i;
    // optional: trim tip length for outer strands → fan opens cleanly
    const lim = 1 - cfg.lenTrim * (i / Math.max(1, cfg.n - 1));
    const pts = base.filter((b) => b.t <= lim).map((b) => {
      const ramp = cfg.originBunch + (1 - cfg.originBunch) * Math.pow(b.t, cfg.rampPow);
      return [b.p[0] + b.n[0] * dist * ramp, b.p[1] + b.n[1] * dist * ramp];
    });
    const tt = idx / Math.max(1, cfg.n - 1);
    const w = cfg.boldOuter ? lerp(cfg.wInner, cfg.wOuter, tt) : lerp(cfg.wOuter, cfg.wInner, tt);
    return `<path d="${smooth(pts)}" fill="none" stroke="${INK}" stroke-width="${fmt(w)}" stroke-linecap="round"/>`;
  }).join("\n    ");
  const O = cfg.base[0][0];
  const dot = `<circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="${cfg.dotR}" fill="${INDIGO}"/>`;
  return `${strands}\n    ${dot}`;
}

const VARIANTS = {
  "O3 — 3 strands": offsetMark({ n: 3, gap: 9 }),
  "O4 — 4 strands": offsetMark({ n: 4, gap: 7.5 }),
  "O5 — 5 strands": offsetMark({ n: 5, gap: 6.5 }),
  "O5w — 5, wider gaps": offsetMark({ n: 5, gap: 8, originBunch: 0.18 }),
  "O5t — 5, tip-trim fan": offsetMark({ n: 5, gap: 7, lenTrim: 0.16 }),
  "O4b — 4, bold inner edge": offsetMark({ n: 4, gap: 8, boldOuter: false, wOuter: 3.0 }),
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
writeFileSync(new URL("./index-offset.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — offset strands, combed (128/64/40/24/16px)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./offset-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-offset.html");
