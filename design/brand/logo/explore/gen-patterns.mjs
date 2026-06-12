// Bezier logo — broad PATTERN exploration. All share the thesis (one origin →
// curves spread out, "hold the handle"), are built from bézier curves, use a
// gentle ~quarter-circle sweep (lower-left → upper-right, light curl), and are
// tested down to favicon size. Rendered as a labeled list to choose from.

import { writeFileSync } from "node:fs";
const PHI = (1 + Math.sqrt(5)) / 2;
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;
const fmt = (n) => Number(n.toFixed(2));
const dir = (deg) => [Math.cos(rad(deg)), Math.sin(rad(deg))];

// cubic-bézier approximation of a circular arc (center O, radius r, a0→a1 deg)
function arcBezier(O, r, a0, a1) {
  const A0 = rad(a0), A1 = rad(a1);
  const k = (4 / 3) * Math.tan((A1 - A0) / 4);
  const p0 = [O[0] + r * Math.cos(A0), O[1] + r * Math.sin(A0)];
  const p3 = [O[0] + r * Math.cos(A1), O[1] + r * Math.sin(A1)];
  const p1 = [p0[0] - k * r * Math.sin(A0), p0[1] + k * r * Math.cos(A0)];
  const p2 = [p3[0] + k * r * Math.sin(A1), p3[1] - k * r * Math.cos(A1)];
  return { d: `M${fmt(p0[0])} ${fmt(p0[1])} C${fmt(p1[0])} ${fmt(p1[1])} ${fmt(p2[0])} ${fmt(p2[1])} ${fmt(p3[0])} ${fmt(p3[1])}`, p0, p3 };
}
const path = (d, w, color = INK, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(w)}" stroke-linecap="round" opacity="${op}"/>`;
const dot = (O, r = 3, c = INDIGO) => `<circle cx="${fmt(O[0])}" cy="${fmt(O[1])}" r="${r}" fill="${c}"/>`;
const sq = (P, s = 4, c = INK) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="0.8" fill="${c}"/>`;

// ---- patterns (each returns inner SVG) -------------------------------------

// P1 — gentle quarter-arc spread: concentric quarter arcs from a corner dot,
// few + gentle, even gaps, bold outer edge.
function p1() {
  const O = [30, 78];
  const radii = [22, 38, 54, 70];
  const s = radii.map((r, i) =>
    arcBezier(O, r, -86, -8) // ~78°, gentle
  ).map((a, i) => path(a.d, lerp(1.4, 2.8, i / 3), INK)).join("\n    ");
  return `${s}\n    ${dot(O, 3.2)}`;
}

// P2 — quarter-arc spread, 3 strands (favicon-minimal)
function p2() {
  const O = [32, 76];
  const radii = [26, 48, 70];
  const s = radii.map((r, i) => path(arcBezier(O, r, -88, -6).d, lerp(2.0, 3.0, i / 2), INK)).join("\n    ");
  return `${s}\n    ${dot(O, 3.4)}`;
}

// P3 — diverging gentle fan: strands share origin, each a gentle arc, fanned
function p3() {
  const O = [34, 76];
  const n = 4;
  const s = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const r = lerp(58, 70, t);
    const a0 = -92 + t * 16, a1 = -20 + t * 26;
    return path(arcBezier(O, r, a0, a1).d, lerp(2.6, 1.4, t), INK);
  }).join("\n    ");
  return `${s}\n    ${dot(O, 3.2)}`;
}

// P4 — pen handle + single curve (refined original grammar)
function p4() {
  const a = arcBezier([28, 74], 58, -86, -16);
  const handleA = a.p0, handleB = a.p3;
  // tangent handles at the ends
  const t0 = [handleA[0] + 14, handleA[1] - 2];
  const t1 = [handleB[0] - 12, handleB[1] + 8];
  return [
    path(a.d, 3.2, INK),
    `<line x1="${fmt(handleA[0])}" y1="${fmt(handleA[1])}" x2="${fmt(t0[0])}" y2="${fmt(t0[1])}" stroke="${INDIGO}" stroke-width="1.6" stroke-linecap="round"/>`,
    `<line x1="${fmt(handleB[0])}" y1="${fmt(handleB[1])}" x2="${fmt(t1[0])}" y2="${fmt(t1[1])}" stroke="${INDIGO}" stroke-width="1.6" stroke-linecap="round"/>`,
    sq(handleA, 5), sq(handleB, 5),
    dot(t0, 2.4), dot(t1, 2.4),
  ].join("\n    ");
}

// P5 — open leaf: two gentle arcs from origin to a shared tip
function p5() {
  const O = [30, 78], T = [76, 34];
  // outer arc bulging up-left, inner arc bulging down-right → a leaf
  const outer = `M${O[0]} ${O[1]} C 30 44 48 30 ${T[0]} ${T[1]}`;
  const inner = `M${O[0]} ${O[1]} C 48 70 62 56 ${T[0]} ${T[1]}`;
  return [path(outer, 2.6, INK), path(inner, 2.0, INK), dot(O, 3.2), sq(T, 4.5)].join("\n    ");
}

// P6 — sheaf: near-straight gentle bézier strokes fanning up-right, even gaps
function p6() {
  const O = [34, 80], n = 4;
  const s = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const ang = -78 + t * 40;             // fan from steep-up to up-right
    const len = lerp(58, 50, Math.abs(t - 0.5) * 2);
    const T = [O[0] + dir(ang)[0] * len, O[1] + dir(ang)[1] * len];
    const c1 = [O[0] + dir(ang)[0] * len * 0.5 - 4, O[1] + dir(ang)[1] * len * 0.5];
    const c2 = [T[0] - 6, T[1] + 4];
    return path(`M${O[0]} ${O[1]} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(T[0])} ${fmt(T[1])}`, 2.4, INK);
  }).join("\n    ");
  return `${s}\n    ${dot(O, 3.4)}`;
}

// P7 — golden spiral quarter stroke + handle dot
function p7() {
  // approximate a quarter of a golden spiral with one cubic
  const O = [30, 76];
  const d = `M30 76 C 30 46 44 26 74 30`;
  const d2 = `M38 78 C 42 54 54 40 76 44`;
  return [path(d, 3.0, INK), path(d2, 1.8, INK, 0.8), dot(O, 3.2)].join("\n    ");
}

// P8 — comet: one bold arc (the drawn answer) + fine ghosts behind (explorations)
function p8() {
  const O = [30, 78];
  const ghosts = [62, 52].map((r, i) => path(arcBezier([34, 80], r, -82, -14).d, 1.2, INK, 0.5));
  const bold = path(arcBezier(O, 70, -86, -8).d, 3.4, INK);
  return [...ghosts, bold, dot(O, 3.4)].join("\n    ");
}

// P9 — bracket fan: gentle arcs with small square control marks at the tips
function p9() {
  const O = [32, 76];
  const arcs = [30, 50, 70].map((r) => arcBezier(O, r, -88, -10));
  const s = arcs.map((a, i) => path(a.d, lerp(1.6, 2.4, i / 2), INK)).join("\n    ");
  const marks = arcs.map((a) => sq(a.p3, 3.4)).join("\n    ");
  return `${s}\n    ${marks}\n    ${dot(O, 3)}`;
}

// P10 — crescent: two offset gentle arcs forming a thin crescent + dot
function p10() {
  const O = [30, 78];
  const a = arcBezier(O, 64, -88, -6);
  const b = arcBezier([36, 82], 52, -84, -12);
  return [path(a.d, 3.2, INK), path(b.d, 2.0, INK, 0.85), dot(O, 3.4)].join("\n    ");
}

// P11 — duo: gentle 3-arc spread with one indigo "drawn" arc
function p11() {
  const O = [32, 76];
  const radii = [30, 50, 70];
  const s = radii.map((r, i) =>
    path(arcBezier(O, r, -88, -8).d, lerp(1.8, 2.8, i / 2), i === 2 ? INDIGO : INK)
  ).join("\n    ");
  return `${s}\n    ${dot(O, 3.2)}`;
}

// P12 — wide gentle quarter-arc, 5 fine, bold leading edge (closest to reference, gentle)
function p12() {
  const O = [28, 80];
  const radii = [18, 32, 46, 60, 74];
  const s = radii.map((r, i) => path(arcBezier(O, r, -90, -4).d, lerp(1.0, 3.0, i / 4), INK)).join("\n    ");
  return `${s}\n    ${dot(O, 3.2)}`;
}

const PATTERNS = {
  "P1 quarter-arc spread · 4": p1(),
  "P2 quarter-arc · 3 (minimal)": p2(),
  "P3 diverging gentle fan · 4": p3(),
  "P4 pen handle + curve": p4(),
  "P5 open leaf": p5(),
  "P6 sheaf · 4 strokes": p6(),
  "P7 golden spiral stroke": p7(),
  "P8 comet (answer + ghosts)": p8(),
  "P9 bracket fan (control marks)": p9(),
  "P10 crescent": p10(),
  "P11 duo (indigo drawn arc)": p11(),
  "P12 wide gentle fan · 5": p12(),
};

const SIZES = [96, 48, 32, 20, 16];
function tile(inner, bg) {
  const isDark = bg === "dark"; const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${markup}</svg>`).join("");
  return `<div style="display:flex;gap:14px;align-items:center;padding:14px 18px;background:${tileBg};border-radius:14px;">${svgs}</div>`;
}
const blocks = Object.entries(PATTERNS).map(([name, inner]) => `
  <div style="margin-bottom:11px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 5px 2px;">${name}</div>
  <div style="display:flex;gap:12px;">${tile(inner, "dark")}${tile(inner, "light")}</div></div>`).join("");
writeFileSync(new URL("./index-patterns.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — logo patterns (96/48/32/20/16px · dark | light)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(PATTERNS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./pat-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-patterns.html +", Object.keys(PATTERNS).length, "svgs");
