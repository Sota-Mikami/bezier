import assert from "node:assert/strict";
import { test } from "vitest";

import { en } from "./en";
import { ja } from "./ja";
import { translate } from "./index";
import { LOCALES } from "./locales";

// All registered catalogs, keyed by locale. en is the source of truth.
const CATALOGS: Record<string, unknown> = { en, ja };

// Flatten a nested catalog into "a.b.c" → value. Used to compare key SETS and
// placeholder usage across locales (parity the TS type can't fully police —
// e.g. a translated string that forgot a {placeholder}).
function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
  }
  return out;
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const enFlat = flatten(en);

test("every LOCALES entry has a catalog", () => {
  for (const { code } of LOCALES) {
    assert.ok(CATALOGS[code], `missing catalog for locale "${code}"`);
  }
});

test("each locale has exactly the same keys as en (no missing / no extra)", () => {
  const enKeys = Object.keys(enFlat).sort();
  for (const { code } of LOCALES) {
    const keys = Object.keys(flatten(CATALOGS[code])).sort();
    assert.deepEqual(keys, enKeys, `locale "${code}" key set differs from en`);
  }
});

test("no value is blank, and {placeholders} match en per key", () => {
  for (const { code } of LOCALES) {
    const flat = flatten(CATALOGS[code]);
    for (const [key, value] of Object.entries(flat)) {
      assert.ok(value.trim() !== "", `locale "${code}" has a blank value at "${key}"`);
      assert.deepEqual(
        placeholders(value),
        placeholders(enFlat[key]),
        `locale "${code}" placeholders differ from en at "${key}"`,
      );
    }
  }
});

test("translate falls back to en for an unknown locale and interpolates", () => {
  // @ts-expect-error — exercising the runtime fallback with a non-registered locale.
  assert.equal(translate("xx", "history.latest"), en.history.latest);
  assert.equal(translate("en", "history.nStatesAgo", { n: 3 }), "3 states ago");
  assert.equal(translate("ja", "history.nStatesAgo", { n: 3 }), "3つ前の状態");
});
