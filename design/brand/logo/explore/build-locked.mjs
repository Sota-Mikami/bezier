// Bezier logo — LOCKED (D1). Outlined balanced hollow nodes + collinear handle +
// graceful D1 sweep, W13, lit-black sheen. Emits the official asset set + the
// theme-aware React component, and a confirmation sheet.

import { writeFileSync } from "node:fs";
const fmt=(n)=>Number(n.toFixed(2));
function cubicPts(p0,p1,p2,p3,n=22){const o=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}

// ---- LOCKED geometry (D1) --------------------------------------------------
const W=13, kR=12.5, aS=2*kR*1.18, gap=2;
const A=[24,34], K=[82,34], h=aS/2;
const S=[A[0]+h+gap, A[1]];
const lineEnd=[K[0]-kR-gap, K[1]];
const c1=[S[0]+20,S[1]], c2=[S[0]+34,S[1]+34], E=[S[0]+30,S[1]+52];
const dPathStr=(P,s)=>{const hh=s/2;return `M${fmt(P[0])} ${fmt(P[1]-hh)} L${fmt(P[0]+hh)} ${fmt(P[1])} L${fmt(P[0])} ${fmt(P[1]+hh)} L${fmt(P[0]-hh)} ${fmt(P[1])} Z`;};
const curvePath=`M${fmt(S[0])} ${fmt(S[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(E[0])} ${fmt(E[1])}`;
// centering transform (bbox incl. stroke half-width → center at 50,50)
const _pts=[...cubicPts(S,c1,c2,E),S,lineEnd,[A[0]-h,A[1]],[A[0]+h,A[1]],[A[0],A[1]-h],[A[0],A[1]+h],[K[0]-kR,K[1]-kR],[K[0]+kR,K[1]+kR]];
const _hw=W/2,_xs=_pts.map(p=>p[0]),_ys=_pts.map(p=>p[1]);
const BB=[Math.min(..._xs)-_hw,Math.min(..._ys)-_hw,Math.max(..._xs)+_hw,Math.max(..._ys)+_hw];
const TX=fmt(50-(BB[0]+BB[2])/2), TY=fmt(50-(BB[1]+BB[3])/2);

// ---- element builders (outlined) -------------------------------------------
const els=(strokeRef,w=W)=>[
  `<line x1="${fmt(S[0])}" y1="${fmt(S[1])}" x2="${fmt(lineEnd[0])}" y2="${fmt(lineEnd[1])}" stroke="${strokeRef}" stroke-width="${w}" stroke-linecap="round"/>`,
  `<path d="${curvePath}" fill="none" stroke="${strokeRef}" stroke-width="${w}" stroke-linecap="round"/>`,
  `<path d="${dPathStr(A,aS)}" fill="none" stroke="${strokeRef}" stroke-width="${w}" stroke-linejoin="round"/>`,
  `<circle cx="${fmt(K[0])}" cy="${fmt(K[1])}" r="${kR}" fill="none" stroke="${strokeRef}" stroke-width="${w}"/>`,
];
// filled nodes for tiny favicon (hollow closes < ~24px)
const elsFilled=(strokeRef,w)=>[
  `<line x1="${fmt(S[0])}" y1="${fmt(S[1])}" x2="${fmt(lineEnd[0])}" y2="${fmt(lineEnd[1])}" stroke="${strokeRef}" stroke-width="${w}" stroke-linecap="round"/>`,
  `<path d="${curvePath}" fill="none" stroke="${strokeRef}" stroke-width="${w}" stroke-linecap="round"/>`,
  `<path d="${dPathStr(A,aS)}" fill="${strokeRef}"/>`,
  `<circle cx="${fmt(K[0])}" cy="${fmt(K[1])}" r="${kR}" fill="${strokeRef}"/>`,
];

const gradDefs=(id,stops)=>`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="22" y1="14" x2="78" y2="92">${stops.map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;
const LIGHT=[["0","#5a5a69"],["0.5","#26262f"],["1","#08080c"]];
const DARK=[["0","#ffffff"],["1","#cfcfdc"]];
const wrap=(inner,defs="",size=100,extra="")=>`<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier">${defs}${extra}<g transform="translate(${TX} ${TY})">${inner}</g></svg>\n`;
const out=(name,content)=>writeFileSync(new URL(`../${name}`,import.meta.url),content);

// mark.svg — outlined, lit-black light gradient
out("mark.svg", wrap(els("url(#bz)").join(""), `<defs>${gradDefs("bz",LIGHT)}</defs>`));
// mark-mono.svg — outlined, flat ink
out("mark-mono.svg", wrap(els("#1c1c24").join("")));
// mark-favicon.svg — filled nodes, bolder, lit-black (reads tiny). media-query theme swap.
out("mark-favicon.svg", wrap(elsFilled("url(#bz)",15).join(""),
  `<defs>${gradDefs("bz",LIGHT)}</defs><style>@media (prefers-color-scheme: dark){#bz stop:nth-child(1){stop-color:#fff}#bz stop:nth-child(2){stop-color:#5a5a6e}#bz stop:nth-child(3){stop-color:#cfcfdc}}</style>`));
// icon-app.svg — outlined mark on a dark rounded tile (1024), white sheen
out("icon-app.svg", `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier"><defs><linearGradient id="bz" gradientUnits="userSpaceOnUse" x1="300" y1="200" x2="760" y2="900"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfcfdc"/></linearGradient></defs><rect width="1024" height="1024" rx="228" fill="#0e0e12"/><g transform="translate(${512-50*5.0} ${512-50*5.0}) scale(5.0)"><g transform="translate(${TX} ${TY})">${els("url(#bz)").join("")}</g></g></svg>\n`);
// wordmark.svg — mark + "Bezier"
out("wordmark.svg", `<svg width="232" height="64" viewBox="0 0 232 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bezier"><defs>${gradDefs("bz",LIGHT)}</defs><g transform="translate(2 6) scale(0.52)"><g transform="translate(${TX} ${TY})">${els("url(#bz)").join("")}</g></g><text x="68" y="42" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif" font-size="30" font-weight="650" letter-spacing="-0.01em" fill="#1c1c24">Bezier</text></svg>\n`);

// ---- React component (theme-aware: currentColor sheen, outlined) ------------
const tsx=`"use client";
// The Bezier mark — an abstracted pen tool: a square anchor (the repo's start) and
// a round control knob (the handle you hold) joined by the handle line; the curve
// is what the agent draws. Outlined nodes; a subtle "lit" sheen via a currentColor
// gradient so it's theme-aware. Generated by design/brand/logo/explore/build-locked.mjs.
import { useId } from "react";

export function BezierMark({ className, title = "Bezier" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" fill="none" role="img" aria-label={title} className={className}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="22" y1="14" x2="78" y2="92">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.62" />
        </linearGradient>
      </defs>
      <g transform="translate(${TX} ${TY})" stroke={\`url(#\${id})\`} strokeWidth={${W}} fill="none">
        <line x1="${fmt(S[0])}" y1="${fmt(S[1])}" x2="${fmt(lineEnd[0])}" y2="${fmt(lineEnd[1])}" strokeLinecap="round" />
        <path d="${curvePath}" strokeLinecap="round" />
        <path d="${dPathStr(A,aS)}" strokeLinejoin="round" />
        <circle cx="${fmt(K[0])}" cy="${fmt(K[1])}" r="${kR}" />
      </g>
    </svg>
  );
}
`;
writeFileSync(new URL("../../../../site/src/components/bezier-mark.tsx",import.meta.url), tsx);
writeFileSync(new URL("../../../../app/src/components/bezier-mark.tsx",import.meta.url), tsx);

// ---- confirmation sheet ----------------------------------------------------
let U=0;
const svg=(elsArr,theme,size,filled=false)=>{const id=`g${U++}`;const stops=theme==="dark"?DARK:LIGHT;const arr=(filled?elsFilled:els)(`url(#${id})`, filled?15:W);return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><defs>${gradDefs(id,stops)}</defs><g transform="translate(${TX} ${TY})">${arr.join("")}</g></svg>`;};
const tile=(theme,filled=false)=>{const bg=theme==="dark"?"#0e0e12":"#fff";const sh=theme==="dark"?"none":"0 8px 20px rgba(0,0,0,.18)";return `<div style="width:150px;height:150px;border-radius:34px;background:${bg};box-shadow:${sh};display:flex;align-items:center;justify-content:center;">${svg(null,theme,108,filled)}</div>`;};
const favs=(theme,filled)=>{const bg=theme==="dark"?"#0e0e12":"#fff";return `<div style="display:flex;gap:14px;align-items:center;padding:11px 16px;background:${bg};border-radius:13px;">${[40,28,20,16].map(s=>svg(null,theme,s,filled)).join("")}</div>`;};
writeFileSync(new URL("./index-locked.html",import.meta.url),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:26px;background:#15151a;font-family:ui-sans-serif;color:#cfcfd6">
   <div style="font:700 16px ui-sans-serif;margin-bottom:14px;">Bezier — LOCKED logo (D1) · official assets</div>
   <div style="font:600 12px ui-monospace;color:#9a9aa4;margin-bottom:8px;">app icon (outlined) · light / dark</div>
   <div style="display:flex;gap:18px;align-items:center;margin-bottom:18px;">${tile("light")}${favs("light")}${tile("dark")}${favs("dark")}</div>
   <div style="font:600 12px ui-monospace;color:#9a9aa4;margin-bottom:8px;">favicon (filled, for tiny sizes) · light / dark</div>
   <div style="display:flex;gap:18px;align-items:center;">${favs("light",true)}${favs("dark",true)}
     <div style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:10px 18px;"><svg width="30" height="30" viewBox="0 0 100 100"><defs>${gradDefs("wg",LIGHT)}</defs><g transform="translate(${TX} ${TY})">${els("url(#wg)").join("")}</g></svg><span style="font:650 22px ui-sans-serif;color:#1c1c24">Bezier</span></div>
   </div></body>`);
console.log("emitted assets + component. TX,TY=",TX,TY);
