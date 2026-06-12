#!/usr/bin/env node
// bezier CLI エントリポイント（スパイク版）
// 使い方:
//   node cli.mjs extract <repoPath> [outName]
//   node cli.mjs generate <indexName> "<intent>"
//   node cli.mjs preview <indexName> ["<intent>"] [--port <n>] [--no-shim]  ← ISSUE-005 shim統合
//   node cli.mjs gen-preview <indexName>                                      ← preview ルートのみ生成
//   node cli.mjs shim-restore <indexName>                                     ← クラッシュ後の手動復元
//   node cli.mjs shim-status                                                  ← アクティブな shim 確認
//
// 本格 CLI フレームワーク不要。process.argv で最小実装。

import { execFileSync, spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { ShimEngine, revertByManifest } from "./shim-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , command, ...args] = process.argv;

function usage() {
  console.log(`
bezier — ローカルエンジン CLI（スパイク版）

使い方:
  node cli.mjs extract <repoPath> [outName]
      任意 repo から component-index を抽出して out/<outName>.json に保存する
      例: node cli.mjs extract ~/my-app myapp

  node cli.mjs generate <indexName> "<intent>"
      out/<indexName>.json を入力に、Claude Code サブスクで画面の scene-graph を生成する
      例: node cli.mjs generate chomchom "SRS復習画面を作って"
      出力: out/gen-<indexName>.json

  node cli.mjs gen-preview <indexName>
      out/<indexName>.json + out/gen-<indexName>.json を入力に
      対象 repo の src/app/bezier-preview/ を動的生成（汎用ジェネレータ）
      例: node cli.mjs gen-preview template
      出力: <repoPath>/src/app/bezier-preview/page.tsx + layout.tsx

  node cli.mjs preview <indexName> ["<intent>"] [--port <n>] [--no-shim]
      [generate →] shim apply → gen-preview → dev server 起動 → screenshot → shim revert
      intent 省略時は既存 gen-<indexName>.json を使用（generate スキップ）
      --port: dev server ポート（default: 3201 for chomchom, 3202 for others）
      --no-shim: AuthGate bypass を適用しない（厳格 read-only モード）
      例: node cli.mjs preview chomchom "SRS復習画面" --port 3201
          node cli.mjs preview template --port 3202
          node cli.mjs preview chomchom --no-shim
      出力: out/render-<indexName>.png

  node cli.mjs shim-restore <indexName>
      クラッシュ後に shim マニフェストが残っている場合に手動で復元する
      例: node cli.mjs shim-restore chomchom

  node cli.mjs shim-status
      アクティブな shim マニフェストを一覧表示する

  node cli.mjs list-indexes
      out/ 内の利用可能な index ファイルを一覧表示する
`);
  process.exit(0);
}

if (!command || command === "help" || command === "--help" || command === "-h") {
  usage();
}

if (command === "extract") {
  const repoPath = args[0];
  const outName = args[1] || path.basename(repoPath || "").replace(/[^a-zA-Z0-9_-]/g, "_") || "index";
  if (!repoPath) {
    console.error("error: repoPath が必要です");
    console.error("使い方: node cli.mjs extract <repoPath> [outName]");
    process.exit(1);
  }
  const extractScript = path.join(__dirname, "extract.mjs");
  console.log(`[bezier extract] repo: ${repoPath}  out: out/${outName}.json`);
  const result = spawnSync("node", [extractScript, repoPath, outName], {
    cwd: __dirname,
    stdio: "inherit",
  });
  process.exit(result.status ?? 0);
}

if (command === "generate") {
  const indexName = args[0];
  const intent = args[1];
  if (!indexName || !intent) {
    console.error("error: indexName と intent が必要です");
    console.error('使い方: node cli.mjs generate <indexName> "<intent>"');
    process.exit(1);
  }
  const indexPath = path.join(__dirname, "out", `${indexName}.json`);
  if (!fs.existsSync(indexPath)) {
    console.error(`error: index not found: ${indexPath}`);
    console.error(`先に: node cli.mjs extract <repoPath> ${indexName}`);
    process.exit(1);
  }
  const generateScript = path.join(__dirname, "generate-sdk.mjs");
  console.log(`[bezier generate] index: ${indexName}  intent: ${intent}`);
  const result = spawnSync("node", [generateScript, indexName, intent], {
    cwd: __dirname,
    stdio: "inherit",
  });
  process.exit(result.status ?? 0);
}

// gen-preview: preview ルートのみ生成（汎用ジェネレータ呼び出し）
if (command === "gen-preview") {
  const indexName = args[0];
  if (!indexName) {
    console.error("error: indexName が必要です");
    console.error("使い方: node cli.mjs gen-preview <indexName>");
    process.exit(1);
  }
  const indexPath = path.join(__dirname, "out", `${indexName}.json`);
  const genPath = path.join(__dirname, "out", `gen-${indexName}.json`);

  if (!fs.existsSync(indexPath)) {
    console.error(`error: index not found: ${indexPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(genPath)) {
    console.error(`error: gen not found: ${genPath}`);
    console.error(`先に: node cli.mjs generate ${indexName} "<intent>"`);
    process.exit(1);
  }

  const generatePreviewScript = path.join(__dirname, "generate-preview.mjs");
  const result = spawnSync("node", [generatePreviewScript, indexName], {
    cwd: __dirname,
    stdio: "inherit",
  });
  process.exit(result.status ?? 0);
}

if (command === "preview") {
  const indexName = args[0];
  if (!indexName) {
    console.error("error: indexName が必要です");
    console.error('使い方: node cli.mjs preview <indexName> ["<intent>"] [--port <n>] [--no-shim]');
    process.exit(1);
  }
  const indexPath = path.join(__dirname, "out", `${indexName}.json`);
  if (!fs.existsSync(indexPath)) {
    console.error(`error: index not found: ${indexPath}`);
    console.error(`先に: node cli.mjs extract <repoPath> ${indexName}`);
    process.exit(1);
  }

  // args parsing: intent (optional, no --), --port <n>, --no-shim
  let intent = null;
  let port = null;
  let noShim = false;
  const remainArgs = args.slice(1);
  for (let i = 0; i < remainArgs.length; i++) {
    if (remainArgs[i] === "--port" && remainArgs[i + 1]) {
      port = remainArgs[i + 1];
      i++;
    } else if (remainArgs[i] === "--no-shim") {
      noShim = true;
    } else if (!remainArgs[i].startsWith("--")) {
      intent = remainArgs[i];
    }
  }

  // default port by indexName
  if (!port) {
    const portMap = { chomchom: "3201", template: "3202", alloy: "3203" };
    port = portMap[indexName] || "3202";
  }

  const genOutPath = path.join(__dirname, "out", `gen-${indexName}.json`);
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const repoPath = index.repo;

  // ShimEngine インスタンス（revert を必ず呼ぶためにスコープ外で保持）
  const shim = new ShimEngine(indexName, index, { noShim });
  let devServerProc = null;

  async function cleanup(exitCode = 0) {
    if (devServerProc) {
      console.log(`  stopping dev server...`);
      devServerProc.kill("SIGTERM");
      devServerProc = null;
    }
    // ShimEngine の revert は自身のシグナルハンドラが処理するが、
    // 正常終了パスでも明示的に呼ぶ
    if (!noShim) {
      await shim.revert();
    }
    process.exit(exitCode);
  }

  // Step 1: generate (skip if gen already exists and no intent given)
  if (intent) {
    console.log(`[bezier preview] Step 1/5 — generate (${indexName}: "${intent}")`);
    const generateScript = path.join(__dirname, "generate-sdk.mjs");
    const genResult = spawnSync("node", [generateScript, indexName, intent], {
      cwd: __dirname,
      stdio: "inherit",
    });
    if (genResult.status !== 0) {
      console.error("generate failed");
      await cleanup(genResult.status ?? 1);
    }
  } else if (!fs.existsSync(genOutPath)) {
    console.error(`error: gen not found: ${genOutPath}`);
    console.error(`intent 引数を渡すか、先に: node cli.mjs generate ${indexName} "<intent>"`);
    await cleanup(1);
  } else {
    console.log(`[bezier preview] Step 1/5 — generate skip (既存 gen-${indexName}.json を使用)`);
  }

  // Step 2: shim apply（AuthGate bypass + gitignore + previewDir 確保）
  if (!noShim) {
    console.log(`[bezier preview] Step 2/5 — shim apply`);
    if (!repoPath || !fs.existsSync(repoPath)) {
      console.error(`repo が存在しません: ${repoPath}`);
      await cleanup(2);
    }
    try {
      await shim.apply();
    } catch (e) {
      console.error(`shim apply failed: ${e.message}`);
      await cleanup(1);
    }
  } else {
    console.log(`[bezier preview] Step 2/5 — shim skip (--no-shim)`);
  }

  // Step 3: gen-preview (汎用プレビュールート生成)
  console.log(`[bezier preview] Step 3/5 — gen-preview`);
  const generatePreviewScript = path.join(__dirname, "generate-preview.mjs");
  const gpResult = spawnSync("node", [generatePreviewScript, indexName], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (gpResult.status !== 0) {
    if (gpResult.status === 2) {
      console.error(`repo が存在しません (exit 2)。screenshot はスキップ。`);
      await cleanup(2);
    }
    if (gpResult.status === 3) {
      console.error(`未対応フレームワーク (exit 3)。`);
      await cleanup(3);
    }
    console.error("gen-preview failed");
    await cleanup(gpResult.status ?? 1);
  }

  // Step 4: dev server 自動起動（起動済みならスキップ）
  const baseUrl = `http://localhost:${port}`;
  const previewUrl = `${baseUrl}/bezier-preview`;

  console.log(`[bezier preview] Step 4/5 — dev server (${baseUrl})`);

  // ポートが応答するか確認
  async function isPortReady(url, timeoutMs = 1000) {
    const http = await import("node:http");
    return new Promise((resolve) => {
      const req = http.default.get(url, { timeout: timeoutMs }, (res) => {
        resolve(true);
        res.destroy();
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
  }

  const alreadyRunning = await isPortReady(baseUrl);

  if (alreadyRunning) {
    console.log(`  dev server already running on port ${port}`);
  } else {
    console.log(`  starting dev server: PORT=${port} npm run dev (repo: ${repoPath})`);
    devServerProc = spawn("npm", ["run", "dev"], {
      cwd: repoPath,
      env: { ...process.env, PORT: port },
      stdio: ["ignore", "pipe", "pipe"],
    });
    devServerProc.stdout.on("data", (d) => {
      const line = d.toString().trim();
      if (line.includes("Ready") || line.includes("ready") || line.includes("Local:") || line.includes("error")) {
        console.log(`  [dev] ${line}`);
      }
    });
    devServerProc.stderr.on("data", (d) => {
      const line = d.toString().trim();
      if (line.includes("error") || line.includes("Error")) {
        console.error(`  [dev:err] ${line}`);
      }
    });

    // 最大30秒待機
    console.log(`  waiting for dev server...`);
    const maxWait = 30000;
    const interval = 1000;
    let elapsed = 0;
    let ready = false;
    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;
      if (await isPortReady(baseUrl)) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      console.error(`  dev server did not start within ${maxWait / 1000}s`);
      await cleanup(1);
    }
    console.log(`  dev server ready (${elapsed / 1000}s)`);
    // Next.js needs a moment to compile the new route
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Step 5: screenshot
  console.log(`[bezier preview] Step 5/5 — screenshot`);
  const screenshotScript = path.join(__dirname, "screenshot-generic.mjs");
  const shotResult = spawnSync("node", [screenshotScript, indexName, baseUrl], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (shotResult.status !== 0) {
    console.error(`screenshot failed`);
    console.error(`dev server を起動してから再試行: cd <repoPath> && PORT=${port} npm run dev`);
    await cleanup(shotResult.status ?? 1);
  }

  const summaryPath = path.join(__dirname, "out", `preview-summary-${indexName}.json`);
  const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")) : null;

  console.log(`\n[bezier preview] 完了`);
  console.log(`  scene-graph : ${genOutPath}`);
  console.log(`  screenshot  : ${path.join(__dirname, "out", `render-${indexName}.png`)}`);
  console.log(`  browser     : ${previewUrl}`);
  if (summary) {
    console.log(`  render rate : ${summary.renderRate}% (${summary.realCount}/${summary.total})`);
  }
  if (!noShim) {
    console.log(`  shim mode   : revertable (shim auto-reverted)`);
  } else {
    console.log(`  shim mode   : --no-shim (read-only)`);
  }

  await cleanup(0);
}

// shim-restore: クラッシュ後の手動復元
if (command === "shim-restore") {
  const indexName = args[0];
  if (!indexName) {
    console.error("error: indexName が必要です");
    console.error("使い方: node cli.mjs shim-restore <indexName>");
    process.exit(1);
  }
  console.log(`[bezier shim-restore] ${indexName}`);
  const result = await revertByManifest(indexName, { verbose: true });
  if (result.skipped) {
    console.log(`no manifest found for ${indexName} — nothing to restore`);
    process.exit(0);
  }
  if (result.ok === false) {
    console.error(`restore had errors: ${result.errors?.join(", ")}`);
    process.exit(1);
  }
  console.log(`[bezier shim-restore] done`);
  process.exit(0);
}

// shim-status: アクティブな shim 一覧
if (command === "shim-status") {
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    console.log("no active shim manifests");
    process.exit(0);
  }
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith("shim-manifest-"));
  if (files.length === 0) {
    console.log("no active shim manifests — all repos are clean");
  } else {
    console.log(`active shim manifests (${files.length}):`);
    for (const f of files) {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
        console.log(`  ${m.indexName}: ${m.entries?.length || 0} entries, applied ${m.appliedAt}`);
        for (const e of m.entries || []) {
          console.log(`    ${e.type}: ${e.file || e.dir}`);
        }
      } catch {
        console.log(`  ${f}: (parse error)`);
      }
    }
  }
  process.exit(0);
}

if (command === "list-indexes") {
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    console.log("out/ ディレクトリが存在しません。先に extract を実行してください。");
    process.exit(0);
  }
  const files = fs.readdirSync(outDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("gen-"))
    .map((f) => f.replace(".json", ""));
  if (files.length === 0) {
    console.log("index ファイルがありません。先に extract を実行してください。");
  } else {
    console.log("利用可能な index:");
    for (const name of files) {
      const idx = JSON.parse(fs.readFileSync(path.join(outDir, `${name}.json`), "utf8"));
      console.log(`  ${name.padEnd(16)} parts: ${idx.counts?.parts ?? "-"}  screens: ${idx.counts?.screens ?? "-"}  repo: ${idx.repo}`);
    }
  }
  process.exit(0);
}

console.error(`error: 不明なコマンド: ${command}`);
usage();
