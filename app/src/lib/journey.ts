// Journey page (DEC-094) — a self-contained, shareable HTML page that shows the
// MAKER process behind a change (Spec → 実装の履歴 → the running App), not just
// the output. Bezier GENERATES this HTML, so it can carry the "Made with Bezier"
// badge; code is linked to git, never hosted (DEC-094). Markdown is rendered
// client-side via a CDN `marked` (the page is served online).

import type { Checkpoint } from "./git";

export interface JourneyData {
  title: string;
  specMd: string;
  checkpoints: Checkpoint[];
  /** The published app URL (Vercel), if the app was shared. */
  appUrl: string | null;
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  // The spec is placed in a markdown script block (no HTML execution); a literal
  // </script> is neutralized so it can't break out. NOTE: it is rendered
  // client-side by `marked` WITHOUT sanitization — raw HTML in the spec executes
  // in the viewer's browser. The spec is the user's OWN content shown to people
  // they chose to share with (same posture as GitHub README rendering); no
  // third-party injection path. If specs ever accept untrusted input, add
  // DOMPurify here.
  const specForScript = (data.specMd || "*(spec はまだありません)*").replace(
    /<\/script>/gi,
    "<\\/script>",
  );

  const appSection = appUrl
    ? `<a class="cta" href="${esc(appUrl)}" target="_blank" rel="noopener">アプリを開く →</a>
       <iframe class="frame" src="${esc(appUrl)}" title="app preview" loading="lazy"></iframe>`
    : `<p class="muted">まだアプリは公開されていません。「共有」で公開すると、ここに表示されます。</p>`;

  const history = data.checkpoints.length
    ? data.checkpoints
        .map(
          (c) =>
            `<li><code>${esc(c.short)}</code><span>${esc(c.subject)}</span><time>${fmtDate(c.iso)}</time></li>`,
        )
        .join("\n")
    : `<li class="muted">履歴はまだありません。</li>`;

  const designSection = data.designHtml
    ? `<iframe class="design" sandbox="allow-same-origin allow-scripts" title="design" srcdoc="${data.designHtml.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe>`
    : "";
  const implLink = data.prUrl ?? githubBranchUrl(data.repoUrl, data.branch);
  const implSection = implLink
    ? `<a class="link" href="${esc(implLink)}" target="_blank" rel="noopener">${data.prUrl ? "PR を見る" : "GitHub で見る"} →</a>`
    : "";

  const badge = `<span class="badge"><span class="dot"></span>Made with Bezier</span>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
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
  <p class="lead">Spec → 実装 → アプリ。「出来上がり」だけでなく、どう作ったかの記録です。</p>

  <h2>アプリ</h2>
  ${appSection}

  <h2>Spec</h2>
  <div class="spec" id="spec"></div>

  ${designSection ? `<h2>デザイン</h2>\n  ${designSection}` : ""}

  <h2>実装</h2>
  ${implSection}
  <ul class="history">${history}</ul>

  <footer>
    ${badge}
    <span>このページは Bezier が生成しました</span>
  </footer>
</div>
<script type="text/markdown" id="spec-src">${specForScript}</script>
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<script>
(function(){
  var src=document.getElementById('spec-src').textContent;
  var el=document.getElementById('spec');
  try{ el.innerHTML = (window.marked && window.marked.parse) ? window.marked.parse(src) : src; }
  catch(e){ el.textContent = src; }
})();
</script>
</body>
</html>`;
}
