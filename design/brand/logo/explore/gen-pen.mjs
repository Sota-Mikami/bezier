// Bezier logo — abstracted PEN TOOL (per CEO image #1 + spec). Structure:
//  (a) origin anchor (square) on the LEFT  = the repo's start point
//  (b) a bézier curve leaving it toward the LOWER-RIGHT = what the AI draws
//  (c) a thin tangent handle line + round knob = the control you actually hold
// The curve leaves the anchor ALONG the handle's tangent, then bends down.
// Brand mapping: knob + handle = handle-indigo (you) · curve + anchor = ink (agent).

import { writeFileSync } from "node:fs";
const INK = "#1c1c24", INDIGO = "#4750d4", PAPER = "#f7f6f3";
const fmt = (n) => Number(n.toFixed(2));
const U = (a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1]; const L = Math.hypot(dx,dy)||1; return [dx/L, dy/L]; };

// rotated square (diamond) anchor centered at P
function diamond(P, s, color = INK) {
  const h = s / 2;
  return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="${color}"/>`;
}
function squareUp(P, s, color = INK) { // axis-aligned square
  return `<rect x="${fmt(P[0]-s/2)}" y="${fmt(P[1]-s/2)}" width="${s}" height="${s}" rx="1" fill="${color}"/>`;
}
const knobFill = (C, r, color = INDIGO) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="${color}"/>`;
const knobRing = (C, r, color = INDIGO, w = 3) => `<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const line = (a, b, w, color, op = 1) => `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
const curve = (a, c1, c2, e, w, color) => `<path d="M${fmt(a[0])} ${fmt(a[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(e[0])} ${fmt(e[1])}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;

// Build the mark. A=anchor, K=knob; curve leaves A along (K-A) tangent, bends to E.
function pen(opts) {
  const o = {
    A: [24, 38], K: [84, 38],            // anchor left, knob right (handle horizontal)
    knobR: 7, knobFilled: true,
    tan1: 30, c2: [66, 60], E: [58, 86],  // curve: tangent length, 2nd control, end
    anchorS: 11, anchorShape: "diamond",
    wCurve: 6, wHandle: 3, wEqual: false,
    curveColor: INK, handleColor: INDIGO, knobColor: INDIGO, anchorColor: INK,
    endAnchor: false, gradient: false, ...opts,
  };
  const dirAK = U(o.A, o.K);
  const c1 = [o.A[0] + dirAK[0] * o.tan1, o.A[1] + dirAK[1] * o.tan1];
  const wH = o.wEqual ? o.wCurve : o.wHandle;
  const curveStroke = o.gradient ? "url(#g)" : o.curveColor;
  const parts = [
    line(o.A, o.K, wH, o.handleColor),                 // tangent handle line
    curve(o.A, c1, o.c2, o.E, o.wCurve, curveStroke),  // the drawn curve
    o.anchorShape === "diamond" ? diamond(o.A, o.anchorS, o.anchorColor) : squareUp(o.A, o.anchorS, o.anchorColor),
    o.knobFilled ? knobFill(o.K, o.knobR, o.knobColor) : knobRing(o.K, o.knobR, o.knobColor, wH),
  ];
  if (o.endAnchor) parts.push(o.anchorShape === "diamond" ? diamond(o.E, o.anchorS * 0.8, o.anchorColor) : squareUp(o.E, o.anchorS * 0.8, o.anchorColor));
  const defs = o.gradient
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${INK}"/><stop offset="1" stop-color="${INDIGO}"/></linearGradient></defs>`
    : "";
  return defs + "\n    " + parts.join("\n    ");
}

const VARIANTS = {
  "A faithful (image #1) · indigo knob": pen({}),
  "B mono (all ink)": pen({ handleColor: INK, knobColor: INK }),
  "C equal weight": pen({ wEqual: true, knobR: 6 }),
  "D knob = ring": pen({ knobFilled: false }),
  "E deeper plunge": pen({ c2: [64, 70], E: [56, 92], tan1: 26 }),
  "F handle angled up": pen({ K: [82, 26], tan1: 28, c2: [66, 62], E: [60, 88] }),
  "G end anchor (full pen)": pen({ endAnchor: true, E: [62, 84], c2: [66, 64] }),
  "H gradient curve (ink→indigo)": pen({ gradient: true, knobColor: INDIGO }),
  "I axis square anchor": pen({ anchorShape: "square", anchorS: 10 }),
  "J minimal / favicon": pen({ A: [26, 40], K: [82, 40], knobR: 9, anchorS: 14, wCurve: 8, wHandle: 5, tan1: 24, c2: [62, 62], E: [54, 88] }),
  "K short & bold": pen({ A: [22, 36], K: [80, 36], knobR: 8, anchorS: 12, wCurve: 7, wHandle: 4, tan1: 30, c2: [64, 58], E: [60, 84] }),
  "L curve hugs handle then drops": pen({ tan1: 44, c2: [70, 52], E: [64, 88] }),
};

const SIZES = [104, 56, 32, 20, 16];
function tile(inner, bg) {
  const isDark = bg === "dark"; const tileBg = isDark ? "#0e0e12" : PAPER;
  const markup = isDark ? inner.replaceAll(INK, "#e9e8ef") : inner;
  const svgs = SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100">${markup}</svg>`).join("");
  return `<div style="display:flex;gap:14px;align-items:center;padding:14px 18px;background:${tileBg};border-radius:14px;">${svgs}</div>`;
}
const blocks = Object.entries(VARIANTS).map(([name, inner]) => `
  <div style="margin-bottom:11px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 5px 2px;">${name}</div>
  <div style="display:flex;gap:12px;">${tile(inner, "dark")}${tile(inner, "light")}</div></div>`).join("");
writeFileSync(new URL("./index-pen.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px;background:#1a1a1f;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — abstracted pen-tool logo (104/56/32/20/16px · dark | light)</div>${blocks}</body>`);
for (const [name, inner] of Object.entries(VARIANTS)) {
  const id = name.split(" ")[0].toLowerCase();
  writeFileSync(new URL(`./pen-${id}.svg`, import.meta.url),
    `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">\n    ${inner}\n</svg>\n`);
}
console.log("wrote index-pen.html +", Object.keys(VARIANTS).length, "svgs");
