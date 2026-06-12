// Bezier logo — refine F5. (1) anchor/knob visibility: a small GAP (knockout) is
// cut around each node so the connecting line doesn't merge into it — it still
// points at the node so it reads "connected", but the node stays crisp. Done with
// an SVG mask → transparent gap, background-independent. (2) richer 3-stop sheen.

import { writeFileSync } from "node:fs";
const fmt = (n) => Number(n.toFixed(2));
const deg = (d) => [Math.cos(d*Math.PI/180), Math.sin(d*Math.PI/180)];

const diamond = (P, s) => { const h=s/2; return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`; };
const squareR = (P, s) => `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="2" fill="url(#g)"/>`;
const knob = (C, r) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const knobRing = (C, r, w) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="none" stroke="url(#g)" stroke-width="${w}"/>`;
const line = (a, b, w) => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

// returns { strokes, nodes, cuts } so the strokes can be masked around nodes
function f5(o = {}) {
  const A = o.A ?? [26, 42], aS = o.aS ?? 20;
  const K = o.K ?? [80, 42];
  const w = o.w ?? 9, kR = o.kR ?? 11;
  const V = [A[0] + aS/2, A[1]];                  // diamond right vertex = attach point
  const cd = deg(o.cDeg ?? 24);
  const c1 = [V[0] + cd[0]*(o.tan1??22), V[1] + cd[1]*(o.tan1??22)];
  const E = o.E ?? [56, 88], c2 = o.c2 ?? [62, 66];
  const gap = o.gap ?? 3.5;
  const anchorNode = o.anchor === "square" ? squareR(A, aS*0.86) : diamond(A, aS);
  const knobNode = o.knob === "ring" ? knobRing(K, kR, o.aw ?? 4.5) : knob(K, kR);
  return {
    strokes: [
      line(V, K, w),
      stroke(`M${fmt(V[0])} ${fmt(V[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`, w),
    ],
    nodes: [anchorNode, knobNode],
    cuts: o.gap === 0 ? [] : [
      { c: A, r: aS*0.5 + gap },                  // clear strokes around the diamond
      { c: K, r: kR + gap },                       // clear strokes around the knob
    ],
  };
}

const GRADS = {
  G2: { light: [["0","#52525f"],["0.5","#24242e"],["1","#0a0a0f"]], dark: [["0","#ffffff"],["0.5","#cdcdda"],["1","#9a9aa8"]] },
  G3: { light: [["0","#5e5e6e"],["0.45","#2c2c38"],["1","#070709"]], dark: [["0","#ffffff"],["0.5","#dadae8"],["1","#8d8d9c"]] },
};
let UID = 0;
function defs(theme, grad, cuts) {
  const id = `m${UID++}`;
  const stops = GRADS[grad][theme].map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  const mask = cuts.length
    ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
         <rect width="100" height="100" fill="white"/>
         ${cuts.map((k) => `<circle cx="${fmt(k.c[0])}" cy="${fmt(k.c[1])}" r="${fmt(k.r)}" fill="black"/>`).join("")}
       </mask>`
    : "";
  return { defs: `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient>${mask}</defs>`, maskId: cuts.length ? id : null };
}
function mark(form, theme, grad, size) {
  const { defs: d, maskId } = defs(theme, grad, form.cuts);
  const strokes = maskId ? `<g mask="url(#${maskId})">${form.strokes.join("")}</g>` : form.strokes.join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${d}${strokes}${form.nodes.join("")}</svg>`;
}
function appTile(form, theme, grad, px = 132) {
  const bg = theme === "dark" ? "#0e0e12" : "#ffffff";
  const shadow = theme === "dark" ? "0 1px 0 #2a2a32" : "0 8px 20px rgba(0,0,0,0.18)";
  const pad = Math.round(px*0.17);
  return `<div style="width:${px}px;height:${px}px;border-radius:${Math.round(px*0.23)}px;background:${bg};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">${mark(form, theme, grad, px-pad*2)}</div>`;
}
const SMALL = [44, 28, 18];
function rowEl(name, form, grad) {
  const ls = SMALL.map((s) => mark(form, "light", grad, s)).join("");
  const ds = SMALL.map((s) => mark(form, "dark", grad, s)).join("");
  return `<div style="margin-bottom:16px;">
    <div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 7px 2px;">${name}</div>
    <div style="display:flex;gap:18px;align-items:center;">
      ${appTile(form,"light",grad)}
      <div style="display:flex;gap:14px;align-items:center;padding:10px 16px;background:#fff;border-radius:14px;">${ls}</div>
      ${appTile(form,"dark",grad)}
      <div style="display:flex;gap:14px;align-items:center;padding:10px 16px;background:#0e0e12;border-radius:14px;">${ds}</div>
    </div></div>`;
}

const VARIANTS = [
  ["V1 gap 3.5 · G3 (glossy)",        f5({ gap: 3.5 }), "G3"],
  ["V2 gap 3.5 · G2",                 f5({ gap: 3.5 }), "G2"],
  ["V3 gap 2.5 (tighter)· G3",        f5({ gap: 2.5 }), "G3"],
  ["V4 gap 4.5 (airier) · G3",        f5({ gap: 4.5 }), "G3"],
  ["V5 square anchor · gap · G3",     f5({ gap: 3.5, anchor: "square" }), "G3"],
  ["V6 ring knob · gap · G3",         f5({ gap: 3.5, knob: "ring", aw: 5 }), "G3"],
  ["V7 NO gap (compare) · G3",        f5({ gap: 0 }), "G3"],
];
const blocks = VARIANTS.map(([n, f, g]) => rowEl(n, f, g)).join("");
writeFileSync(new URL("./index-f5.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — F5 refined · node gap (knockout) + richer sheen</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">each row: white app-tile · favicons 44/28/18 · dark app-tile · dark favicons</div>${blocks}</body>`);
console.log("wrote index-f5.html +", VARIANTS.length, "variants");
