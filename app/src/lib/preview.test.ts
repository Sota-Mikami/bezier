import { describe, it, expect } from "vitest";

import {
  parseDevServerUrl,
  buildDevCommand,
  verdictFor,
  isLoopbackUrl,
  type HttpProbeResult,
} from "./preview";

describe("parseDevServerUrl", () => {
  it("reads the Next.js Local URL", () => {
    const out = "  ▲ Next.js 15.0.0\n  - Local:        http://localhost:3000\n";
    expect(parseDevServerUrl(out)).toEqual({ port: 3000, url: "http://localhost:3000/" });
  });

  it("reads the Vite Local URL", () => {
    expect(parseDevServerUrl("  ➜  Local:   http://localhost:5173/")?.port).toBe(5173);
  });

  it("reads the Astro Local URL", () => {
    expect(parseDevServerUrl("┃ Local    http://localhost:4321/")?.port).toBe(4321);
  });

  it("reads a 127.0.0.1 host", () => {
    expect(parseDevServerUrl("listening on http://127.0.0.1:8080")?.port).toBe(8080);
  });

  it("takes the LAST URL (server reprints after auto-incrementing on a clash)", () => {
    const out =
      "Port 3000 is in use, trying 3001 instead.\n- Local: http://localhost:3001\n";
    expect(parseDevServerUrl(out)?.port).toBe(3001);
  });

  it("ignores Bezier's own dev port (3210)", () => {
    expect(parseDevServerUrl("http://localhost:3210/_next/...")).toBeNull();
    // 3210 is skipped but a real server URL still wins.
    expect(parseDevServerUrl("http://localhost:3210\nLocal: http://localhost:3000")?.port).toBe(
      3000,
    );
  });

  it("ignores a non-loopback (LAN) address", () => {
    expect(parseDevServerUrl("Network: http://192.168.1.20:3000/")).toBeNull();
  });

  it("returns null when no URL is present", () => {
    expect(parseDevServerUrl("Compiling...\n")).toBeNull();
  });
});

describe("buildDevCommand (DEC-125 port de-dup)", () => {
  const cfg = (devCommand: string, port = 4110) => ({ devCommand, port, packageDir: "" });

  it("appends the port flag for Next when none is present", () => {
    expect(buildDevCommand(cfg("next dev"), "next")).toBe("next dev -p 4110");
  });

  it("appends with `--` for an npm-wrapped command", () => {
    expect(buildDevCommand(cfg("npm run dev"), "next")).toBe("npm run dev -- -p 4110");
  });

  it("does NOT duplicate when the command already hardcodes -p", () => {
    const c = "npx tool || true; next dev -p 4001 --turbo";
    expect(buildDevCommand(cfg(c), "next")).toBe(c);
  });

  it("does NOT duplicate for --port= form (vite)", () => {
    expect(buildDevCommand(cfg("vite --port=5173"), "vite")).toBe("vite --port=5173");
  });

  it("leaves an unknown framework alone (no port flag to inject)", () => {
    expect(buildDevCommand(cfg("./scripts/dev.sh"), null)).toBe("./scripts/dev.sh");
  });

  it("appends directly (no `--`) for a compound command ending in next", () => {
    // `--` would mis-target the flag; it must attach to the trailing `next dev`.
    expect(buildDevCommand(cfg("npm run lingui:compile && npx next dev"), "next")).toBe(
      "npm run lingui:compile && npx next dev -p 4110",
    );
  });
});

describe("verdictFor (DEC-125)", () => {
  const p = (o: Partial<HttpProbeResult>): HttpProbeResult => ({
    status: 200,
    frameBlocked: false,
    contentType: "text/html",
    bodyLen: 5000,
    ...o,
  });

  it("200 HTML with content → ok (null)", () => {
    expect(verdictFor(p({}))).toBeNull();
  });
  it("404 → notFound", () => {
    expect(verdictFor(p({ status: 404 }))).toBe("notFound");
  });
  it("401/403 (auth-gated) → notFound", () => {
    expect(verdictFor(p({ status: 401 }))).toBe("notFound");
    expect(verdictFor(p({ status: 403 }))).toBe("notFound");
  });
  it("500 → serverError", () => {
    expect(verdictFor(p({ status: 503 }))).toBe("serverError");
  });
  it("3xx redirect → null (the final URL drives)", () => {
    expect(verdictFor(p({ status: 302 }))).toBeNull();
  });
  it("200 but empty body → empty", () => {
    expect(verdictFor(p({ bodyLen: 0 }))).toBe("empty");
  });
  it("200 JSON (API-only) → empty", () => {
    expect(verdictFor(p({ contentType: "application/json", bodyLen: 9000 }))).toBe("empty");
  });
});

describe("isLoopbackUrl (DEC-129 attach mode)", () => {
  it("accepts loopback http(s) URLs", () => {
    expect(isLoopbackUrl("http://localhost:3000")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:4001/path")).toBe(true);
    expect(isLoopbackUrl("https://localhost:8443")).toBe(true);
  });
  it("rejects remote / non-http URLs", () => {
    expect(isLoopbackUrl("https://staging.example.com")).toBe(false);
    expect(isLoopbackUrl("http://192.168.1.20:3000")).toBe(false);
    expect(isLoopbackUrl("ftp://localhost")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
    expect(isLoopbackUrl("")).toBe(false);
  });
});
