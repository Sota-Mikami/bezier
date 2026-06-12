// Bezier logo — OUTLINED nodes (hollow diamond + hollow circle), like the real
// pen tool (image #2). The outline IS the boundary → always crisp. The handle
// line + curve connect to the node edges. Lit-black gradient on everything.

import { writeFileSync } from "node:fs";
const fmt=(n)=>Number(n.toFixed(2));
const U=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;return[dx/L,dy/L];};
function cubicPts(p0,p1,p2,p3,n=18){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
const dPath=(P,s)=>{const h=s/2;return `M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z`;};
const diamondO=(P,s,w)=>`<path d="${dPath(P,s)}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linejoin="round"/>`;
const circleO=(C,r,w)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="none" stroke="url(#g)" stroke-width="${w}"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

// kind: "split" (line from right vertex, curve from bottom) | "collinear"
function make(kind,o={}){
  const w=o.w??13, wN=o.wN??(w*0.92), kR=o.kR??(w+4), aS=o.aS??(w+15), gap=o.gap??2;
  const A=[30,40], K=[83,40], h=aS/2;
  const R=[A[0]+h,A[1]], B=[A[0],A[1]+h];
  // handle line: from just outside the diamond's right vertex to the circle's left edge
  const lineStart=[R[0]+gap, R[1]];
  const lineEnd=[K[0]-kR-gap, K[1]];
  let curveD, cpts;
  if(kind==="collinear"){
    const S=[R[0]+gap,R[1]], c1=[S[0]+16,S[1]], c2=o.c2??[64,64], E=o.E??[56,86];
    curveD=`M${fmt(S[0])} ${fmt(S[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
    cpts=cubicPts(S,c1,c2,E);
  }else{
    const S=[B[0],B[1]+gap], c1=[S[0]+4,S[1]+14], c2=o.c2??[60,68], E=o.E??[58,88];
    curveD=`M${fmt(S[0])} ${fmt(S[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
    cpts=cubicPts(S,c1,c2,E);
  }
  const pts=[...cpts,lineStart,lineEnd,[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=Math.max(w,wN)/2,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {els:[line(lineStart,lineEnd,w),stroke(curveD,w),diamondO(A,aS,wN),circleO(K,kR,wN)],bbox};
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}
const GRAD={light:[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]],dark:[["0","#ffffff"],["1","#cfcfdc"]]};
let UID=0;
function render(f,theme,size){
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const defs=`<defs><linearGradient id="g${UID}" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient></defs>`.replace("id=\"g"+UID+"\"","id=\"g\"");
  // unique gradient id per svg
  const id=`g${UID++}`;
  const defs2=`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="24" y1="16" x2="76" y2="92">${stops}</linearGradient></defs>`;
  const body=f.els.join("").replaceAll('url(#g)',`url(#${id})`);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs2}<g transform="translate(${fmt(f.tx)} ${fmt(f.ty)})">${body}</g></svg>`;
}
function hero(f,theme,px=200){const bg=theme==="dark"?"#0e0e12":"#fff";const sh=theme==="dark"?"none":"0 10px 30px rgba(0,0,0,.2)";return `<div style="width:${px+56}px;height:${px+56}px;border-radius:${Math.round((px+56)*0.23)}px;background:${bg};box-shadow:${sh};display:flex;align-items:center;justify-content:center;">${render(f,theme,px)}</div>`;}
const FAV=[48,32,20,16];
const fav=(f,theme)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:14px;align-items:center;padding:11px 16px;background:${bg};border-radius:13px;">${FAV.map(s=>render(f,theme,s)).join("")}</div>`;};
function block(name,form){const f=centered(form);return `<div style="margin-bottom:18px;"><div style="font:600 13px ui-monospace;color:#cfcfd6;margin:0 0 9px 2px;">${name}</div><div style="display:flex;gap:18px;align-items:center;">${hero(f,"light")}${fav(f,"light")}${hero(f,"dark")}${fav(f,"dark")}</div></div>`;}

writeFileSync(new URL("./index-outline.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — outlined (hollow) nodes · pen-tool style</div>
   ${block("split-origin · W13", make("split",{w:13}))}
   ${block("split-origin · W15", make("split",{w:15,kR:18,aS:30}))}
   ${block("collinear · W13", make("collinear",{w:13}))}
   ${block("collinear · W15", make("collinear",{w:15,kR:18,aS:30}))}</body>`);
console.log("wrote index-outline.html");
