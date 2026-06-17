import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";

import { buildJourneyHtml, type JourneyData } from "./journey.ts";
import { SHARE_SCRIPT } from "./journey-script.ts";

const base: JourneyData = {
  title: "Share <script>alert(1)</script>",
  design: [
    {
      kind: "doc",
      label: "Spec",
      md: [
        "# Spec",
        "",
        "Raw <img src=x onerror=alert(1)> should not execute.",
        "",
        "- **done** and `code`",
        "",
        "```",
        "</script><script>alert(1)</script>",
        "```",
      ].join("\n"),
    },
    {
      kind: "html",
      label: "01",
      html: "<script>window.evil=1</script><main>Design</main>",
    },
  ],
  prototype: [
    { kind: "preview", label: "Preview", appUrl: "https://safe-preview.vercel.app" },
  ],
};

test("buildJourneyHtml escapes doc markdown and avoids runtime markdown execution", () => {
  const html = buildJourneyHtml(base);

  assert.equal(html.includes("cdn.jsdelivr.net/npm/marked"), false);
  assert.equal(html.includes("window.marked"), false);
  // The ONLY script is the hash-pinned keyboard handler; nothing manipulates
  // innerHTML or evaluates page content.
  assert.equal(html.includes("innerHTML"), false);
  assert.equal(html.includes("<img src=x onerror=alert(1)>"), false);
  assert.equal(html.includes("&lt;img src=x onerror=alert(1)&gt;"), true);
  assert.equal(html.includes("</script><script>alert(1)</script>"), false);
});

test("buildJourneyHtml emits CSP and sandboxed embeds", () => {
  const html = buildJourneyHtml(base);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin allow-forms"/);
  assert.match(html, /<iframe class="design" sandbox=""/);
  assert.equal(html.includes("allow-popups"), false);
});

test("buildJourneyHtml rejects non-https app URLs", () => {
  const html = buildJourneyHtml({
    ...base,
    prototype: [{ kind: "preview", label: "Preview", appUrl: "javascript:alert(1)" }],
  });

  assert.equal(html.includes("javascript:alert(1)"), false);
  // A rejected (non-https) URL must produce no "open app" CTA (locale-independent).
  assert.equal(html.includes('class="cta"'), false);
});

test("buildJourneyHtml allows only the hash-pinned keyboard script (no 'unsafe-inline')", () => {
  const html = buildJourneyHtml(base);
  const hash = `sha256-${createHash("sha256").update(SHARE_SCRIPT, "utf8").digest("base64")}`;
  // The exact script is embedded, and the CSP whitelists it by hash — so this one
  // script runs but any injected inline script (different bytes) cannot.
  assert.equal(html.includes(`<script>${SHARE_SCRIPT}</script>`), true);
  assert.match(html, new RegExp(`script-src '${hash.replace(/[+/=]/g, "\\$&")}'`));
  assert.equal(html.includes("'unsafe-inline'") && /script-src[^;]*'unsafe-inline'/.test(html), false);
});

test("buildJourneyHtml renders task lists as checkboxes (no bullet, no literal [ ])", () => {
  const html = buildJourneyHtml({
    ...base,
    design: [
      {
        kind: "doc",
        label: "Spec",
        md: ["- [ ] open item", "- [x] done item", "  - nested bullet"].join("\n"),
      },
    ],
  });
  // No literal markdown checkbox syntax leaks through.
  assert.equal(html.includes("[ ]"), false);
  assert.equal(html.includes("[x]"), false);
  // Task items get the checkbox class; the checked one is marked `on`.
  assert.match(html, /<li class="task"><span class="chk">/);
  assert.match(html, /<li class="task"><span class="chk on">/);
  // The indented sub-bullet opens a nested list (indentation preserved).
  assert.match(html, /<ul>[\s\S]*<ul>/);
});

test("buildJourneyHtml shows a segmented control only when both segments exist", () => {
  // Design-only → no segment bar.
  const designOnly = buildJourneyHtml({ ...base, prototype: [] });
  assert.equal(designOnly.includes('class="segbar"'), false);
  // Both → a segment bar with both labels.
  const both = buildJourneyHtml(base);
  assert.match(both, /class="segbar"/);
});
