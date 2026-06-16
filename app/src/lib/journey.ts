// Journey page (DEC-094) — a self-contained, shareable HTML page that shows the
// MAKER process behind a change (Spec → 実装の履歴 → the running App), not just
// the output. Bezier GENERATES this HTML, so it can carry the "Made with Bezier"
// badge; code is linked to git, never hosted (DEC-094). Markdown is rendered
// at generation time to escaped, safe HTML; raw HTML in Spec never executes in
// the shared page.

import { tt } from "@/lib/i18n";
import type { Checkpoint } from "./git";
import type { JourneyLayers } from "./settings";

export interface JourneyData {
  title: string;
  specMd: string;
  checkpoints: Checkpoint[];
  /** The published app URL (Vercel), if the app was shared. */
  appUrl: string | null;
  /** Which sections to include (DEC-094, per-share toggle). Default: all. */
  layers?: JourneyLayers;
  /** The adopted design wireframe's self-contained HTML, embedded if present. */
  designHtml?: string | null;
  /** The opened PR URL, if any. */
  prUrl?: string | null;
  /** The repo's git remote URL (to build a GitHub branch link as a fallback). */
  repoUrl?: string | null;
  /** The worktree branch (for the GitHub link). */
  branch?: string | null;
}

/** Turn a git remote URL + branch into a GitHub branch URL, or null. */
function githubBranchUrl(
  repoUrl: string | null | undefined,
  branch: string | null | undefined,
): string | null {
  if (!repoUrl || !branch) return null;
  // git@github.com:owner/repo(.git)  OR  https://github.com/owner/repo(.git)
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(repoUrl.trim());
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}/tree/${encodeURIComponent(branch)}`;
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

function fmtDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : esc(iso);
}

export function buildJourneyHtml(data: JourneyData): string {
  const safeTitle = esc(data.title || "Untitled");
  // Defense-in-depth: only embed an https URL (publish.url is already regex-
  // constrained to *.vercel.app, but don't trust the caller — block javascript:).
  const appUrl =
    data.appUrl && /^https:\/\//i.test(data.appUrl) ? data.appUrl : null;
  const specHtml = renderSafeMarkdown(data.specMd);

  const appSection = appUrl
    ? `<a class="cta" href="${esc(appUrl)}" target="_blank" rel="noopener">${esc(tt("journey.openApp"))}</a>
       <iframe class="frame" src="${esc(appUrl)}" title="app preview" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`
    : `<p class="muted">${esc(tt("journey.appNotPublished"))}</p>`;

  const history = data.checkpoints.length
    ? data.checkpoints
        .map(
          (c) =>
            `<li><code>${esc(c.short)}</code><span>${esc(c.subject)}</span><time>${fmtDate(c.iso)}</time></li>`,
        )
        .join("\n")
    : `<li class="muted">${esc(tt("journey.noHistory"))}</li>`;

  const designSection = data.designHtml
    ? `<iframe class="design" sandbox="" title="design" srcdoc="${escAttr(data.designHtml)}"></iframe>`
    : "";
  const implLink = data.prUrl ?? githubBranchUrl(data.repoUrl, data.branch);
  const implSection = implLink
    ? `<a class="link" href="${esc(implLink)}" target="_blank" rel="noopener">${esc(data.prUrl ? tt("journey.viewPr") : tt("journey.viewGithub"))} →</a>`
    : "";

  const badge = `<span class="badge"><span class="dot"></span>Made with Bezier</span>`;

  // Per-share section toggles (DEC-094). Default: all on.
  const L = data.layers ?? {
    app: true,
    spec: true,
    design: true,
    impl: true,
  };
  const sections = [
    L.app ? `<h2>${esc(tt("journey.secApp"))}</h2>\n  ${appSection}` : "",
    L.spec ? `<h2>Spec</h2>\n  <div class="spec" id="spec">${specHtml}</div>` : "",
    L.design && designSection ? `<h2>${esc(tt("journey.secDesign"))}</h2>\n  ${designSection}` : "",
    L.impl
      ? `<h2>${esc(tt("journey.secImpl"))}</h2>\n  ${implSection}\n  <ul class="history">${history}</ul>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n  ");
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
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 80px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}
h1{font-size:24px;font-weight:650;letter-spacing:-.01em;margin:0}
h2{font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;margin:44px 0 12px}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px;text-decoration:none;white-space:nowrap}
.badge .dot{width:9px;height:9px;border-radius:2px;background:var(--accent)}
.lead{color:var(--muted);margin:6px 0 0}
.spec :is(h1,h2,h3){font-size:17px;font-weight:650;margin:20px 0 8px;text-transform:none;letter-spacing:0;color:var(--fg)}
.spec p{margin:8px 0}
.spec code{background:#efece7;padding:1px 5px;border-radius:4px;font-size:13px}
.spec pre{background:#efece7;padding:12px;border-radius:8px;overflow:auto}
.spec pre code{background:none;padding:0}
.spec ul,.spec ol{padding-left:20px}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px}
.frame{display:block;width:100%;height:520px;margin-top:16px;border:1px solid var(--line);border-radius:10px;background:#fff}
.design{display:block;width:100%;height:480px;margin-top:8px;border:1px solid var(--line);border-radius:10px;background:#fff}
.link{display:inline-block;color:var(--accent);font-weight:600;text-decoration:none;border-bottom:1px solid var(--accent);margin-bottom:10px}
ul.history{list-style:none;padding:0;margin:0}
ul.history li{display:flex;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}
ul.history code{font-size:12px;color:var(--muted)}
ul.history span{flex:1}
ul.history time{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:12px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${safeTitle}</h1>
    ${badge}
  </header>
  <p class="lead">${esc(tt("journey.footerLead"))}</p>

  ${sections}

  <footer>
    ${badge}
    <span>${esc(tt("journey.madeBy"))}</span>
  </footer>
</div>
</body>
</html>`;
}
