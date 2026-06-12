// Bezier logo — lock the outlined balanced nodes + collinear handle; explore a
// GRACEFUL downward curve (a long sweep to the lower-right, like image #1), not a
// short droop. Rendered large so the curve quality is judgeable.

import { writeFileSync } from "node:fs";
const fmt=(n)=>Number(n.toFixed(2));
function cubicPts(p0,p1,p2,p3,n=22){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
const dPath=(P,s)=>{const h=s/2;return `M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z`;};
const diamondO=(P,s,w)=>`<path d="${dPath(P,s)}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linejoin="round"/>`;
const circleO=(C,r,w)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="none" stroke="url(#g)" stroke-width="${w}"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

const W=13, kR=12.5, aS=2*kR*1.18, gap=2;
const A=[24,34], K=[82,34], h=aS/2;
const Sx=A[0]+h+gap, Sy=A[1];           // curve + handle start (right of diamond)
const lineEnd=[K[0]-kR-gap, K[1]];

function form(curveD, cpts){
  const pts=[...cpts,[Sx,Sy],lineEnd,[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=W/2,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {els:[line([Sx,Sy],lineEnd,W),stroke(curveD,W),diamondO(A,aS,W),circleO(K,kR,W)],bbox,
    tx:0,ty:0,_bbox:bbox};
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}

// collinear (horizontal tangent at S). long graceful sweeps to lower-right.
const CURVES={
  "D1 long S-less sweep": (()=>{const c1=[Sx+20,Sy],c2=[Sx+34,Sy+34],E=[Sx+30,Sy+52];return {d:`M${fmt(Sx)} ${fmt(Sy)} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,p:cubicPts([Sx,Sy],c1,c2,E)};})(),
  "D2 sweep + soft end-curl": (()=>{const c1=[Sx+22,Sy],c2=[Sx+40,Sy+30],E=[Sx+34,Sy+52];return {d:`M${fmt(Sx)} ${fmt(Sy)} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,p:cubicPts([Sx,Sy],c1,c2,E)};})(),
  "D3 deeper, ends lower": (()=>{const c1=[Sx+18,Sy],c2=[Sx+32,Sy+40],E=[Sx+28,Sy+58];return {d:`M${fmt(Sx)} ${fmt(Sy)} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,p:cubicPts([Sx,Sy],c1,c2,E)};})(),
  "D4 ¼-circle to vertical": (()=>{const c1=[Sx+24,Sy],c2=[Sx+33,Sy+20],E=[Sx+33,Sy+52];return {d:`M${fmt(Sx)} ${fmt(Sy)} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`,p:cubicPts([Sx,Sy],c1,c2,E)};})(),
};

const GRAD={light:[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]],dark:[["0","#ffffff"],["1","#cfcfdc"]]};
let UID=0;
function render(f,theme,size){
  const id=`g${UID++}`;
  const stops=GRAD[theme].map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("");
  const defs=`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="22" y1="14" x2="78" y2="92">${stops}</linearGradient></defs>`;
  const body=f.els.join("").replaceAll('url(#g)',`url(#${id})`);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${defs}<g transform="translate(${fmt(f.tx)} ${fmt(f.ty)})">${body}</g></svg>`;
}
function heroLight(f,px=240){return `<div style="width:${px+50}px;height:${px+50}px;border-radius:${Math.round((px+50)*0.23)}px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;">${render(f,"light",px)}</div>`;}
const FAV=[40,24,16];
const fav=(f,theme)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:13px;align-items:center;padding:10px 15px;background:${bg};border-radius:12px;">${FAV.map(s=>render(f,theme,s)).join("")}</div>`;};
const blocks=Object.entries(CURVES).map(([n,c])=>{const f=centered(form(c.d,c.p));return `<div style="margin-bottom:18px;"><div style="font:600 13px ui-monospace;color:#cfcfd6;margin:0 0 9px 2px;">${n}</div><div style="display:flex;gap:18px;align-items:center;">${heroLight(f)}${fav(f,"light")}${render(f,"dark",100)}${fav(f,"dark")}</div></div>`;}).join("");
writeFileSync(new URL("./index-curve.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:16px;">Bezier — graceful downward curve options (collinear · balanced hollow nodes · W13)</div>${blocks}</body>`);
console.log("wrote index-curve.html");
