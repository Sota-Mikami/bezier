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
 *  injected (before `</body>` when present, else appended). The overlay self-installs
 *  `window.__bzEdit`; issue-design then drives it via direct contentWindow calls. */
export function buildEditableSrcdoc(html: string): string {
  const stripped = stripFramingMeta(html);
  const script = `<script id="${OVERLAY_SCRIPT_ID}">${OVERLAY_JS}</script>`;
  if (/<\/body>/i.test(stripped)) return stripped.replace(/<\/body>/i, `${script}</body>`);
  return stripped + script;
}

/** Remove the overlay's own nodes (injected script + the selection-box host) from a
 *  SERIALIZED mock html string, so the written-back file is clean. The actual edits —
 *  inline styles, text content, reordered nodes — are part of the DOM and remain. */
export function cleanSerializedMock(html: string): string {
  return html
    .replace(new RegExp(`<script id="${OVERLAY_SCRIPT_ID}"[\\s\\S]*?</script>`, "gi"), "")
    // The host carries a CLOSED shadow root, so it serializes with no children:
    // `<div id="__bz_overlay_host" style="…"></div>`. Match that (and a defensive
    // greedy-lazy variant in case a child ever leaks).
    .replace(new RegExp(`<div id="${OVERLAY_HOST_ID}"[^>]*>\\s*</div>`, "gi"), "")
    .replace(new RegExp(`<div id="${OVERLAY_HOST_ID}"[^>]*>[\\s\\S]*?</div>`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
