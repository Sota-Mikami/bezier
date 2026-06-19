import { describe, it, expect } from "vitest";

import { sanitizeLogTail } from "./prompts";

// SEC-3 (DEC-130): the dev-server log tail pasted into the "fix with agent" prompt
// is attacker-influenceable (a hostile repo prints anything to stdout). We can't
// neutralize prompt-injection (the agent must read the log), but we DO cap size and
// redact obvious secret shapes so they don't leak into a shared handoff/PR.
//
// NOTE: the synthetic "secrets" below are assembled from fragments at runtime so the
// repo's secret scanner (gitleaks) doesn't flag the test fixtures as real leaks.
const j = (...parts: string[]) => parts.join("");

describe("sanitizeLogTail (SEC-3)", () => {
  it("returns empty for blank input", () => {
    expect(sanitizeLogTail("")).toBe("");
    expect(sanitizeLogTail("   \n  ")).toBe("");
  });

  it("passes through ordinary log lines untouched", () => {
    const log = "Compiling...\n✓ ready on http://localhost:3000\nGET / 200 in 12ms";
    expect(sanitizeLogTail(log)).toBe(log);
  });

  it("redacts KEY=value secret shapes (keeps the key name)", () => {
    const secret = j("sk-", "abcdef", "123456789");
    const out = sanitizeLogTail(`OPENAI_API_KEY=${secret} loaded`);
    expect(out).toContain("OPENAI_API_KEY=");
    expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it("redacts a STRIPE_SECRET and a DATABASE_PASSWORD", () => {
    const tok = j("rk_", "live_", "9999aaaa");
    const pw = j("hunter2", "hunter2");
    const out = sanitizeLogTail(`STRIPE_SECRET: ${tok}\nDATABASE_PASSWORD = ${pw}`);
    expect(out).not.toContain(tok);
    expect(out).not.toContain(pw);
  });

  it("redacts Authorization: Bearer tokens", () => {
    const tok = j("abc.", "def.", "ghi-jkl_", "mno");
    const out = sanitizeLogTail(`Authorization: Bearer ${tok}`);
    expect(out).not.toContain(tok);
    expect(out).toContain("[redacted]");
  });

  it("redacts well-known standalone token prefixes", () => {
    const tok = j("sk-ant-", "api03-", "AAAA1111", "BBBB2222");
    const out = sanitizeLogTail(`token ${tok} used`);
    expect(out).not.toContain(tok);
  });

  it("redacts a JWT", () => {
    const jwt = j("eyJhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".", "dozjgNryP4J3jVmNHl0w5N");
    expect(sanitizeLogTail(`session ${jwt}`)).not.toContain(jwt);
  });

  it("hard-caps very long output, keeping the tail (where the error is)", () => {
    const long = "x".repeat(6000) + "\nFATAL: boom at the end";
    const out = sanitizeLogTail(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("FATAL: boom at the end");
    expect(out).toContain("truncated");
  });
});
