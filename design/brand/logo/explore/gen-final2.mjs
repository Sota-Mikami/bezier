// Bezier logo — bolder + bigger-in-tile + crisp node boundaries.
// Fixes: less padding (mark fills more); brighter dark-theme gradient so the
// diamond/knob edges stay high-contrast on dark tiles (was fading); clean gap.

import { writeFileSync } from "node:fs";
const fmt = (n) => Number(n.toFixed(2));
const deg = (d) => [Math.cos(d*Math.PI/180), Math.sin(d*Math.PI/180)];
function cubicPts(p0,p1,p2,p3,n=16){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}

const diamond=(P,s)=>{const h=s/2;return `<path d="M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z" fill="url(#g)"/>`;};
const knob=(C,r)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

function v1(o={}){
  const w=o.w??15, kR=o.kR??(w+2), aS=o.aS??(w+12), gap=o.gap??4;
  const A=[26,42], K=[80,42], V=[A[0]+aS/2,A[1]];
  const cd=deg(o.cDeg??24);
  const c1=[V[0]+cd[0]*(o.tan1??22),V[1]+cd[1]*(o.tan1??22)];
  const c2=o.c2??[62,66], E=o.E??[56,88];
  const pts=[...cubicPts(V,c1,c2,E,18),[A[0]-aS/2,A[1]],[A[0]+aS/2,A[1]],[A[0],A[1]-aS/2],[A[0],A[1]+aS/2],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=w/2, xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {strokes:[line(V,K,w),stroke(`M${fmt(V[0])} ${fmt(V[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,w)],
    nodes:[diamond(A,aS),knob(K,kR)],
    cuts:gap>0?[{c:A,r:aS*0.5+gap},{c:K,r:kR+gap}]:[], bbox};
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}

// brighter dark gradient → node edges stay crisp on dark tiles
const GRAD={light:[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]],dark:[["0","#ffffff"],["1","#cfcfdc"]]};
let UID=0;
function build(f,theme,size){
  const id=`m${UID++}`;
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const mask=f.cuts.length?`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/>${f.cuts.map(k=>`<circle cx="${fmt(k.c[0]+f.tx)}" cy="${fmt(k.c[1]+f.ty)}" r="${fmt(k.r)}" fill="black"/>`).join("")}</mask>`:"";
  const defs=`<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient>${mask}</defs>`;
  const strokes=f.cuts.length?`<g mask="url(#${id})">${f.strokes.join("")}</g>`:f.strokes.join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}<g transform="translate(${fmt(f.tx)} ${fmt(f.ty)})">${strokes}${f.nodes.join("")}</g></svg>`;
}
function appTile(f,theme,px=144,padFrac){
  const bg=theme==="dark"?"#0e0e12":"#ffffff";
  const shadow=theme==="dark"?"0 1px 0 #2a2a32":"0 8px 20px rgba(0,0,0,0.18)";
  const pad=Math.round(px*padFrac);
  return `<div style="width:${px}px;height:${px}px;border-radius:${Math.round(px*0.23)}px;background:${bg};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">${build(f,theme,px-pad*2)}</div>`;
}
const FAV=[40,28,20,16];
const favStrip=(f,theme,padFrac)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:13px;align-items:center;padding:10px 15px;background:${bg};border-radius:13px;">${FAV.map(s=>build(f,theme,s)).join("")}</div>`;};

function row(name,form,padFrac){
  const f=centered(form);
  return `<div style="margin-bottom:15px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 7px 2px;">${name} · pad ${Math.round(padFrac*100)}%</div>
   <div style="display:flex;gap:16px;align-items:center;">${appTile(f,"light",144,padFrac)}${favStrip(f,"light",padFrac)}${appTile(f,"dark",144,padFrac)}${favStrip(f,"dark",padFrac)}</div></div>`;
}
const ROWS=[
  row("W15 · big fill",  v1({w:15,kR:17,aS:27}), 0.12),
  row("W16 · big fill",  v1({w:16,kR:18,aS:28}), 0.11),
  row("W17 · big fill",  v1({w:17,kR:19,aS:30}), 0.10),
  row("W16 · no gap",    v1({w:16,kR:18,aS:28,gap:0}), 0.11),
  row("W18 · max bold",  v1({w:18,kR:20,aS:32,gap:5}), 0.09),
];
writeFileSync(new URL("./index-final2.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — bolder, bigger-in-tile, crisp node boundaries</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">light app-tile · light favicons 40/28/20/16 · dark app-tile · dark favicons</div>${ROWS.join("")}</body>`);
console.log("wrote index-final2.html");
