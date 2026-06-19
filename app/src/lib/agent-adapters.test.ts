import { describe, it, expect } from "vitest";

import {
  buildLaunch,
  adapterForId,
  customAdapter,
  CLAUDE_ADAPTER,
  CODEX_ADAPTER,
} from "./agent-adapters";

const CTX = {
  prompt: "do the thing",
  contextDir: "/repo/.bezier/issues/01ABC",
  eventsPath: "/repo/.bezier/agent-events/01ABC",
  theme: "dark" as const,
  cwd: "/repo/wt",
};

describe("buildLaunch — claude (DEC-132)", () => {
  it("orders prompt FIRST, then --continue, --settings, --add-dir LAST", () => {
    const b = buildLaunch(CLAUDE_ADAPTER, "/usr/bin/claude", { ...CTX, resume: true });
    expect(b.cmd).toBe("/usr/bin/claude");
    // prompt is argv[0]
    expect(b.args[0]).toBe("do the thing");
    // --add-dir is last with the dir as the only trailing arg (variadic-safe)
    expect(b.args[b.args.length - 2]).toBe("--add-dir");
    expect(b.args[b.args.length - 1]).toBe(CTX.contextDir);
    expect(b.args).toContain("--continue");
    const si = b.args.indexOf("--settings");
    expect(si).toBeGreaterThan(0);
    expect(b.args[si + 1]).toContain("hooks"); // the agentHookSettings JSON
    expect(b.notify).toBe("hooks");
    expect(b.eventsPath).toBe(CTX.eventsPath);
    expect(b.initialInput).toBeUndefined();
  });

  it("omits --continue when not resuming", () => {
    const b = buildLaunch(CLAUDE_ADAPTER, "claude", { ...CTX, resume: false });
    expect(b.args).not.toContain("--continue");
  });
});

describe("buildLaunch — codex (idle, no resume, fold context)", () => {
  it("passes the prompt positionally with the spec dir folded in; no claude flags", () => {
    const b = buildLaunch(CODEX_ADAPTER, "/usr/bin/codex", { ...CTX, resume: true });
    expect(b.args).not.toContain("--continue");
    expect(b.args).not.toContain("--add-dir");
    expect(b.args).not.toContain("--settings");
    expect(b.args[0]).toContain("do the thing");
    expect(b.args[0]).toContain(CTX.contextDir); // folded into the prompt
    expect(b.notify).toBe("idle");
    expect(b.eventsPath).toBeUndefined();
  });
});

describe("buildLaunch — custom agent (any CLI)", () => {
  it("substitutes {prompt}/{cwd} as whole tokens", () => {
    const a = customAdapter({ id: "mycli", name: "My CLI", bin: "mycli", argv: ["run", "--cwd", "{cwd}", "{prompt}"] });
    const b = buildLaunch(a, "mycli", CTX);
    expect(b.args).toEqual(["run", "--cwd", "/repo/wt", expect.stringContaining("do the thing")]);
    expect(b.initialInput).toBeUndefined(); // {prompt} present → no stdin seed
  });

  it("falls back to stdin seed when the template has no {prompt}", () => {
    const a = customAdapter({ id: "x", name: "X", bin: "x", argv: ["chat"] });
    const b = buildLaunch(a, "x", CTX);
    expect(b.args).toEqual(["chat"]);
    expect(b.initialInput).toContain("do the thing");
  });
});

describe("adapterForId", () => {
  it("resolves built-ins and custom agents, falls back for unknown ids", () => {
    expect(adapterForId("claude").id).toBe("claude");
    const customs = [{ id: "c1", name: "C1", bin: "c1", argv: ["{prompt}"] }];
    expect(adapterForId("c1", customs).name).toBe("C1");
    const unknown = adapterForId("nope");
    expect(unknown.id).toBe("nope");
    expect(unknown.notify).toBe("idle"); // generic fallback is safe (no claude flags)
    expect(unknown.resume).toBeNull();
  });
});
