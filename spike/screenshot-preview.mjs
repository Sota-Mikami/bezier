/**
 * bezier ISSUE-003 — screenshot preview
 * chom-chom の _bezier_preview を Playwright で撮影する。
 *
 * 使い方:
 *   node spike/screenshot-preview.mjs
 *
 * 前提: chom-chom dev server が localhost:3201 で起動済み
 */

import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:3201";
const OUT_DIR = path.join(__dirname, "out");
fs.mkdirSync(OUT_DIR, { recursive: true });

/** モバイルサイズ (iPhone 14 Pro) */
const VIEWPORT = { width: 390, height: 844 };

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
  await page.waitForTimeout(200);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const shots = [
    {
      id: "overview",
      url: `${BASE_URL}/bezier-preview`,
      filename: "render-chomchom.png",
      desc: "overview: 全ノード一覧 + render率表",
    },
    {
      id: "vocabflashcard",
      url: `${BASE_URL}/bezier-preview?tab=vocabflashcard`,
      filename: "render-chomchom-flashcard.png",
      desc: "VocabFlashcard: 実コンポーネント全画面",
    },
    {
      id: "tabbar",
      url: `${BASE_URL}/bezier-preview?tab=tabbar`,
      filename: "render-chomchom-tabbar.png",
      desc: "TabBar: 実コンポーネント",
    },
    {
      id: "achievement",
      url: `${BASE_URL}/bezier-preview?tab=achievement`,
      filename: "render-chomchom-achievement.png",
      desc: "AchievementCelebration: ボタン付き",
    },
  ];

  const results = [];

  for (const shot of shots) {
    console.log(`  [screenshot] ${shot.desc}`);
    const page = await browser.newPage({ viewport: VIEWPORT });

    try {
      await page.goto(shot.url, { waitUntil: "networkidle", timeout: 15000 });
      await hideDevOverlay(page);

      // タブ切替対応: URL に tab= がなくても onClick 経由で切替
      if (shot.id === "vocabflashcard") {
        await page.click("button:has-text('Flashcard')", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(800);
      } else if (shot.id === "tabbar") {
        await page.click("button:has-text('TabBar')", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      } else if (shot.id === "achievement") {
        await page.click("button:has-text('Achievement')", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      }

      await hideDevOverlay(page);
      const outPath = path.join(OUT_DIR, shot.filename);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  ✓ saved: ${outPath}`);
      results.push({ ...shot, status: "ok", path: outPath });
    } catch (e) {
      console.error(`  ✗ failed: ${shot.id}: ${e.message}`);
      results.push({ ...shot, status: "failed", error: e.message });
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
  console.log(`\nMain screenshot: ${OUT_DIR}/render-chomchom.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
