// Journey page (DEC-094) — a self-contained, shareable HTML page that shows the
// MAKER process behind a change (Spec → 実装の履歴 → the running App), not just
// the output. Bezier GENERATES this HTML, so it can carry the "Made with Bezier"
// badge; code is linked to git, never hosted (DEC-094). Markdown is rendered
// at generation time to escaped, safe HTML; raw HTML in Spec never executes in
// the shared page.

import { tt } from "@/lib/i18n";
import { SHARE_SCRIPT } from "@/lib/journey-script";

// CSP hash of SHARE_SCRIPT (DEC-113) — allows ONLY that exact inline script to run
// (keyboard shortcuts), keeping the page's no-arbitrary-script guarantee. Locked to
// the script by journey.test.ts: change the script → recompute → update this.
const SHARE_SCRIPT_HASH = "sha256-h8Jw6EvmmAoVr6NK7XMG0md8MmHMKN2g3ZmVEoYoI3w=";

// DF-5: the share page MIRRORS the maker's Issue detail — a Design / Prototype
// segmented control, each with its own tabs, showing only what the maker chose to
// share (per-issue). A "doc" tab is rendered (escaped) markdown; an "html" tab is
// a sandboxed design wireframe; Prototype tabs are the live app (preview), a QA
// table, or a Map grid of route previews. Tabs are CSS-ONLY (radio + :checked) so
// the page needs NO script — the strict `default-src 'none'` CSP holds.

/** A Design-segment tab: a markdown doc, or a self-contained html wireframe. */
export type JourneyDesignTab =
  | { kind: "doc"; label: string; md: string }
  | { kind: "html"; label: string; html: string };

/** One QA row, trimmed to what the shared table shows. */
export interface JourneyQaRow {
  area: string;
  scenario: string;
  expected: string;
  status: string;
  priority: string;
}

/** A Prototype-segment tab: the live app, the QA table, or the route map. */
export type JourneyProtoTab =
  | { kind: "preview"; label: string; appUrl: string | null }
  | { kind: "qa"; label: string; rows: JourneyQaRow[] }
  | { kind: "map"; label: string; appUrl: string | null; routes: string[] };

export interface JourneyData {
  title: string;
  /** Design tabs to show, in order (empty → no Design segment). */
  design: JourneyDesignTab[];
  /** Prototype tabs to show, in order (empty → no Prototype segment). */
  prototype: JourneyProtoTab[];
  /** Pre-formatted generation date (e.g. "2026-06-17"), shown in the header so the
   *  recipient knows how fresh this is. Omitted → no date shown. */
  generatedAt?: string;
}

/** An AES-GCM ciphertext + the params needed to derive the key from a password.
 *  All binary fields are base64. Used by the password gate (DEC-102). */
export interface EncryptedBlob {
  saltB64: string;
  ivB64: string;
  dataB64: string;
  iter: number;
}

/**
 * Password gate (DEC-102) — a self-contained page that holds ONLY the ciphertext
 * of the real share page. On the correct password it derives the key (PBKDF2),
 * decrypts, and renders the original HTML inside a full-page iframe (so the inner
 * page's own scripts — marked, the app embed — run normally). Hobby-compatible:
 * no server, no Vercel Pro. Honest limit: this protects the SHARE PAGE; once
 * unlocked, the embedded app's (unguessable) URL is revealed — the app itself
 * isn't separately gated. Convenience: on success the password is cached in this
 * browser's localStorage for ~7 days (per-device) so the recipient isn't re-prompted;
 * a rotated password (decrypt fails) clears the cache and shows the form again.
 */
export function buildGatePage(title: string, b: EncryptedBlob): string {
  const safeTitle = esc(title || "Untitled");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self' https://*.vercel.app; base-uri 'none'; form-action 'none'">
<title>${safeTitle} — Bezier</title>
<style>
:root{--bg:#faf9f7;--fg:#1c1a17;--muted:#6b6660;--line:#e7e3dd;--accent:#1c1a17}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
.gate{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:360px;text-align:center}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px;margin-bottom:20px}
.badge .dot{width:9px;height:9px;border-radius:2px;background:var(--accent)}
h1{font-size:18px;font-weight:650;margin:0 0 6px}
.lead{color:var(--muted);margin:0 0 20px;font-size:13px}
form{display:flex;gap:8px}
input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff;color:var(--fg)}
button{padding:10px 16px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-weight:600;font-size:14px;cursor:pointer}
.err{color:#b4322f;font-size:12px;margin-top:12px;min-height:16px}
iframe.view{position:fixed;inset:0;width:100%;height:100%;border:0;background:var(--bg)}
</style>
</head>
<body>
<div class="gate" id="gate">
  <div class="card">
    <span class="badge"><span class="dot"></span>Made with Bezier</span>
    <h1>${safeTitle}</h1>
    <p class="lead">${esc(tt("journey.pwProtected"))}</p>
    <form id="f">
      <input id="pw" type="password" placeholder="${escAttr(tt("journey.pwPlaceholder"))}" autocomplete="current-password" autofocus>
      <button type="submit">${esc(tt("journey.pwOpen"))}</button>
    </form>
    <div class="err" id="err"></div>
  </div>
</div>
<script>
var B={salt:"${b.saltB64}",iv:"${b.ivB64}",data:"${b.dataB64}",iter:${b.iter}};
var KEY="bz-pw-"+B.salt, TTL=604800000; // remember on THIS device for ~7 days
function b2u(s){var x=atob(s),a=new Uint8Array(x.length);for(var i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a;}
async function tryDecrypt(pw){
  var enc=new TextEncoder();
  var bk=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveKey"]);
  var key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b2u(B.salt),iterations:B.iter,hash:"SHA-256"},bk,{name:"AES-GCM",length:256},false,["decrypt"]);
  var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b2u(B.iv)},key,b2u(B.data));
  return new TextDecoder().decode(pt);
}
function show(html){var f=document.createElement("iframe");f.className="view";f.srcdoc=html;document.body.innerHTML="";document.body.appendChild(f);}
function remember(pw){try{localStorage.setItem(KEY,JSON.stringify({pw:pw,exp:Date.now()+TTL}));}catch(e){}}
function cachedPw(){try{var r=JSON.parse(localStorage.getItem(KEY)||"null");if(r&&r.exp>Date.now())return r.pw;}catch(e){}return null;}
document.getElementById("f").addEventListener("submit",function(e){
  e.preventDefault();
  var err=document.getElementById("err");err.textContent="";
  var btn=e.target.querySelector("button");btn.disabled=true;
  var pw=document.getElementById("pw").value;
  tryDecrypt(pw).then(function(html){remember(pw);show(html);}).catch(function(){err.textContent=${JSON.stringify(tt("journey.pwWrong"))};btn.disabled=false;});
});
// Re-open without re-prompting if a recent password is cached on this device; a
// rotated password (decrypt fails) silently clears it and shows the form.
(function(){var pw=cachedPw();if(pw)tryDecrypt(pw).then(show).catch(function(){try{localStorage.removeItem(KEY);}catch(e){}});})();
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s).replace(/'/g, "&#39;");
}

function inlineMd(s: string): string {
  return (
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      // Single * = italic (bold's ** already consumed above); require non-space edges
      // so "a * b" isn't matched. No lookbehind (older Safari/WKWebView recipients).
      .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "<em>$1</em>")
      // _word_ italic only at word boundaries, so snake_case identifiers stay plain.
      .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
  );
}

/** Heading/ToC text with the inline md markers stripped (for the ToC link label). */
function plainInline(s: string): string {
  return esc(s.replace(/[*_~`]/g, ""));
}

interface TocEntry {
  level: number;
  text: string;
  id: string;
}

function renderSafeMarkdown(md: string): { html: string; toc: TocEntry[] } {
  const lines = (md || tt("journey.specEmpty")).replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const toc: TocEntry[] = [];
  let inCode = false;
  let code: string[] = [];
  // Open-list stack: each entry remembers its tag + the indent (leading spaces) it
  // opened at, so nested bullets keep their indentation (the app renders nesting;
  // the old flat single-<ul> dropped it) and ordered/unordered lists don't mix.
  const stack: { tag: "ul" | "ol"; indent: number }[] = [];
  const closeDeeper = (indent: number) => {
    while (stack.length && stack[stack.length - 1].indent > indent) {
      out.push(`</${stack.pop()!.tag}>`);
    }
  };
  const closeAll = () => {
    while (stack.length) out.push(`</${stack.pop()!.tag}>`);
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeAll();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    // A blank line keeps open lists open (loose lists / sub-items often have gaps);
    // a real paragraph below closes them.
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      closeAll();
      const level = h[1].length;
      const id = `h-${toc.length}`; // sequential → ASCII anchors regardless of language
      toc.push({ level, text: h[2], id });
      out.push(`<h${level} id="${id}">${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const indent = li[1].replace(/\t/g, "  ").length;
      const ordered = /^\s*\d/.test(line);
      const tag: "ul" | "ol" = ordered ? "ol" : "ul";
      closeDeeper(indent);
      const top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        out.push(`<${tag}>`);
        stack.push({ tag, indent });
      } else if (top.indent === indent && top.tag !== tag) {
        out.push(`</${stack.pop()!.tag}>`);
        out.push(`<${tag}>`);
        stack.push({ tag, indent });
      }
      // GitHub task list: `- [ ]` / `- [x]` → a real checkbox, no bullet (the app's
      // Spec checklist renders this way; the old code showed a dot + literal "[ ]").
      const task = /^\[([ xX])\]\s+(.*)$/.exec(li[2]);
      if (task) {
        const on = task[1].toLowerCase() === "x";
        out.push(
          `<li class="task"><span class="chk${on ? " on" : ""}">${on ? "✓" : ""}</span>${inlineMd(task[2])}</li>`,
        );
      } else {
        out.push(`<li>${inlineMd(li[2])}</li>`);
      }
      continue;
    }
    closeAll();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  if (inCode) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  closeAll();
  return { html: out.join("\n"), toc };
}

/** Only ever embed an https URL (block javascript:/data: etc.). */
function httpsOnly(u: string | null | undefined): string | null {
  return u && /^https:\/\//i.test(u) ? u : null;
}

function renderDesignTab(tab: JourneyDesignTab): string {
  if (tab.kind === "doc") {
    const { html, toc } = renderSafeMarkdown(tab.md);
    // A table of contents (only worth it with ≥2 headings), indented by level so
    // nested headings read as a hierarchy. Anchor links → no script needed (CSP-safe).
    const tocHtml =
      toc.length >= 2
        ? `<nav class="toc" aria-label="${escAttr(tt("journey.toc"))}"><div class="toc-h">${esc(
            tt("journey.toc"),
          )}</div>${toc
            .map(
              (h) => `<a class="toc-i lv${h.level}" href="#${h.id}">${plainInline(h.text)}</a>`,
            )
            .join("")}</nav>`
        : "";
    return `<div class="doc">${tocHtml}${html}</div>`;
  }
  // A self-contained wireframe: no-privilege sandbox (no scripts, no same-origin).
  return `<iframe class="design" sandbox="" title="${escAttr(tab.label)}" srcdoc="${escAttr(tab.html)}"></iframe>`;
}

function renderProtoTab(tab: JourneyProtoTab): string {
  if (tab.kind === "preview") {
    const u = httpsOnly(tab.appUrl);
    return u
      ? `<a class="cta" href="${esc(u)}" target="_blank" rel="noopener">${esc(tt("journey.openApp"))}</a>
       <p class="hint">${esc(tt("journey.openHint"))}</p>
       <iframe class="frame" src="${esc(u)}" title="app preview" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`
      : `<p class="muted">${esc(tt("journey.appNotPublished"))}</p>`;
  }
  if (tab.kind === "qa") {
    if (!tab.rows.length) return `<p class="muted">${esc(tt("journey.qaEmpty"))}</p>`;
    const head = `<tr><th>${esc(tt("journey.qaArea"))}</th><th>${esc(tt("journey.qaScenario"))}</th><th>${esc(tt("journey.qaExpected"))}</th><th>${esc(tt("journey.qaStatus"))}</th></tr>`;
    const body = tab.rows
      .map(
        (r) =>
          `<tr><td>${esc(r.area)}</td><td>${esc(r.scenario)}</td><td>${esc(r.expected)}</td><td>${esc(r.status)}</td></tr>`,
      )
      .join("");
    return `<table class="qa"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }
  // map: a grid of live route previews against the published app.
  const u = httpsOnly(tab.appUrl);
  if (!u) return `<p class="muted">${esc(tt("journey.mapNeedsApp"))}</p>`;
  if (!tab.routes.length) return `<p class="muted">${esc(tt("journey.mapEmpty"))}</p>`;
  const base = u.replace(/\/+$/, "");
  const cells = tab.routes
    .map((rt) => {
      const r = rt.startsWith("/") ? rt : `/${rt}`;
      return `<figure class="mapcell"><iframe src="${esc(base + r)}" title="${escAttr(r)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe><figcaption><a href="${esc(base + r)}" target="_blank" rel="noopener">${esc(r)} ↗</a></figcaption></figure>`;
    })
    .join("");
  return `<div class="mapgrid">${cells}</div>`;
}

export function buildJourneyHtml(data: JourneyData): string {
  const safeTitle = esc(data.title || "Untitled");
  const badge = `<span class="badge"><span class="dot"></span>Made with Bezier</span>`;

  // Segments present (non-empty) + their rendered tabs.
  const segments: { label: string; tabs: { label: string; html: string }[] }[] = [];
  if (data.design.length) {
    segments.push({
      label: tt("journey.segDesign"),
      tabs: data.design.map((t) => ({ label: t.label, html: renderDesignTab(t) })),
    });
  }
  if (data.prototype.length) {
    segments.push({
      label: tt("journey.segPrototype"),
      tabs: data.prototype.map((t) => ({ label: t.label, html: renderProtoTab(t) })),
    });
  }

  // CSS-ONLY two-level tabs (radio + `:checked ~ panel`) — no script, so the page
  // keeps the strict `default-src 'none'` CSP. Radios precede their panels so the
  // general-sibling combinator can reveal the checked one. Rules are generated per
  // segment/tab below.
  const cssRules: string[] = [];
  const segRadios: string[] = [];
  const segLabels: string[] = [];
  const segPanels: string[] = [];
  segments.forEach((seg, si) => {
    const segId = `seg${si}`;
    const segPanelId = `segp${si}`;
    cssRules.push(`#${segId}:checked~#${segPanelId}{display:block}`);
    cssRules.push(`#${segId}:checked~.segbar label[for="${segId}"]{background:var(--accent);color:#fff}`);
    segRadios.push(`<input class="r" type="radio" name="seg" id="${segId}"${si === 0 ? " checked" : ""}>`);
    segLabels.push(`<label for="${segId}">${esc(seg.label)}</label>`);

    const tabRadios: string[] = [];
    const tabLabels: string[] = [];
    const tabPanels: string[] = [];
    seg.tabs.forEach((tab, ti) => {
      const tId = `t${si}_${ti}`;
      const tPanelId = `tp${si}_${ti}`;
      cssRules.push(`#${tId}:checked~#${tPanelId}{display:block}`);
      cssRules.push(`#${tId}:checked~.tabbar label[for="${tId}"]{color:var(--fg);border-bottom-color:var(--accent)}`);
      tabRadios.push(`<input class="r" type="radio" name="tg${si}" id="${tId}"${ti === 0 ? " checked" : ""}>`);
      tabLabels.push(`<label for="${tId}">${esc(tab.label)}</label>`);
      tabPanels.push(`<div class="tabp" id="${tPanelId}">${tab.html}</div>`);
    });
    segPanels.push(
      `<div class="segp" id="${segPanelId}">${tabRadios.join("")}<nav class="tabbar">${tabLabels.join("")}</nav>${tabPanels.join("")}</div>`,
    );
  });

  const body =
    segments.length === 0
      ? `<p class="muted">${esc(tt("journey.nothingShared"))}</p>`
      : `<div class="tabs">${segRadios.join("")}${
          segments.length > 1 ? `<nav class="segbar">${segLabels.join("")}</nav>` : ""
        }${segPanels.join("")}</div>`;

  const meta = data.generatedAt
    ? `<span class="meta">${esc(tt("journey.generated", { date: data.generatedAt }))}</span>`
    : "";
  return buildPage(safeTitle, badge, body, cssRules.join("\n"), meta);
}

function buildPage(
  safeTitle: string,
  badge: string,
  body: string,
  tabCss: string,
  meta: string,
): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src '${SHARE_SCRIPT_HASH}'; frame-src 'self' https://*.vercel.app; base-uri 'none'; form-action 'none'">
<title>${safeTitle} — Bezier</title>
<style>
:root{--bg:#faf9f7;--fg:#1c1a17;--muted:#6b6660;--line:#e7e3dd;--accent:#1c1a17}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
/* Prototype-style chrome: a sticky header bar + a WIDE content area (so the live
   Preview renders at desktop width, not a cramped small-device column). */
.topbar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line)}
.bar{max-width:1280px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
.page{max-width:1280px;margin:0 auto;padding:24px 24px 96px;overflow-wrap:anywhere}
h1{font-size:20px;font-weight:650;letter-spacing:-.01em;margin:0}
.top-right{display:flex;align-items:center;gap:10px}
.meta{font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px;text-decoration:none;white-space:nowrap}
.badge .dot{width:9px;height:9px;border-radius:2px;background:var(--accent)}
/* Table of contents (DEC-133) — indented by heading level. */
.toc{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 20px;background:#fff}
.toc-h{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:6px}
.toc-i{display:block;color:var(--muted);text-decoration:none;font-size:13px;padding:2px 0}
.toc-i:hover{color:var(--fg)}
.toc-i.lv2{padding-left:14px}
.toc-i.lv3{padding-left:28px}
/* CSS-only tabs: hide the radios; reveal panels via generated :checked rules. */
.r{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.tabs{margin-top:6px}
.doc{max-width:880px}
.segbar{display:inline-flex;gap:3px;background:#efece7;border-radius:10px;padding:3px;margin-bottom:8px}
.segbar label{font-size:13px;font-weight:600;color:var(--muted);padding:6px 16px;border-radius:7px;cursor:pointer}
.segp{display:none}
/* Many tabs scroll horizontally (no wrap) instead of stacking into rows. */
.tabbar{display:flex;gap:2px;flex-wrap:nowrap;overflow-x:auto;border-bottom:1px solid var(--line);margin:6px 0 18px;scrollbar-width:thin}
.tabbar::-webkit-scrollbar{height:6px}
.tabbar::-webkit-scrollbar-thumb{background:var(--line);border-radius:3px}
.tabbar label{font-size:13px;color:var(--muted);padding:8px 12px;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px;white-space:nowrap;flex:0 0 auto}
.tabp{display:none}
.doc :is(h1,h2,h3){font-size:17px;font-weight:650;margin:20px 0 8px;color:var(--fg);scroll-margin-top:72px}
.doc p{margin:8px 0}
.doc code{background:#efece7;padding:1px 5px;border-radius:4px;font-size:13px}
.doc pre{background:#efece7;padding:12px;border-radius:8px;overflow:auto}
.doc pre code{background:none;padding:0}
.doc ul,.doc ol{padding-left:22px;margin:8px 0}
.doc li{margin:3px 0}
/* GitHub task list: no bullet, a real checkbox box (matches the app's checklist). */
.doc li.task{list-style:none;margin-left:-22px}
.doc .chk{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1px solid var(--line);border-radius:4px;margin-right:7px;vertical-align:-3px;font-size:10px;line-height:1;color:transparent}
.doc .chk.on{background:var(--accent);border-color:var(--accent);color:#fff}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px}
.hint{color:var(--muted);font-size:12px;margin:8px 0 0}
.frame{display:block;width:100%;height:min(82vh,880px);margin-top:16px;border:1px solid var(--line);border-radius:10px;background:#fff}
.design{display:block;width:100%;height:min(82vh,880px);border:1px solid var(--line);border-radius:10px;background:#fff}
.qa{width:100%;border-collapse:collapse;font-size:13px}
.qa th,.qa td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.qa th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.mapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.mapcell{margin:0}
.mapcell iframe{width:100%;height:200px;border:1px solid var(--line);border-radius:8px;background:#fff}
.mapcell figcaption{font-size:12px;margin-top:4px;font-family:ui-monospace,monospace}
.mapcell figcaption a{color:var(--muted);text-decoration:none}
.mapcell figcaption a:hover{color:var(--fg)}
.muted{color:var(--muted)}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px 12px;flex-wrap:wrap}
${tabCss}
</style>
</head>
<body>
<header class="topbar">
  <div class="bar">
    <h1>${safeTitle}</h1>
    <div class="top-right">${meta}${badge}</div>
  </div>
</header>
<main class="page">
  ${body}

  <footer>
    <span>${esc(tt("journey.madeBy"))}</span>
  </footer>
</main>
<script>${SHARE_SCRIPT}</script>
</body>
</html>`;
}
