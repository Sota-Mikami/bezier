// Bezier logo — bolder for app-icon / favicon recognizability. Weight ladder of
// V1 (diamond anchor + handle line + knob + curve, node gaps, lit-black sheen),
// translate-centered (no scale, so stroke weight stays exact), benchmarked at
// favicon sizes against a few simple bold reference marks (chevron/arch/triangle).

import { writeFileSync } from "node:fs";
const fmt = (n) => Number(n.toFixed(2));
const deg = (d) => [Math.cos(d*Math.PI/180), Math.sin(d*Math.PI/180)];

function cubicPts(p0,p1,p2,p3,n=16){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}

const diamond = (P,s)=>{const h=s/2;return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`;};
const knob=(C,r)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

// V1 geometry at a given weight. Returns {strokes,nodes,cuts,bbox}.
function v1(o={}){
  const w=o.w??9, kR=o.kR??(w+3.5), aS=o.aS??(w+12), gap=o.gap??3.5;
  const A=[26,42], K=[80,42];
  const V=[A[0]+aS/2,A[1]];
  const cd=deg(o.cDeg??24);
  const c1=[V[0]+cd[0]*(o.tan1??22),V[1]+cd[1]*(o.tan1??22)];
  const c2=o.c2??[62,66], E=o.E??[56,88];
  // bbox over node extents + curve samples + stroke half-width
  const pts=[...cubicPts(V,c1,c2,E,18),[A[0]-aS/2,A[1]],[A[0]+aS/2,A[1]],[A[0],A[1]-aS/2],[A[0],A[1]+aS/2],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR],[V[0],V[1]]];
  const hw=w/2;
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {
    strokes:[line(V,K,w), stroke(`M${fmt(V[0])} ${fmt(V[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,w)],
    nodes:[diamond(A,aS),knob(K,kR)],
    cuts: gap>0?[{c:A,r:aS*0.5+gap},{c:K,r:kR+gap}]:[],
    bbox,
  };
}
// translate-center the mark into the 100 box (no scale → weight preserved)
function centered(form){
  const [x0,y0,x1,y1]=form.bbox; const cx=(x0+x1)/2, cy=(y0+y1)/2;
  const tx=50-cx, ty=50-cy;
  return {...form, tx, ty};
}

const GRAD={light:[["0","#5e5e6e"],["0.45","#2c2c38"],["1","#070709"]],dark:[["0","#ffffff"],["0.5","#dadae8"],["1","#8d8d9c"]]};
let UID=0;
function build(form,theme,size){
  const id=`m${UID++}`;
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const mask=form.cuts.length?`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/>${form.cuts.map(k=>`<circle cx="${fmt(k.c[0]+form.tx)}" cy="${fmt(k.c[1]+form.ty)}" r="${fmt(k.r)}" fill="black"/>`).join("")}</mask>`:"";
  const g=`<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient>${mask}</defs>`;
  const inner=`<g transform="translate(${fmt(form.tx)} ${fmt(form.ty)})">`;
  const strokes=form.cuts.length?`<g mask="url(#${id})">${form.strokes.join("")}</g>`:form.strokes.join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${g}${inner}${strokes}${form.nodes.join("")}</g></svg>`;
}
function appTile(form,theme,px=132,padFrac=0.18){
  const bg=theme==="dark"?"#0e0e12":"#ffffff";
  const shadow=theme==="dark"?"0 1px 0 #2a2a32":"0 8px 20px rgba(0,0,0,0.18)";
  const pad=Math.round(px*padFrac);
  return `<div style="width:${px}px;height:${px}px;border-radius:${Math.round(px*0.23)}px;background:${bg};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">${build(form,theme,px-pad*2)}</div>`;
}
const FAV=[40,28,20,16];
function favStrip(form,theme,padFrac){const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:13px;align-items:center;padding:10px 15px;background:${bg};border-radius:13px;">${FAV.map(s=>build(form,theme,s)).join("")}</div>`;}

function row(name,form,padFrac=0.06){
  const f=centered(form);
  return `<div style="margin-bottom:15px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 7px 2px;">${name}</div>
   <div style="display:flex;gap:16px;align-items:center;">${appTile(f,"light")}${favStrip(f,"light",padFrac)}${appTile(f,"dark")}${favStrip(f,"dark",padFrac)}</div></div>`;
}

const ROWS=[
  row("W9 (current)",  v1({w:9})),
  row("W11",           v1({w:11,kR:14,aS:23})),
  row("W13",           v1({w:13,kR:15,aS:25})),
  row("W15 (bold)",    v1({w:15,kR:16.5,aS:27,gap:4})),
  row("W13 · no gap",  v1({w:13,kR:15,aS:25,gap:0})),
  row("W16 favicon-opt", v1({w:16,kR:17,aS:28,gap:0,c2:[60,66],E:[54,86]})),
];

// benchmark reference marks (simple bold shapes) at favicon sizes for weight calibration
function bench(){
  const ref=(inner)=>FAV.map(s=>`<svg width="${s}" height="${s}" viewBox="0 0 100 100"><g fill="none" stroke="#111" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`).join("");
  const refs={
    "chevron (≈cmux)":`<path d="M38 26 L66 50 L38 74"/>`,
    "arch (≈Antigravity)":`<path d="M24 74 C24 40 76 40 76 74"/>`,
    "triangle (≈Vercel filled)":`<path d="M50 26 L74 72 L26 72 Z" fill="#111" stroke="none"/>`,
  };
  return Object.entries(refs).map(([n,i])=>`<div style="margin-bottom:8px;"><div style="font:600 11px ui-monospace;color:#76767e;margin:0 0 4px 2px;">${n}</div><div style="display:flex;gap:13px;align-items:center;padding:10px 15px;background:#fff;border-radius:13px;">${ref(i)}</div></div>`).join("");
}

writeFileSync(new URL("./index-bold.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — weight ladder for app-icon + favicon recognizability</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">each row: light app-tile · light favicons 40/28/20/16 · dark app-tile · dark favicons</div>
   ${ROWS.join("")}
   <div style="color:#cfcfd6;font:700 13px ui-sans-serif;margin:22px 0 10px;">Benchmark stroke weights @ favicon (for calibration)</div>
   ${bench()}</body>`);
console.log("wrote index-bold.html");
