import assert from "node:assert/strict";
import { test } from "vitest";

import { parseSpecCriteria } from "./qa.ts";

test("parseSpecCriteria: extracts checkbox criteria + their 根拠 line", () => {
  const spec = [
    "# Spec",
    "",
    "## 受入基準",
    "- [ ] ログインできる",
    "  - 根拠: `src/auth/login.tsx` に実装",
    "- [x] メンバー一覧が表示される",
    "これは基準ではない普通の行",
  ].join("\n");

  const items = parseSpecCriteria(spec);
  assert.equal(items.length, 2);

  assert.equal(items[0].scenario, "ログインできる");
  assert.equal(items[0].status, "todo");
  assert.equal(items[0].note, "`src/auth/login.tsx` に実装");
  assert.equal(items[0].priority, "P1");

  assert.equal(items[1].scenario, "メンバー一覧が表示される");
  assert.equal(items[1].status, "pass");
  assert.equal(items[1].note, "");
});

test("parseSpecCriteria: no criteria → empty", () => {
  assert.deepEqual(parseSpecCriteria("# Spec\n\nただの本文。"), []);
});
