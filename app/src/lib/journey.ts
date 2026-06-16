// Journey page (DEC-094) — a self-contained, shareable HTML page that shows the
// MAKER process behind a change (Spec → 実装の履歴 → the running App), not just
// the output. Bezier GENERATES this HTML, so it can carry the "Made with Bezier"
// badge; code is linked to git, never hosted (DEC-094). Markdown is rendered
// at generation time to escaped, safe HTML; raw HTML in Spec never executes in
// the shared page.

import { tt } from "@/lib/i18n";

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
 * isn't separately gated.
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
function b2u(s){var x=atob(s),a=new Uint8Array(x.length);for(var i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a;}
async function tryDecrypt(pw){
  var enc=new TextEncoder();
  var bk=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveKey"]);
  var key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b2u(B.salt),iterations:B.iter,hash:"SHA-256"},bk,{name:"AES-GCM",length:256},false,["decrypt"]);
  var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b2u(B.iv)},key,b2u(B.data));
  return new TextDecoder().decode(pt);
}
document.getElementById("f").addEventListener("submit",function(e){
  e.preventDefault();
  var err=document.getElementById("err");err.textContent="";
  var btn=e.target.querySelector("button");btn.disabled=true;
  tryDecrypt(document.getElementById("pw").value).then(function(html){
    var f=document.createElement("iframe");f.className="view";f.srcdoc=html;
    document.body.innerHTML="";document.body.appendChild(f);
  }).catch(function(){err.textContent=${JSON.stringify(tt("journey.pwWrong"))};btn.disabled=false;});
});
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
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderSafeMarkdown(md: string): string {
  const lines = (md || tt("journey.specEmpty")).replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let code: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      closeList();
      out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMd(li[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  return out.join("\n");
}

/** Only ever embed an https URL (block javascript:/data: etc.). */
function httpsOnly(u: string | null | undefined): string | null {
  return u && /^https:\/\//i.test(u) ? u : null;
}

function renderDesignTab(tab: JourneyDesignTab): string {
  if (tab.kind === "doc") return `<div class="doc">${renderSafeMarkdown(tab.md)}</div>`;
  // A self-contained wireframe: no-privilege sandbox (no scripts, no same-origin).
  return `<iframe class="design" sandbox="" title="${escAttr(tab.label)}" srcdoc="${escAttr(tab.html)}"></iframe>`;
}

function renderProtoTab(tab: JourneyProtoTab): string {
  if (tab.kind === "preview") {
    const u = httpsOnly(tab.appUrl);
    return u
      ? `<a class="cta" href="${esc(u)}" target="_blank" rel="noopener">${esc(tt("journey.openApp"))}</a>
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
      return `<figure class="mapcell"><iframe src="${esc(base + r)}" title="${escAttr(r)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe><figcaption>${esc(r)}</figcaption></figure>`;
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

  return buildPage(safeTitle, badge, body, cssRules.join("\n"));
}

function buildPage(safeTitle: string, badge: string, body: string, tabCss: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-src 'self' https://*.vercel.app; base-uri 'none'; form-action 'none'">
<title>${safeTitle} — Bezier</title>
<style>
:root{--bg:#faf9f7;--fg:#1c1a17;--muted:#6b6660;--line:#e7e3dd;--accent:#1c1a17}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:40px 20px 80px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}
h1{font-size:24px;font-weight:650;letter-spacing:-.01em;margin:0}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px;text-decoration:none;white-space:nowrap}
.badge .dot{width:9px;height:9px;border-radius:2px;background:var(--accent)}
.lead{color:var(--muted);margin:6px 0 0}
/* CSS-only tabs: hide the radios; reveal panels via generated :checked rules. */
.r{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.tabs{margin-top:28px}
.segbar{display:inline-flex;gap:3px;background:#efece7;border-radius:10px;padding:3px;margin-bottom:8px}
.segbar label{font-size:13px;font-weight:600;color:var(--muted);padding:6px 16px;border-radius:7px;cursor:pointer}
.segp{display:none}
.tabbar{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:6px 0 18px}
.tabbar label{font-size:13px;color:var(--muted);padding:8px 12px;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px}
.tabp{display:none}
.doc :is(h1,h2,h3){font-size:17px;font-weight:650;margin:20px 0 8px;color:var(--fg)}
.doc p{margin:8px 0}
.doc code{background:#efece7;padding:1px 5px;border-radius:4px;font-size:13px}
.doc pre{background:#efece7;padding:12px;border-radius:8px;overflow:auto}
.doc pre code{background:none;padding:0}
.doc ul,.doc ol{padding-left:20px}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px}
.frame{display:block;width:100%;height:560px;margin-top:16px;border:1px solid var(--line);border-radius:10px;background:#fff}
.design{display:block;width:100%;height:560px;border:1px solid var(--line);border-radius:10px;background:#fff}
.qa{width:100%;border-collapse:collapse;font-size:13px}
.qa th,.qa td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.qa th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.mapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.mapcell{margin:0}
.mapcell iframe{width:100%;height:200px;border:1px solid var(--line);border-radius:8px;background:#fff}
.mapcell figcaption{font-size:12px;color:var(--muted);margin-top:4px;font-family:ui-monospace,monospace}
.muted{color:var(--muted)}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:12px}
${tabCss}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${safeTitle}</h1>
    ${badge}
  </header>
  <p class="lead">${esc(tt("journey.footerLead"))}</p>

  ${body}

  <footer>
    ${badge}
    <span>${esc(tt("journey.madeBy"))}</span>
  </footer>
</div>
</body>
</html>`;
}
