import assert from "node:assert/strict";
import { test } from "vitest";

import {
  deriveState,
  slugify,
  issueFolderName,
  ISSUE_STATUSES,
  documentLabel,
  documentRank,
} from "./issue-domain.ts";

test("deriveState: merged always wins (done)", () => {
  assert.equal(
    deriveState({ status: "merged", running: true, hasPr: true }),
    "done",
  );
});

test("deriveState: running beats PR and worktree", () => {
  assert.equal(
    deriveState({ status: "in-progress", running: true, hasPr: true }),
    "running",
  );
});

test("deriveState: open PR (not running) -> review", () => {
  assert.equal(
    deriveState({ status: "in-progress", running: false, hasPr: true }),
    "review",
  );
});

test("deriveState: worktree without PR/run -> draft", () => {
  assert.equal(
    deriveState({
      status: "open",
      running: false,
      hasPr: false,
      hasWorktree: true,
    }),
    "draft",
  );
});

test("deriveState: in-progress status implies started -> draft when hasWorktree unknown", () => {
  assert.equal(
    deriveState({ status: "in-progress", running: false, hasPr: false }),
    "draft",
  );
});

test("deriveState: untouched open issue -> idea", () => {
  assert.equal(
    deriveState({ status: "open", running: false, hasPr: false }),
    "idea",
  );
});

test("slugify: lowercases and kebab-cases ascii", () => {
  assert.equal(slugify("Hello World"), "hello-world");
  assert.equal(slugify("UPPER  Case"), "upper-case");
  assert.equal(slugify("already-kebab"), "already-kebab");
});

test("slugify: strips symbols and trims dashes", () => {
  assert.equal(slugify("  Spaces & Symbols!! "), "spaces-symbols");
  assert.equal(slugify("--leading and trailing--"), "leading-and-trailing");
});

test("slugify: non-ascii collapses to empty (DEC-091: no -untitled noise)", () => {
  assert.equal(slugify("日本語タイトル"), "");
  assert.equal(slugify(""), "");
});

test("issueFolderName: appends slug only when present (DEC-091)", () => {
  assert.equal(issueFolderName("01ABC", "my-slug"), "01ABC-my-slug");
  assert.equal(issueFolderName("01ABC", ""), "01ABC");
});

test("ISSUE_STATUSES lists the three persisted statuses", () => {
  assert.deepEqual(ISSUE_STATUSES, ["open", "in-progress", "merged"]);
});

test("documentLabel: known stems map, unknown stems humanize", () => {
  // Default locale in tests is English (DEC-108).
  assert.equal(documentLabel("spec"), "Spec");
  assert.equal(documentLabel("qa"), "QA");
  assert.equal(documentLabel("decision"), "Decision");
  assert.equal(documentLabel("handoff"), "Handoff");
  assert.equal(documentLabel("design-notes"), "Design Notes");
});

test("documentRank: spec leads, known types ordered, ad-hoc after", () => {
  assert.equal(documentRank("spec"), 0);
  assert.ok(documentRank("qa") < documentRank("custom"));
  assert.equal(documentRank("whatever"), 100);
});
