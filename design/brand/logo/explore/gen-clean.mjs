// Bezier logo — clean boundaries between the 3 elements (diamond / knob / line+curve).
// Calculated fixes:
//  • the curve leaves the anchor COLLINEAR with the handle (tangent = handle dir),
//    so there's no thick "branch blob" at the root; it hugs, then drops (image #1).
//  • the knockout HALO matches each node's shape (diamond halo for the square,
//    circular halo for the knob) → a uniform, even gap around each node.
//  • gap scaled to stroke weight so every boundary reads at size.

import { writeFileSync } from "node:fs";
const fmt = (n) => Number(n.toFixed(2));
function cubicPts(p0,p1,p2,p3,n=18){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}

const diamondPath=(P,s)=>{const h=s/2;return `M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z`;};
const diamond=(P,s)=>`<path d="${diamondPath(P,s)}" fill="url(#g)"/>`;
const knob=(C,r)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

function build(o={}){
  const w=o.w??16, kR=o.kR??(w+1), aS=o.aS??(w+11), gap=o.gap??(w*0.34);
  const A=[30,40], K=[82,40], h=aS/2;
  const V=[A[0]+h,A[1]];                                   // diamond right vertex = root
  // curve: tangent at V is HORIZONTAL (collinear w/ handle) → hug, then drop
  const c1=[V[0]+(o.hug??18),V[1]];
  const c2=o.c2??[64,64], E=o.E??[56,88];
  const curveD=`M${fmt(V[0])} ${fmt(V[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
  // bbox
  const pts=[...cubicPts(V,c1,c2,E),[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=w/2,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {
    strokes:[line(V,K,w), stroke(curveD,w)],
    nodes:[diamond(A,aS), knob(K,kR)],
    // shape-matched halos: diamond halo (size aS+2gap) for the square, circle for the knob
    halos:{diamondAt:A, diamondSize:aS+2*gap, knobAt:K, knobR:kR+gap},
    bbox,
  };
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}

const GRAD={light:[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]],dark:[["0","#ffffff"],["1","#cfcfdc"]]};
let UID=0;
function render(f,theme,size){
  const id=`m${UID++}`;
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const H=f.halos;
  const mask=`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
    <rect width="100" height="100" fill="white"/>
    <path d="${diamondPath([H.diamondAt[0]+f.tx,H.diamondAt[1]+f.ty],H.diamondSize)}" fill="black"/>
    <circle cx="${fmt(H.knobAt[0]+f.tx)}" cy="${fmt(H.knobAt[1]+f.ty)}" r="${fmt(H.knobR)}" fill="black"/>
  </mask>`;
  const defs=`<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient>${mask}</defs>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}<g transform="translate(${fmt(f.tx)} ${fmt(f.ty)})"><g mask="url(#${id})">${f.strokes.join("")}</g>${f.nodes.join("")}</g></svg>`;
}
function appTile(f,theme,px=150,padFrac=0.11){const bg=theme==="dark"?"#0e0e12":"#fff";const sh=theme==="dark"?"0 1px 0 #2a2a32":"0 8px 20px rgba(0,0,0,0.18)";const pad=Math.round(px*padFrac);return `<div style="width:${px}px;height:${px}px;border-radius:${Math.round(px*0.23)}px;background:${bg};box-shadow:${sh};display:flex;align-items:center;justify-content:center;">${render(f,theme,px-pad*2)}</div>`;}
const FAV=[44,28,20,16];
const favStrip=(f,theme)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:14px;align-items:center;padding:11px 16px;background:${bg};border-radius:13px;">${FAV.map(s=>render(f,theme,s)).join("")}</div>`;};
function row(name,form){const f=centered(form);return `<div style="margin-bottom:16px;"><div style="font:600 12px/1.4 ui-monospace,monospace;color:#9a9aa4;margin:0 0 7px 2px;">${name}</div><div style="display:flex;gap:16px;align-items:center;">${appTile(f,"light")}${favStrip(f,"light")}${appTile(f,"dark")}${favStrip(f,"dark")}</div></div>`;}

const ROWS=[
  row("W16 · gap auto(5.4)",   build({w:16})),
  row("W16 · gap 4",           build({w:16,gap:4})),
  row("W16 · gap 6 (airier)",  build({w:16,gap:6})),
  row("W18 · gap auto",        build({w:18,kR:19,aS:30})),
  row("W14 · gap auto",        build({w:14,kR:15,aS:25})),
];
// big single hero of the leading candidate for close inspection
const heroF=centered(build({w:16}));
const hero=`<div style="margin:18px 0 8px;color:#cfcfd6;font:700 13px ui-sans-serif;">Close-up · W16 gap auto</div>
 <div style="display:flex;gap:20px;"><div style="width:280px;height:280px;border-radius:64px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;">${render(heroF,"light",210)}</div>
 <div style="width:280px;height:280px;border-radius:64px;background:#0e0e12;display:flex;align-items:center;justify-content:center;">${render(heroF,"dark",210)}</div></div>`;

writeFileSync(new URL("./index-clean.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — clean boundaries (collinear curve root · shape-matched halos)</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">light app-tile · favicons 44/28/20/16 · dark app-tile · dark favicons</div>${ROWS.join("")}${hero}</body>`);
console.log("wrote index-clean.html");
