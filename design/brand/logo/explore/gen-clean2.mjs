// Bezier logo — make the 3 elements (diamond / line / curve) cleanly separable.
// Two approaches compared, both bold with shape-matched halos:
//   A collinear   — curve leaves the anchor along the handle tangent (overlaps at root)
//   B split-origin — handle from the diamond's RIGHT vertex, curve from its BOTTOM
//                    vertex → three distinct elements, no root overlap.

import { writeFileSync } from "node:fs";
const fmt=(n)=>Number(n.toFixed(2));
function cubicPts(p0,p1,p2,p3,n=18){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
const dPath=(P,s)=>{const h=s/2;return `M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z`;};
const diamond=(P,s)=>`<path d="${dPath(P,s)}" fill="url(#g)"/>`;
const knob=(C,r)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="url(#g)"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

function make(kind,o={}){
  const w=o.w??16, kR=o.kR??(w+1), aS=o.aS??(w+11), gap=o.gap??(w*0.36);
  const A=[30,40], K=[82,40], h=aS/2;
  const R=[A[0]+h,A[1]];            // right vertex
  const B=[A[0],A[1]+h];           // bottom vertex
  let curveD, curveStart;
  if(kind==="A"){                   // collinear: curve from R, tangent horizontal
    curveStart=R;
    const c1=[R[0]+18,R[1]], c2=o.c2??[64,64], E=o.E??[56,88];
    curveD=`M${fmt(R[0])} ${fmt(R[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
  }else{                            // split-origin: curve from bottom vertex
    curveStart=B;
    const c1=[B[0]+6,B[1]+16], c2=o.c2??[62,70], E=o.E??[58,90];
    curveD=`M${fmt(B[0])} ${fmt(B[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
  }
  const cpts=kind==="A"?cubicPts(R,[R[0]+18,R[1]],o.c2??[64,64],o.E??[56,88]):cubicPts(B,[B[0]+6,B[1]+16],o.c2??[62,70],o.E??[58,90]);
  const pts=[...cpts,[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=w/2,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {strokes:[line(R,K,w),stroke(curveD,w)],nodes:[diamond(A,aS),knob(K,kR)],
    halos:{dA:A,dS:aS+2*gap,kA:K,kR:kR+gap},bbox};
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}
const GRAD={light:[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]],dark:[["0","#ffffff"],["1","#cfcfdc"]]};
let UID=0;
function render(f,theme,size){
  const id=`m${UID++}`;
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const H=f.halos;
  const mask=`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/><path d="${dPath([H.dA[0]+f.tx,H.dA[1]+f.ty],H.dS)}" fill="black"/><circle cx="${fmt(H.kA[0]+f.tx)}" cy="${fmt(H.kA[1]+f.ty)}" r="${fmt(H.kR)}" fill="black"/></mask>`;
  const defs=`<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient>${mask}</defs>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}<g transform="translate(${fmt(f.tx)} ${fmt(f.ty)})"><g mask="url(#${id})">${f.strokes.join("")}</g>${f.nodes.join("")}</g></svg>`;
}
function hero(f,theme,px=200){const bg=theme==="dark"?"#0e0e12":"#fff";const sh=theme==="dark"?"none":"0 10px 30px rgba(0,0,0,.2)";return `<div style="width:${px+60}px;height:${px+60}px;border-radius:${Math.round((px+60)*0.23)}px;background:${bg};box-shadow:${sh};display:flex;align-items:center;justify-content:center;">${render(f,theme,px)}</div>`;}
const FAV=[44,28,20,16];
const fav=(f,theme)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:14px;align-items:center;padding:11px 16px;background:${bg};border-radius:13px;">${FAV.map(s=>render(f,theme,s)).join("")}</div>`;};
function block(name,form){const f=centered(form);return `<div style="margin-bottom:18px;"><div style="font:600 13px ui-monospace;color:#cfcfd6;margin:0 0 9px 2px;">${name}</div><div style="display:flex;gap:18px;align-items:center;">${hero(f,"light")}${fav(f,"light")}${hero(f,"dark")}${fav(f,"dark")}</div></div>`;}

writeFileSync(new URL("./index-clean2.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — A collinear vs B split-origin (clean 3 elements)</div>
   ${block("A collinear · W16", make("A",{w:16}))}
   ${block("B split-origin · W16", make("B",{w:16}))}
   ${block("B split-origin · W18", make("B",{w:18,kR:19,aS:30}))}
   ${block("A collinear · W18", make("A",{w:18,kR:19,aS:30}))}</body>`);
console.log("wrote index-clean2.html");
