import { describe, it, expect } from "vitest";
import {
  deriveTerrain,
  describeTerrain,
  terrainForAgent,
  type TerrainFacts,
} from "./loop-state";

const facts = (over: Partial<TerrainFacts> = {}): TerrainFacts => ({
  specChars: 0,
  criteriaCount: 0,
  designCount: 0,
  hasImplementation: false,
  isShared: false,
  prOpened: false,
  ...over,
});

describe("deriveTerrain", () => {
  it("a fresh issue is empty", () => {
    const t = deriveTerrain(facts());
    expect(t.isEmpty).toBe(true);
    expect(t.hasSpec).toBe(false);
  });

  it("a stub spec does not count as hasSpec", () => {
    expect(deriveTerrain(facts({ specChars: 10 })).hasSpec).toBe(false);
    expect(deriveTerrain(facts({ specChars: 200 })).hasSpec).toBe(true);
  });

  it("criteria imply hasCriteria, and any real artifact clears isEmpty", () => {
    const t = deriveTerrain(facts({ specChars: 200, criteriaCount: 3 }));
    expect(t.hasCriteria).toBe(true);
    expect(t.isEmpty).toBe(false);
  });

  it("designs alone (no spec) still clear isEmpty — non-linear, no gate", () => {
    const t = deriveTerrain(facts({ designCount: 2 }));
    expect(t.isEmpty).toBe(false);
    expect(t.designCount).toBe(2);
    expect(t.hasSpec).toBe(false);
  });

  it("clamps a negative/fractional design count", () => {
    expect(deriveTerrain(facts({ designCount: -1 })).designCount).toBe(0);
    expect(deriveTerrain(facts({ designCount: 2.9 })).designCount).toBe(2);
  });
});

describe("describeTerrain", () => {
  it("empty terrain reads as 'starting' / 'これから'", () => {
    const t = deriveTerrain(facts());
    expect(describeTerrain(t, "en")).toBe("starting");
    expect(describeTerrain(t, "ja")).toBe("これから");
  });

  it("lists what exists, in loop order, with no completion implied", () => {
    const t = deriveTerrain(
      facts({ specChars: 200, designCount: 2, hasImplementation: true, isShared: true, prOpened: true }),
    );
    expect(describeTerrain(t, "en")).toBe("Spec · 2 designs · implementing · shared · PR");
    expect(describeTerrain(t, "ja")).toBe("Spec ・ デザイン2案 ・ 実装 ・ 共有済 ・ PR");
  });

  it("singular vs plural design label (en)", () => {
    expect(describeTerrain(deriveTerrain(facts({ designCount: 1 })), "en")).toBe("1 design");
  });
});

describe("terrainForAgent", () => {
  it("renders a grounded snapshot that names what exists and asks for ONE next move", () => {
    const lines = terrainForAgent(
      deriveTerrain(facts({ specChars: 200, criteriaCount: 2, designCount: 1 })),
      "en",
    );
    const text = lines.join("\n");
    expect(text).toMatch(/Where things stand/);
    expect(text).toMatch(/acceptance criteria present/);
    expect(text).toMatch(/Design explorations \(html\): 1/);
    expect(text).toMatch(/ONE next-move/);
    expect(text).toMatch(/forward or backward/);
  });

  it("ja snapshot is structurally parallel", () => {
    const text = terrainForAgent(deriveTerrain(facts({ specChars: 200 })), "ja").join("\n");
    expect(text).toMatch(/現在地/);
    expect(text).toMatch(/next move/);
  });
});
