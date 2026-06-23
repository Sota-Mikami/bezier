import { describe, it, expect } from "vitest";
import {
  stripFramingMeta,
  buildEditableSrcdoc,
  cleanSerializedMock,
  OVERLAY_SCRIPT_ID,
  OVERLAY_HOST_ID,
} from "./mock-edit";

describe("stripFramingMeta", () => {
  it("removes a CSP meta (any quote/attr order)", () => {
    const html = `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><title>x</title></head>`;
    const out = stripFramingMeta(html);
    expect(out).not.toMatch(/Content-Security-Policy/i);
    expect(out).toMatch(/<title>x<\/title>/);
  });

  it("removes X-Frame-Options too, leaves other meta intact", () => {
    const html = `<meta charset="utf-8"><meta http-equiv='X-Frame-Options' content='DENY'>`;
    const out = stripFramingMeta(html);
    expect(out).toMatch(/charset="utf-8"/);
    expect(out).not.toMatch(/X-Frame-Options/i);
  });

  it("is a no-op when there's no framing meta", () => {
    const html = `<div>hi</div>`;
    expect(stripFramingMeta(html)).toBe(html);
  });
});

describe("buildEditableSrcdoc", () => {
  it("injects the overlay script before </body>", () => {
    const html = `<html><body><h1>t</h1></body></html>`;
    const out = buildEditableSrcdoc(html);
    expect(out).toMatch(new RegExp(`<script id="${OVERLAY_SCRIPT_ID}">`));
    // script must sit INSIDE body (before its close)
    expect(out.indexOf(OVERLAY_SCRIPT_ID)).toBeLessThan(out.indexOf("</body>"));
  });

  it("appends when there's no </body>", () => {
    const html = `<h1>t</h1>`;
    const out = buildEditableSrcdoc(html);
    expect(out.startsWith("<h1>t</h1>")).toBe(true);
    expect(out).toMatch(new RegExp(`<script id="${OVERLAY_SCRIPT_ID}">`));
  });

  it("strips framing meta as part of building", () => {
    const html = `<head><meta http-equiv="content-security-policy" content="default-src 'none'"></head><body></body>`;
    expect(buildEditableSrcdoc(html)).not.toMatch(/content-security-policy/i);
  });
});

describe("cleanSerializedMock", () => {
  it("removes the injected overlay script", () => {
    const html = `<body><h1>t</h1><script id="${OVERLAY_SCRIPT_ID}">var a=1;</script></body>`;
    const out = cleanSerializedMock(html);
    expect(out).not.toMatch(/__bz_overlay_script/);
    expect(out).toMatch(/<h1>t<\/h1>/);
  });

  it("removes the overlay host (empty, closed shadow root)", () => {
    const html = `<html><body><p>keep</p></body><div id="${OVERLAY_HOST_ID}" style="position:fixed;inset:0"></div></html>`;
    const out = cleanSerializedMock(html);
    expect(out).not.toMatch(/__bz_overlay_host/);
    expect(out).toMatch(/<p>keep<\/p>/);
  });

  it("keeps the actual edits (inline styles, text)", () => {
    const html = `<body><h1 style="color: rgb(255, 0, 0);">edited</h1><script id="${OVERLAY_SCRIPT_ID}">x</script><div id="${OVERLAY_HOST_ID}"></div></body>`;
    const out = cleanSerializedMock(html);
    expect(out).toMatch(/style="color: rgb\(255, 0, 0\);"/);
    expect(out).toMatch(/edited/);
    expect(out).not.toMatch(/__bz_overlay/);
  });
});
