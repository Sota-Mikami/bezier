import assert from "node:assert/strict";
import { test } from "vitest";

import { parseSpecCriteria, qaToMarkdown, type QaItem } from "./qa.ts";

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

test("parseSpecCriteria: also parses the English 'evidence:' line (DEC-108)", () => {
  const spec = [
    "## Acceptance criteria",
    "- [x] Can log in",
    "  - evidence: implemented in `src/auth/login.tsx`",
  ].join("\n");
  const items = parseSpecCriteria(spec);
  assert.equal(items.length, 1);
  assert.equal(items[0].scenario, "Can log in");
  assert.equal(items[0].note, "implemented in `src/auth/login.tsx`");
});

test("parseSpecCriteria: no criteria → empty", () => {
  assert.deepEqual(parseSpecCriteria("# Spec\n\nただの本文。"), []);
});

test("qaToMarkdown: renders a committed-friendly table + escapes pipes/newlines", () => {
  const items: QaItem[] = [
    { id: "1", status: "pass", priority: "P0", area: "/login", scenario: "can log in", expected: "lands on home", note: "" },
    { id: "2", status: "todo", priority: "P1", area: "/x", scenario: "a | b", expected: "line1\nline2", note: "n" },
  ];
  const md = qaToMarkdown(items);
  const lines = md.split("\n");
  assert.equal(lines[0], "| Status | Priority | Area | Case | Expected | Basis |");
  assert.equal(lines[1], "| --- | --- | --- | --- | --- | --- |");
  assert.equal(lines[2], "| PASS | P0 | /login | can log in | lands on home |  |");
  // a pipe in a cell is escaped, a newline is flattened (so the table stays valid)
  assert.equal(lines[3], "| TODO | P1 | /x | a \\| b | line1 line2 | n |");
});
