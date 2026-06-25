import assert from "node:assert/strict";
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
  assert.match(html, /<iframe class="design" sandbox="allow-scripts"/);
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

test("buildJourneyHtml runs design prototypes in an isolated, script-enabled sandbox (DEC-143)", () => {
  const html = buildJourneyHtml(base);
  // The keyboard handler still runs (now via 'unsafe-inline', so isolated design
  // tabs can run their own inline JS — hash + 'unsafe-inline' are mutually exclusive).
  assert.equal(html.includes(`<script>${SHARE_SCRIPT}</script>`), true);
  assert.match(html, /script-src 'unsafe-inline'/);
  // The real guard is ISOLATION: the design iframe is sandboxed WITHOUT same-origin
  // (opaque origin → no parent/password/storage), and inherited `default-src 'none'`
  // blocks fetch/forms/top-nav. Granting same-origin here would break that.
  assert.match(html, /<iframe class="design" sandbox="allow-scripts"/);
  assert.equal(/<iframe class="design" sandbox="allow-scripts allow-same-origin/.test(html), false);
  assert.match(html, /default-src 'none'/);
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

test("buildJourneyHtml renders italic, underscore-italic, and strikethrough", () => {
  const html = buildJourneyHtml({
    ...base,
    design: [
      { kind: "doc", label: "Spec", md: "This is *italic*, _also_, and ~~struck~~ text." },
    ],
  });
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<em>also<\/em>/);
  assert.match(html, /<del>struck<\/del>/);
  // snake_case identifiers must NOT become italic.
  const sc = buildJourneyHtml({
    ...base,
    design: [{ kind: "doc", label: "Spec", md: "use my_var_name here" }],
  });
  assert.equal(sc.includes("<em>"), false);
});

test("buildJourneyHtml builds an indented ToC for docs with ≥2 headings", () => {
  const html = buildJourneyHtml({
    ...base,
    design: [{ kind: "doc", label: "Spec", md: ["# Top", "## Sub A", "### Deep"].join("\n") }],
  });
  assert.match(html, /class="toc"/);
  assert.match(html, /<a class="toc-i lv1" href="#h-0">Top<\/a>/);
  assert.match(html, /<a class="toc-i lv2" href="#h-1">Sub A<\/a>/);
  assert.match(html, /<a class="toc-i lv3" href="#h-2">Deep<\/a>/);
  assert.match(html, /<h1 id="h-0">/);
  assert.match(html, /<h2 id="h-1">/);
});

test("buildJourneyHtml omits the ToC when a doc has <2 headings", () => {
  const html = buildJourneyHtml({
    ...base,
    design: [{ kind: "doc", label: "Spec", md: "# Only one\n\nbody text" }],
  });
  assert.equal(html.includes('class="toc"'), false);
});

test("buildJourneyHtml uses a wide prototype layout and drops the maker lead", () => {
  const html = buildJourneyHtml(base);
  assert.match(html, /class="topbar"/);
  assert.match(html, /<main class="page">/);
  assert.equal(html.includes('class="lead"'), false);
  assert.equal(html.includes("a record of how it was made"), false);
});

test("buildJourneyHtml shows a segmented control only when both segments exist", () => {
  // Design-only → no segment bar.
  const designOnly = buildJourneyHtml({ ...base, prototype: [] });
  assert.equal(designOnly.includes('class="segbar"'), false);
  // Both → a segment bar with both labels.
  const both = buildJourneyHtml(base);
  assert.match(both, /class="segbar"/);
});
