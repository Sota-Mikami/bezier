#!/usr/bin/env node
/**
 * continuum ISSUE-004 — 汎用スクリーンショット
 *
 * 使い方:
 *   node screenshot-generic.mjs <indexName> <baseUrl>
 *   例: node screenshot-generic.mjs template http://localhost:3202
 *
 * 出力: out/render-<indexName>.png
 */

import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
fs.mkdirSync(OUT_DIR, { recursive: true });

const indexName = process.argv[2];
const BASE_URL = process.argv[3] || process.env.BASE_URL;

if (!indexName || !BASE_URL) {
  console.error("使い方: node screenshot-generic.mjs <indexName> <baseUrl>");
  console.error("例: node screenshot-generic.mjs template http://localhost:3202");
  process.exit(1);
}

const VIEWPORT_DESKTOP = { width: 1280, height: 800 };
const VIEWPORT_MOBILE = { width: 390, height: 844 };

// preview-summary があればノード数を読む
const summaryPath = path.join(__dirname, "out", `preview-summary-${indexName}.json`);
let summary = null;
if (fs.existsSync(summaryPath)) {
  summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
}

async function hideDevOverlay(page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      [data-nextjs-dialog-overlay],
      [data-nextjs-toast],
      nextjs-portal,
      #__next-build-indicator,
      [class*="__next-dev"] { display: none !important; }
    `;
    document.head.appendChild(style);
  });
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // Desktop shot
  {
    const page = await browser.newPage({ viewport: VIEWPORT_DESKTOP });
    const outFile = `render-${indexName}.png`;
    const outPath = path.join(OUT_DIR, outFile);
    const url = `${BASE_URL}/continuum-preview`;
    console.log(`  [screenshot] ${indexName} desktop: ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await hideDevOverlay(page);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`  saved: ${outPath}`);
      results.push({ id: "desktop", status: "ok", path: outPath });
    } catch (e) {
      console.error(`  failed: ${e.message}`);
      results.push({ id: "desktop", status: "failed", error: e.message });
    } finally {
      await page.close();
    }
  }

  // Mobile shot (optional, if page looks responsive)
  {
    const page = await browser.newPage({ viewport: VIEWPORT_MOBILE });
    const outFile = `render-${indexName}-mobile.png`;
    const outPath = path.join(OUT_DIR, outFile);
    const url = `${BASE_URL}/continuum-preview`;
    console.log(`  [screenshot] ${indexName} mobile: ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await hideDevOverlay(page);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`  saved: ${outPath}`);
      results.push({ id: "mobile", status: "ok", path: outPath });
    } catch (e) {
      console.error(`  failed: ${e.message}`);
      results.push({ id: "mobile", status: "failed", error: e.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log("\n--- results ---");
  for (const r of results) {
    const mark = r.status === "ok" ? "✓" : "✗";
    console.log(`  ${mark} ${r.id}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
  }

  if (summary) {
    console.log(`\nrender rate: ${summary.renderRate}% (${summary.realCount}/${summary.total})`);
  }

  const mainPng = path.join(OUT_DIR, `render-${indexName}.png`);
  console.log(`\nMain screenshot: ${mainPng}`);

  // exit non-zero if all screenshots failed
  if (results.every((r) => r.status === "failed")) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
