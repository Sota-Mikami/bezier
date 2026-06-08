#!/usr/bin/env node
// Round-trip / idempotency harness for the markdown engine.
//
// Imports the SAME logic as the app from src/lib/markdown.ts (via the tsx
// loader, so no separate build step is needed). For every .md / .mdx file in
// the corpus directory it:
//   1. splitFrontmatter  -> { rawFrontmatter, body }
//   2. value = mdToPlate(body)
//   3. out   = plateToMd(value)
//   4. asserts IDEMPOTENCY: plateToMd(mdToPlate(out)) === out   (fixed point)
//   5. reattaches frontmatter and asserts the frontmatter bytes are unchanged
//
// classify() decides whether a file is "plate-safe" or a "raw-fallback".
// Only files classified plate-safe MUST be idempotent; a raw-fallback file
// failing idempotency is expected (that is exactly why it is raw) and does NOT
// fail the run. The process exits non-zero iff a plate-safe file fails.
//
// Usage: node scripts/roundtrip.mjs [dir]      (default ./corpus)
//   (run via `npx tsx scripts/roundtrip.mjs` so the TS import resolves)

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPatch } from "diff";

// Register the tsx ESM loader so we can import the TypeScript source directly.
// If we are already running under `npx tsx`, the loader is present and this is
// a no-op-ish; otherwise we register it programmatically.
async function loadMarkdownLib() {
  const url = pathToFileURL(
    resolve(import.meta.dirname, "../src/lib/markdown.ts")
  ).href;
  try {
    return await import(url);
  } catch (err) {
    // Not running under tsx — register the loader and retry once.
    if (
      err &&
      (err.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
        /Unknown file extension|Cannot find module|tsx/.test(String(err)))
    ) {
      const { register } = await import("node:module");
      register("tsx/esm", pathToFileURL("./"));
      return await import(url);
    }
    throw err;
  }
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile() && /\.(md|mdx)$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function color(code, s) {
  return process.stdout.isTTY ? `[${code}m${s}[0m` : s;
}
const green = (s) => color("32", s);
const red = (s) => color("31", s);
const yellow = (s) => color("33", s);
const dim = (s) => color("2", s);

async function main() {
  const dirArg = process.argv[2] ?? "./corpus";
  const dir = resolve(dirArg);
  const { splitFrontmatter, mdToPlate, plateToMd, classify } =
    await loadMarkdownLib();

  const files = (await walk(dir)).sort();
  if (files.length === 0) {
    console.error(red(`No .md/.mdx files found under ${dir}`));
    process.exit(1);
  }

  let plateCount = 0;
  let rawCount = 0;
  let failures = 0;

  console.log(dim(`Round-trip corpus: ${dir} (${files.length} files)\n`));

  for (const file of files) {
    const rel = relative(dir, file);
    const text = await readFile(file, "utf8");
    const { rawFrontmatter, body } = splitFrontmatter(text);
    const kind = classify(body);

    if (kind === "raw") {
      rawCount++;
      console.log(`${yellow("RAW ")} ${rel}  ${dim("(raw-fallback — skipped)")}`);
      continue;
    }
    plateCount++;

    let ok = true;
    const problems = [];

    let out;
    try {
      const value = mdToPlate(body);
      out = plateToMd(value);
      const out2 = plateToMd(mdToPlate(out));
      if (out !== out2) {
        ok = false;
        problems.push({
          label: "idempotency (plateToMd(mdToPlate(out)) !== out)",
          a: out,
          b: out2,
          aName: "out",
          bName: "out2",
        });
      }
    } catch (err) {
      ok = false;
      problems.push({ label: `threw: ${String(err)}`, a: null });
    }

    // Frontmatter must survive byte-for-byte: reattach and compare the leading
    // block against the original raw block.
    if (rawFrontmatter != null && out != null) {
      const reattached = rawFrontmatter + out;
      const { rawFrontmatter: rawAfter } = splitFrontmatter(reattached);
      if (rawAfter !== rawFrontmatter) {
        ok = false;
        problems.push({
          label: "frontmatter bytes changed after reattach",
          a: rawFrontmatter,
          b: rawAfter ?? "(null)",
          aName: "frontmatter-before",
          bName: "frontmatter-after",
        });
      }
    }

    if (ok) {
      console.log(`${green("PASS")} ${rel}  ${dim("(plate-safe)")}`);
    } else {
      failures++;
      console.log(`${red("FAIL")} ${rel}  ${dim("(plate-safe)")}`);
      for (const p of problems) {
        console.log(`  - ${red(p.label)}`);
        if (p.a != null && p.b != null) {
          const patch = createPatch(rel, p.a, p.b, p.aName, p.bName);
          console.log(
            patch
              .split("\n")
              .map((l) => "    " + l)
              .join("\n")
          );
        }
      }
    }
  }

  console.log("");
  console.log(
    `${dim("Summary:")} ${green(`${plateCount} plate-safe`)}, ` +
      `${yellow(`${rawCount} raw-fallback`)}, ` +
      `${failures > 0 ? red(`${failures} failed`) : green("0 failed")}`
  );

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(red("roundtrip harness crashed:"));
  console.error(err);
  process.exit(2);
});
