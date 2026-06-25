import assert from "node:assert/strict";
import { test } from "vitest";

import { zipSync } from "./zip.ts";

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Minimal STORE-zip reader: walk the local file headers (sizes are in the header
// since there's no compression) and recover name -> text.
function unzip(buf: Uint8Array): Record<string, string> {
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  let o = 0;
  while (o + 4 <= buf.length && u32(buf, o) === 0x04034b50) {
    const compSize = u32(buf, o + 18);
    const nameLen = u16(buf, o + 26);
    const extraLen = u16(buf, o + 28);
    const name = dec.decode(buf.slice(o + 30, o + 30 + nameLen));
    const dataStart = o + 30 + nameLen + extraLen;
    out[name] = dec.decode(buf.slice(dataStart, dataStart + compSize));
    o = dataStart + compSize;
  }
  return out;
}

test("zipSync round-trips file names and contents (incl. UTF-8)", () => {
  const enc = new TextEncoder();
  const files = [
    { name: "01-spec.md", data: enc.encode("# Spec\n\nhello") },
    { name: "02-design.html", data: enc.encode("<main>こんにちは</main>") },
  ];
  const zip = zipSync(files);
  assert.equal(zip[0], 0x50); // 'P'
  assert.equal(zip[1], 0x4b); // 'K'
  const got = unzip(zip);
  assert.equal(got["01-spec.md"], "# Spec\n\nhello");
  assert.equal(got["02-design.html"], "<main>こんにちは</main>");
  // EOCD signature at the tail (no archive comment).
  assert.equal(u32(zip, zip.length - 22), 0x06054b50);
  assert.equal(u16(zip, zip.length - 22 + 10), 2); // total entries
});

test("zipSync produces a valid empty archive", () => {
  const zip = zipSync([]);
  assert.equal(zip.length, 22); // EOCD only
  assert.equal(u32(zip, 0), 0x06054b50);
});
