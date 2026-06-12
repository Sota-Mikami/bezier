// Bezier logo — outlined nodes, COLLINEAR curve, refined. Fixes:
//  • node sizes balanced so the hollow diamond and hollow circle read the SAME
//    visual size (a diamond looks smaller per bounding-box, so it's set larger).
//  • the downward bézier curve redrawn as a clean horizontal→down sweep; several
//    shapes to choose from.  Uniform stroke weight (W13).

import { writeFileSync } from "node:fs";
const fmt=(n)=>Number(n.toFixed(2));
function cubicPts(p0,p1,p2,p3,n=20){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
const dPath=(P,s)=>{const h=s/2;return `M${fmt(P[0])} ${fmt(P[1]-h)} L${fmt(P[0]+h)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+h)} L${fmt(P[0]-h)} ${fmt(P[1])} Z`;};
const diamondO=(P,s,w)=>`<path d="${dPath(P,s)}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linejoin="round"/>`;
const circleO=(C,r,w)=>`<circle cx="${fmt(C[0])}" cy="${fmt(C[1])}" r="${r}" fill="none" stroke="url(#g)" stroke-width="${w}"/>`;
const line=(a,b,w)=>`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;
const stroke=(d,w)=>`<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="round"/>`;

// node balance: diamond diagonal aS vs circle radius kR. For equal *visual* size
// the diamond must be ~1.18× the circle's diameter (a rotated square reads small).
function make(o={}){
  const w=o.w??13;
  const kR=o.kR??12.5;                 // circle path radius
  const aS=o.aS??(2*kR*1.18);          // diamond diagonal, optically matched
  const A=[28,38], K=[84,38], h=aS/2, gap=o.gap??2;
  const Sx=A[0]+h+gap, Sy=A[1];        // curve/handle start (right of diamond)
  const lineEnd=[K[0]-kR-gap, K[1]];
  const curveD = o.curve(Sx, Sy);
  const cp = o.curvePts(Sx, Sy);
  const pts=[...cp,[Sx,Sy],lineEnd,[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
  const hw=w/2,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const bbox=[Math.min(...xs)-hw,Math.min(...ys)-hw,Math.max(...xs)+hw,Math.max(...ys)+hw];
  return {els:[line([Sx,Sy],lineEnd,w),stroke(curveD,w),diamondO(A,aS,w),circleO(K,kR,w)],bbox};
}
function centered(f){const[x0,y0,x1,y1]=f.bbox;return{...f,tx:50-(x0+x1)/2,ty:50-(y0+y1)/2};}

// curve shapes (collinear: tangent horizontal at start). Return path + sample pts.
const CURVES={
  "C1 quarter sweep": {
    d:(x,y)=>`M${fmt(x)} ${fmt(y)} C${fmt(x+16)} ${fmt(y)} ${fmt(x+22)} ${fmt(y+26)} ${fmt(x+20)} ${fmt(y+46)}`,
    p:(x,y)=>cubicPts([x,y],[x+16,y],[x+22,y+26],[x+20,y+46]),
  },
  "C2 deep hook (down-trail)": {
    d:(x,y)=>`M${fmt(x)} ${fmt(y)} C${fmt(x+14)} ${fmt(y)} ${fmt(x+24)} ${fmt(y+22)} ${fmt(x+22)} ${fmt(y+50)}`,
    p:(x,y)=>cubicPts([x,y],[x+14,y],[x+24,y+22],[x+22,y+50]),
  },
  "C3 long horizontal then drop": {
    d:(x,y)=>`M${fmt(x)} ${fmt(y)} C${fmt(x+26)} ${fmt(y)} ${fmt(x+30)} ${fmt(y+28)} ${fmt(x+26)} ${fmt(y+48)}`,
    p:(x,y)=>cubicPts([x,y],[x+26,y],[x+30,y+28],[x+26,y+48]),
  },
  "C4 vertical end (clean ¼ circle)": {
    d:(x,y)=>`M${fmt(x)} ${fmt(y)} C${fmt(x+18)} ${fmt(y)} ${fmt(x+24)} ${fmt(y+20)} ${fmt(x+24)} ${fmt(y+46)}`,
    p:(x,y)=>cubicPts([x,y],[x+18,y],[x+24,y+20],[x+24,y+46]),
  },
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
function hero(f,theme,px=200){const bg=theme==="dark"?"#0e0e12":"#fff";const sh=theme==="dark"?"none":"0 10px 30px rgba(0,0,0,.2)";return `<div style="width:${px+56}px;height:${px+56}px;border-radius:${Math.round((px+56)*0.23)}px;background:${bg};box-shadow:${sh};display:flex;align-items:center;justify-content:center;">${render(f,theme,px)}</div>`;}
const FAV=[48,32,22,16];
const fav=(f,theme)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:14px;align-items:center;padding:11px 16px;background:${bg};border-radius:13px;">${FAV.map(s=>render(f,theme,s)).join("")}</div>`;};
function block(name,form){const f=centered(form);return `<div style="margin-bottom:18px;"><div style="font:600 13px ui-monospace;color:#cfcfd6;margin:0 0 9px 2px;">${name}</div><div style="display:flex;gap:18px;align-items:center;">${hero(f,"light")}${fav(f,"light")}${hero(f,"dark")}${fav(f,"dark")}</div></div>`;}

const blocks=Object.entries(CURVES).map(([n,c])=>block(n+" · W13", make({curve:c.d,curvePts:c.p}))).join("");
writeFileSync(new URL("./index-outline2.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#15151a;font-family:ui-sans-serif">
   <div style="color:#cfcfd6;font:700 16px ui-sans-serif;margin-bottom:6px;">Bezier — collinear · balanced hollow nodes · curve options (W13)</div>
   <div style="color:#76767e;font:500 12px ui-sans-serif;margin-bottom:16px;">diamond sized 1.18× circle for equal visual weight</div>${blocks}</body>`);
console.log("wrote index-outline2.html");
