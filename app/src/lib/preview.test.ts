import { describe, it, expect } from "vitest";

import { parseDevServerUrl } from "./preview";

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
