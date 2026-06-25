// Editing a design MOCK in place (E-1b). The mock is a self-contained html we own
// (`design/NN-*.html`), so to enable Figma-style visual editing inside its iframe we:
//   1. strip its framing meta (CSP / X-Frame-Options) so an injected <script> can run,
//   2. inject the visual-edit overlay (bezier-overlay) as a <script> tag — NOT via eval,
//      so there's no `unsafe-eval` CSP dependency (the most WKWebView-robust path),
//   3. after editing, serialize the live DOM back to the file (deterministic, no agent),
//      with the overlay's own nodes stripped so the saved html stays clean.
// Pure string helpers — unit-tested; the DOM/iframe wiring lives in issue-design.

import { OVERLAY_JS } from "@/lib/bezier-overlay";

export const OVERLAY_SCRIPT_ID = "__bz_overlay_script";
export const OVERLAY_HOST_ID = "__bz_overlay_host";
export const BRIDGE_SCRIPT_ID = "__bz_bridge_script";

// postMessage bridge (E-1b fix). The EDIT iframe is now OPAQUE (sandbox="allow-scripts",
// no allow-same-origin) — the same proven, WKWebView-robust isolation the VIEW iframe
// uses. With no same-origin, the parent can't read `contentWindow.__bzEdit` directly, so
// this bridge (running INSIDE the iframe next to the overlay) relays both ways over
// postMessage: it drains the overlay's event queue out to the parent, takes method calls
// in, and serializes the edited DOM back on request. Mirrors the webview's eval+drain,
// but origin-independent. (The webview/Preview path is untouched — it still uses eval.)
const BRIDGE_JS = String.raw`(function () {
  function post(m) { try { parent.postMessage(m, "*"); } catch (e) {} }
  setInterval(function () {
    try {
      var b = window.__bzEdit, q = b && b.q;
      if (q && q.length) post({ __bz: "events", events: q.splice(0) });
    } catch (e) {}
  }, 100);
  window.addEventListener("message", function (e) {
    var d = e && e.data;
    if (!d || !d.__bz) return;
    try {
      if (d.__bz === "call") {
        var fn = window.__bzEdit && window.__bzEdit[d.method];
        if (typeof fn === "function") fn.apply(null, d.args || []);
      } else if (d.__bz === "serialize") {
        if (window.__bzEdit && window.__bzEdit.deactivate) window.__bzEdit.deactivate();
        post({ __bz: "html", html: "<!DOCTYPE html>\n" + document.documentElement.outerHTML });
      }
    } catch (e) {}
  });
})();`;

/** Strip `<meta http-equiv="content-security-policy">` and `x-frame-options` from the
 *  mock html so a same-origin injected script can run. Safe: the mock is our own
 *  throwaway artifact (not the user's app). Case-insensitive; leaves all else intact. */
export function stripFramingMeta(html: string): string {
  return html.replace(
    /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi,
    "",
  );
}

/** Build the srcdoc for an EDITABLE mock: framing meta stripped + the overlay script
 *  AND the postMessage bridge injected (before `</body>` when present, else appended).
 *  The overlay self-installs `window.__bzEdit`; the bridge relays it to the parent over
 *  postMessage (the iframe is opaque, so no direct contentWindow access). */
export function buildEditableSrcdoc(html: string): string {
  const stripped = stripFramingMeta(html);
  const inject =
    `<script id="${OVERLAY_SCRIPT_ID}">${OVERLAY_JS}</script>` +
    `<script id="${BRIDGE_SCRIPT_ID}">${BRIDGE_JS}</script>`;
  if (/<\/body>/i.test(stripped)) return stripped.replace(/<\/body>/i, `${inject}</body>`);
  return stripped + inject;
}

/** Remove the overlay's own nodes (injected script + the selection-box host) from a
 *  SERIALIZED mock html string, so the written-back file is clean. The actual edits —
 *  inline styles, text content, reordered nodes — are part of the DOM and remain. */
export function cleanSerializedMock(html: string): string {
  return html
    .replace(new RegExp(`<script id="${OVERLAY_SCRIPT_ID}"[\\s\\S]*?</script>`, "gi"), "")
    .replace(new RegExp(`<script id="${BRIDGE_SCRIPT_ID}"[\\s\\S]*?</script>`, "gi"), "")
    // The host carries a CLOSED shadow root, so it serializes with no children:
    // `<div id="__bz_overlay_host" style="…"></div>`. Match that (and a defensive
    // greedy-lazy variant in case a child ever leaks).
    .replace(new RegExp(`<div id="${OVERLAY_HOST_ID}"[^>]*>\\s*</div>`, "gi"), "")
    .replace(new RegExp(`<div id="${OVERLAY_HOST_ID}"[^>]*>[\\s\\S]*?</div>`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
