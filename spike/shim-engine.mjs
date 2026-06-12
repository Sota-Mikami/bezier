#!/usr/bin/env node
/**
 * bezier ISSUE-005 — Revertable Preview Shim Engine
 *
 * 役割:
 *   - 対象 repo に preview shim（AuthGate bypass + bezier-preview ルート）を一時適用する
 *   - 適用前にバックアップ＋マニフェストを記録し、終了/SIGINT/クラッシュ時に原子的に復元する
 *   - DEC-003 必須安全制約を実装する
 *
 * 安全制約（DEC-003）:
 *   ① gitignore 追記は専用マーカーで識別し、終了時に逆算除去する
 *   ② 追跡済みファイル（AuthGate.tsx 等）はバックアップをとってから変更し、終了時に復元する
 *   ③ 生成ファイル（bezier-preview/）は生成→削除で復元する
 *   ④ マニフェストは対象 repo の外（spike/out/）に保存する → repo に痕跡を残さない
 *   ⑤ SIGINT/SIGTERM/uncaughtException/exit でも復元ハンドラを登録する
 *   ⑥ マニフェストが残っていれば次回起動時に強制復元できる
 *
 * 使い方（プログラマティック API）:
 *   import { ShimEngine } from "./shim-engine.mjs";
 *   const engine = new ShimEngine(indexName, indexData, { noShim: false });
 *   await engine.apply();       // shim 適用
 *   // ... 作業 ...
 *   await engine.revert();      // 復元（自動呼び出しされるが明示してもよい）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── マニフェスト管理 ──────────────────────────────────────────────────────────

const BACKUP_BASE = path.join(__dirname, "out", "shim-backups");
const MANIFEST_DIR = path.join(__dirname, "out");

/**
 * @typedef {Object} ShimEntry
 * @property {"gitignore_append"} type - .gitignore への追記
 * @property {string} file              - 変更したファイル（絶対パス）
 * @property {string} appendedText      - 追記した文字列（除去時に使う）
 *
 * @typedef {Object} ShimEntryFilePatch
 * @property {"file_patch"} type        - 追跡済みファイルへのパッチ
 * @property {string} file              - 変更したファイル（絶対パス）
 * @property {string} backupPath        - バックアップファイルの絶対パス
 *
 * @typedef {Object} ShimEntryDirCreate
 * @property {"dir_create"} type        - 生成ディレクトリ（削除で復元）
 * @property {string} dir               - 生成したディレクトリ（絶対パス）
 */

function manifestPath(indexName) {
  return path.join(MANIFEST_DIR, `shim-manifest-${indexName}.json`);
}

function loadManifest(indexName) {
  const p = manifestPath(indexName);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function saveManifest(indexName, manifest) {
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(manifestPath(indexName), JSON.stringify(manifest, null, 2));
}

function deleteManifest(indexName) {
  const p = manifestPath(indexName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── 復元実行（マニフェストを読んで復元する。ShimEngine と独立して呼べる）────

export async function revertByManifest(indexName, { verbose = true } = {}) {
  const manifest = loadManifest(indexName);
  if (!manifest) {
    if (verbose) console.log(`[shim] no manifest for ${indexName} — nothing to revert`);
    return { skipped: true };
  }
  if (verbose) console.log(`[shim] reverting ${indexName} (${manifest.entries?.length || 0} entries)...`);

  const errors = [];
  // 逆順に復元（適用の逆順）
  const entries = (manifest.entries || []).slice().reverse();

  for (const entry of entries) {
    try {
      if (entry.type === "dir_create") {
        // 生成ディレクトリを削除
        if (fs.existsSync(entry.dir)) {
          fs.rmSync(entry.dir, { recursive: true, force: true });
          if (verbose) console.log(`  [shim] removed dir: ${entry.dir}`);
        } else {
          if (verbose) console.log(`  [shim] dir already gone: ${entry.dir}`);
        }
      } else if (entry.type === "file_patch") {
        // バックアップから復元
        if (fs.existsSync(entry.backupPath)) {
          fs.copyFileSync(entry.backupPath, entry.file);
          fs.unlinkSync(entry.backupPath);
          if (verbose) console.log(`  [shim] restored: ${entry.file}`);
        } else if (fs.existsSync(entry.file)) {
          // バックアップがない → 元に戻せない。警告のみ
          console.warn(`  [shim] WARNING: backup missing for ${entry.file} — cannot restore`);
          errors.push(`backup missing: ${entry.file}`);
        }
      } else if (entry.type === "gitignore_append") {
        // .gitignore から追記したブロックを除去
        if (fs.existsSync(entry.file)) {
          let content = fs.readFileSync(entry.file, "utf8");
          if (content.includes(entry.appendedText)) {
            content = content.replace(entry.appendedText, "");
            // 末尾の余分な改行を1つだけ除去（元のファイルの末尾状態に近づける）
            fs.writeFileSync(entry.file, content);
            if (verbose) console.log(`  [shim] gitignore cleaned: ${entry.file}`);
          } else {
            if (verbose) console.log(`  [shim] gitignore text not found (already clean): ${entry.file}`);
          }
        }
      }
    } catch (e) {
      console.error(`  [shim] ERROR reverting entry ${entry.type}: ${e.message}`);
      errors.push(`${entry.type}: ${e.message}`);
    }
  }

  // バックアップベースディレクトリが空になったら削除
  const backupDir = path.join(BACKUP_BASE, indexName);
  if (fs.existsSync(backupDir)) {
    try {
      const remaining = fs.readdirSync(backupDir);
      if (remaining.length === 0) {
        fs.rmdirSync(backupDir);
      }
    } catch {
      // ignore
    }
  }

  deleteManifest(indexName);

  if (errors.length > 0) {
    console.error(`[shim] revert completed with ${errors.length} error(s)`);
    return { ok: false, errors };
  }
  if (verbose) console.log(`[shim] revert complete — ${indexName} is clean`);
  return { ok: true };
}

// ─── ShimEngine クラス ────────────────────────────────────────────────────────

export class ShimEngine {
  constructor(indexName, index, options = {}) {
    this.indexName = indexName;
    this.index = index;
    this.noShim = options.noShim || false;
    this.repoPath = index.repo;
    this.applied = false;
    this._entries = [];
    this._signalHandlersRegistered = false;

    // detect app dir
    const srcApp = path.join(this.repoPath, "src", "app");
    const rootApp = path.join(this.repoPath, "app");
    this.appDir = fs.existsSync(srcApp) ? srcApp : fs.existsSync(rootApp) ? rootApp : null;
    this.hasSrc = fs.existsSync(path.join(this.repoPath, "src"));
  }

  // ─── 適用 ────────────────────────────────────────────────────────────────────

  async apply() {
    if (this.noShim) {
      console.log(`[shim] --no-shim: read-only mode, skipping shim`);
      return { shimApplied: false };
    }
    if (!this.repoPath || !fs.existsSync(this.repoPath)) {
      console.warn(`[shim] repo not found: ${this.repoPath}`);
      return { shimApplied: false };
    }

    // 既存マニフェストがあれば先に復元（前回のクラッシュ残骸を処理）
    const existing = loadManifest(this.indexName);
    if (existing) {
      console.log(`[shim] found leftover manifest for ${this.indexName} — cleaning up first`);
      await revertByManifest(this.indexName, { verbose: true });
    }

    console.log(`[shim] applying shim to ${this.indexName} (${this.repoPath})`);

    // マニフェスト初期化
    this._entries = [];
    const manifest = {
      indexName: this.indexName,
      repoPath: this.repoPath,
      appliedAt: new Date().toISOString(),
      entries: this._entries,
    };
    // 先にマニフェストを保存（クラッシュ耐性）
    saveManifest(this.indexName, manifest);

    // シグナルハンドラ登録
    this._registerSignalHandlers();

    try {
      // 1. AuthGate bypass 注入
      await this._injectAuthGateBypass();

      // 2. .gitignore に bezier-preview/ を追記（まだなければ）
      await this._ensureGitignore();

      // 3. bezier-preview/ ディレクトリを生成（generate-preview.mjs が別途ファイルを書く）
      await this._ensurePreviewDir();

    } catch (e) {
      console.error(`[shim] apply failed: ${e.message}`);
      // 部分的に適用された分を復元
      await this.revert();
      throw e;
    }

    // マニフェスト更新（entries が追記された状態）
    manifest.entries = this._entries;
    saveManifest(this.indexName, manifest);

    this.applied = true;
    console.log(`[shim] apply complete (${this._entries.length} entries tracked)`);
    return { shimApplied: true, entries: this._entries.length };
  }

  // ─── 復元 ────────────────────────────────────────────────────────────────────

  async revert() {
    if (this._reverting) return; // 再入防止
    this._reverting = true;

    if (this.noShim) return;
    if (!this.applied && this._entries.length === 0) {
      // エントリが 0 でもマニフェストが残っていれば処理
      const manifest = loadManifest(this.indexName);
      if (!manifest) return;
    }
    await revertByManifest(this.indexName, { verbose: true });
    this.applied = false;
    this._entries = [];
  }

  // ─── シグナルハンドラ ────────────────────────────────────────────────────────

  _registerSignalHandlers() {
    if (this._signalHandlersRegistered) return;
    this._signalHandlersRegistered = true;

    const revertFn = async (signal) => {
      if (this.applied || loadManifest(this.indexName)) {
        console.log(`\n[shim] ${signal} received — reverting shim...`);
        await this.revert();
      }
    };

    // SIGINT (Ctrl-C), SIGTERM (kill)
    process.once("SIGINT", async () => { await revertFn("SIGINT"); process.exit(130); });
    process.once("SIGTERM", async () => { await revertFn("SIGTERM"); process.exit(143); });

    // uncaught exception
    process.once("uncaughtException", async (e) => {
      console.error(`[shim] uncaughtException: ${e.message}`);
      await revertFn("uncaughtException");
      process.exit(1);
    });

    // beforeExit は async 処理が終わった後には呼ばれないこともあるが念のため
    process.once("beforeExit", async () => {
      if (this.applied) {
        console.log(`[shim] beforeExit — reverting shim...`);
        await this.revert();
      }
    });
  }

  // ─── AuthGate bypass 注入 ────────────────────────────────────────────────────

  async _injectAuthGateBypass() {
    if (!this.appDir) return;

    const layoutPath = path.join(this.appDir, "layout.tsx");
    if (!fs.existsSync(layoutPath)) return;
    const layoutContent = fs.readFileSync(layoutPath, "utf8");

    // layout に AuthGate import があるか確認
    const authGateMatch = layoutContent.match(
      /import\s+\{[^}]*AuthGate[^}]*\}\s+from\s+["']([^"']+)["']/
    );
    if (!authGateMatch) {
      console.log(`[shim] AuthGate not found in layout — skip bypass`);
      return;
    }

    const authGateSrc = authGateMatch[1];
    const authGateAbsPath = this._resolveImportPath(authGateSrc, this.appDir);

    if (!authGateAbsPath) {
      console.log(`[shim] AuthGate file not found: ${authGateSrc}`);
      return;
    }

    let content = fs.readFileSync(authGateAbsPath, "utf8");

    // すでに bypass がある?
    if (
      content.includes("bezier-preview") ||
      content.includes("BEZIER_PREVIEW")
    ) {
      console.log(`[shim] AuthGate bypass already present — skip`);
      return;
    }

    // 関数シグネチャを見つける
    const fnMatch = content.match(/export\s+function\s+AuthGate\s*\([^)]*\)\s*\{/);
    if (!fnMatch) {
      console.log(`[shim] AuthGate function signature not found — skip`);
      return;
    }

    // バックアップ
    const backupDir = path.join(BACKUP_BASE, this.indexName);
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `AuthGate.tsx.bak`);
    fs.copyFileSync(authGateAbsPath, backupPath);

    // usePathname import が必要か
    const needsPathnameImport = !content.includes("usePathname");
    if (needsPathnameImport) {
      if (content.includes("next/navigation")) {
        content = content.replace(
          /import\s+\{([^}]*)\}\s+from\s+["']next\/navigation["']/,
          (m, names) => `import { ${names.trim()}, usePathname } from "next/navigation"`
        );
      } else {
        content = content.replace(
          '"use client";',
          '"use client";\nimport { usePathname } from "next/navigation";'
        );
      }
    }

    // 関数先頭に bypass 挿入
    const fnIdx = content.indexOf(fnMatch[0]) + fnMatch[0].length;
    const BYPASS_MARKER = `// bezier preview bypass — ISSUE-005 (auto-reverted after preview)`;
    const bypass = `
  ${BYPASS_MARKER}
  const __bezierPathname = usePathname();
  if (__bezierPathname.startsWith('/bezier-preview')) return <>{children}</>;
`;
    content = content.slice(0, fnIdx) + bypass + content.slice(fnIdx);

    fs.writeFileSync(authGateAbsPath, content);

    // マニフェストにエントリ追加
    this._entries.push({
      type: "file_patch",
      file: authGateAbsPath,
      backupPath,
    });

    // マニフェスト保存（クラッシュ耐性: 適用直後に書く）
    saveManifest(this.indexName, {
      indexName: this.indexName,
      repoPath: this.repoPath,
      appliedAt: new Date().toISOString(),
      entries: this._entries,
    });

    console.log(`[shim] AuthGate bypass injected: ${authGateAbsPath}`);
    console.log(`       backup: ${backupPath}`);
  }

  // ─── .gitignore 管理 ──────────────────────────────────────────────────────────

  async _ensureGitignore() {
    const gitignorePath = path.join(this.repoPath, ".gitignore");
    const marker = this.hasSrc
      ? "src/app/bezier-preview/"
      : "app/bezier-preview/";
    const SHIM_BLOCK_START = `\n# bezier dogfood preview — ISSUE-005 shim (auto-reverted)\n`;
    const shimBlock = `${SHIM_BLOCK_START}${marker}\n`;

    if (fs.existsSync(gitignorePath)) {
      const gi = fs.readFileSync(gitignorePath, "utf8");

      // すでに marker が含まれているか確認
      if (gi.includes(marker)) {
        // marker はあるが shim block かどうか確認
        if (gi.includes("ISSUE-005 shim")) {
          console.log(`[shim] gitignore shim block already present`);
          return;
        }
        // ISSUE-004 などが書いた古い追記がある → 今回のシムとして管理する
        // 古いブロックを検索して shim block に置換
        const oldBlock = /\n# bezier dogfood preview \(throwaway\)\n[^\n]*bezier-preview\/\n/g;
        if (gi.match(oldBlock)) {
          const backupDir = path.join(BACKUP_BASE, this.indexName);
          fs.mkdirSync(backupDir, { recursive: true });
          const backupPath = path.join(backupDir, `.gitignore.bak`);
          fs.copyFileSync(gitignorePath, backupPath);

          const newGi = gi.replace(oldBlock, shimBlock);
          fs.writeFileSync(gitignorePath, newGi);

          this._entries.push({
            type: "file_patch",
            file: gitignorePath,
            backupPath,
          });
          saveManifest(this.indexName, {
            indexName: this.indexName,
            repoPath: this.repoPath,
            appliedAt: new Date().toISOString(),
            entries: this._entries,
          });
          console.log(`[shim] gitignore: replaced legacy block with shim block`);
          return;
        }
        console.log(`[shim] gitignore: ${marker} already present (not managed by shim)`);
        return;
      }

      // marker がない → 追記
      fs.appendFileSync(gitignorePath, shimBlock);
      this._entries.push({
        type: "gitignore_append",
        file: gitignorePath,
        appendedText: shimBlock,
      });
      saveManifest(this.indexName, {
        indexName: this.indexName,
        repoPath: this.repoPath,
        appliedAt: new Date().toISOString(),
        entries: this._entries,
      });
      console.log(`[shim] gitignore: appended shim block for ${marker}`);
    } else {
      // .gitignore 自体がない → 新規作成（type: file_patch でなくgitignore_appendで管理）
      fs.writeFileSync(gitignorePath, shimBlock.trim() + "\n");
      this._entries.push({
        type: "gitignore_append",
        file: gitignorePath,
        appendedText: shimBlock.trim() + "\n",
      });
      saveManifest(this.indexName, {
        indexName: this.indexName,
        repoPath: this.repoPath,
        appliedAt: new Date().toISOString(),
        entries: this._entries,
      });
      console.log(`[shim] gitignore: created with shim block`);
    }
  }

  // ─── bezier-preview ディレクトリ ──────────────────────────────────────────

  async _ensurePreviewDir() {
    if (!this.appDir) return;
    const previewDir = path.join(this.appDir, "bezier-preview");

    if (fs.existsSync(previewDir)) {
      // 既存の場合も管理下に置く（削除で復元）
      // ただし dir_create エントリが既にある場合はスキップ
      const already = this._entries.some(
        (e) => e.type === "dir_create" && e.dir === previewDir
      );
      if (!already) {
        this._entries.push({ type: "dir_create", dir: previewDir });
        saveManifest(this.indexName, {
          indexName: this.indexName,
          repoPath: this.repoPath,
          appliedAt: new Date().toISOString(),
          entries: this._entries,
        });
        console.log(`[shim] previewDir: tracking existing ${previewDir}`);
      }
    } else {
      fs.mkdirSync(previewDir, { recursive: true });
      this._entries.push({ type: "dir_create", dir: previewDir });
      saveManifest(this.indexName, {
        indexName: this.indexName,
        repoPath: this.repoPath,
        appliedAt: new Date().toISOString(),
        entries: this._entries,
      });
      console.log(`[shim] previewDir: created ${previewDir}`);
    }
  }

  // ─── import path 解決 ────────────────────────────────────────────────────────

  _resolveImportPath(src, fromDir) {
    if (src.startsWith("@/")) {
      const rel = src.slice(2);
      for (const ext of [".tsx", ".ts", ".jsx", ".js", ""]) {
        const candidate = path.join(this.repoPath, "src", rel + ext);
        if (fs.existsSync(candidate)) return candidate;
      }
    } else if (src.startsWith(".")) {
      const base = path.resolve(fromDir, src);
      for (const ext of [".tsx", ".ts", ".jsx", ".js", ""]) {
        const candidate = base + ext;
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }
}

// ─── スタンドアロン shim-revert コマンド ─────────────────────────────────────

// このファイルが直接実行された場合: node shim-engine.mjs revert <indexName>
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const [, , subCmd, indexName] = process.argv;
  if (subCmd === "revert" && indexName) {
    console.log(`[shim-engine] revert ${indexName}`);
    revertByManifest(indexName, { verbose: true }).then((result) => {
      if (result.ok === false) {
        console.error(`revert had errors: ${result.errors?.join(", ")}`);
        process.exit(1);
      }
      console.log(`[shim-engine] done`);
      process.exit(0);
    });
  } else if (subCmd === "status") {
    // 全マニフェスト一覧
    const files = fs.readdirSync(MANIFEST_DIR).filter((f) => f.startsWith("shim-manifest-"));
    if (files.length === 0) {
      console.log("no active shim manifests");
    } else {
      for (const f of files) {
        const m = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), "utf8"));
        console.log(`${m.indexName}: ${m.entries?.length || 0} entries, applied ${m.appliedAt}`);
      }
    }
    process.exit(0);
  } else {
    console.error("使い方: node shim-engine.mjs revert <indexName>");
    console.error("         node shim-engine.mjs status");
    process.exit(1);
  }
}
