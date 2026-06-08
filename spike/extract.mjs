// ISSUE-001 スパイク L1: 任意 repo → component-index.json（静的抽出, LLM不要）
// 使い方: node extract.mjs <repoPath> <outName>
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import fg from "fast-glob";
import fs from "node:fs";
import path from "node:path";

const traverse = _traverse.default || _traverse;
const repoRoot = process.argv[2];
const outName = process.argv[3] || "index";
if (!repoRoot) { console.error("usage: node extract.mjs <repoPath> <outName>"); process.exit(1); }

// repo の src ルートを推定
const srcRoots = ["src", "app", "."].map((d) => path.join(repoRoot, d)).filter((d) => fs.existsSync(d));
const base = srcRoots[0];

const files = await fg(["**/*.{tsx,jsx}"], {
  cwd: base, absolute: true,
  ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/*.d.ts", "**/*.test.*", "**/*.stories.*"],
});

const isPascal = (n) => /^[A-Z]/.test(n);
const rel = (f) => path.relative(repoRoot, f);
// screen 判定: app router page/layout、pages/、route セグメント
const isScreenFile = (f) => /\/(page|layout|template)\.(tsx|jsx)$/.test(f) || /\/pages\//.test(f);

function returnsJSX(node) {
  let found = false;
  try {
    traverse(node, {
      noScope: true,
      JSXElement() { found = true; },
      JSXFragment() { found = true; },
    }, undefined, {});
  } catch { /* noScope fallback below */ }
  return found;
}

function propsFromParam(param) {
  if (!param) return null;
  // ({a,b}: Props) or ({a,b}: {a:string}) or (props: Props)
  if (param.typeAnnotation?.typeAnnotation) {
    const t = param.typeAnnotation.typeAnnotation;
    if (t.type === "TSTypeReference" && t.typeName?.name) return { kind: "ref", name: t.typeName.name };
    if (t.type === "TSTypeLiteral") return { kind: "inline", props: t.members.map((m) => m.key?.name).filter(Boolean) };
  }
  if (param.type === "ObjectPattern") return { kind: "destructured", props: param.properties.map((p) => p.key?.name).filter(Boolean) };
  return { kind: "unknown" };
}

const components = [];
const edges = [];
let parseErrors = 0;

for (const file of files) {
  let code, ast;
  try {
    code = fs.readFileSync(file, "utf8");
    ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch { parseErrors++; continue; }

  const importedLocal = new Map(); // localName -> source
  const fileComps = [];

  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      for (const s of p.node.specifiers) if (s.local?.name) importedLocal.set(s.local.name, src);
    },
    // export function X() {}
    FunctionDeclaration(p) {
      const id = p.node.id?.name;
      if (!id || !isPascal(id)) return;
      const exported = p.parentPath.isExportNamedDeclaration() || p.parentPath.isExportDefaultDeclaration();
      if (!exported) return;
      if (!returnsJSX(p.node)) return;
      fileComps.push({ name: id, props: propsFromParam(p.node.params[0]), default: p.parentPath.isExportDefaultDeclaration() });
    },
    // export const X = (..) => (..)
    VariableDeclarator(p) {
      const id = p.node.id?.name;
      if (!id || !isPascal(id)) return;
      const init = p.node.init;
      if (!init || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) return;
      // exported?
      const decl = p.findParent((x) => x.isVariableDeclaration());
      const exported = decl?.parentPath?.isExportNamedDeclaration();
      if (!exported) return;
      if (!returnsJSX(init)) return;
      fileComps.push({ name: id, props: propsFromParam(init.params[0]), default: false });
    },
    // export default function () — anonymous page default
    ExportDefaultDeclaration(p) {
      const d = p.node.declaration;
      if (d?.type === "FunctionDeclaration" && !d.id) {
        if (returnsJSX(d)) fileComps.push({ name: path.basename(path.dirname(file)) || "Default", props: propsFromParam(d.params[0]), default: true, anonymous: true });
      }
    },
  });

  // composition edges: which imported PascalCase components are used in JSX here
  const used = new Set();
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name;
      const nm = n.type === "JSXIdentifier" ? n.name : null;
      if (nm && isPascal(nm) && importedLocal.has(nm)) used.add(nm);
    },
  });

  for (const c of fileComps) {
    const kind = isScreenFile(file) ? "screen" : "part";
    components.push({
      name: c.name, file: rel(file), kind,
      isDefault: !!c.default,
      props: c.props,
    });
    for (const u of used) edges.push({ from: c.name, to: u, file: rel(file) });
  }
}

// design tokens: tailwind config + globals.css @theme / :root vars
const tokens = { colors: [], cssVars: [], source: [] };
for (const cfg of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"]) {
  const f = path.join(repoRoot, cfg);
  if (fs.existsSync(f)) {
    tokens.source.push(cfg);
    const t = fs.readFileSync(f, "utf8");
    for (const m of t.matchAll(/['"]?(#[0-9a-fA-F]{3,8})['"]?/g)) tokens.colors.push(m[1]);
  }
}
const cssFiles = await fg(["**/*.css"], { cwd: base, absolute: true, ignore: ["**/node_modules/**"] });
for (const f of cssFiles) {
  const t = fs.readFileSync(f, "utf8");
  let n = 0;
  for (const m of t.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) { tokens.cssVars.push(m[1]); n++; }
  if (n) tokens.source.push(rel(f));
}
tokens.colors = [...new Set(tokens.colors)];
tokens.cssVars = [...new Set(tokens.cssVars)];

const screens = components.filter((c) => c.kind === "screen");
const parts = components.filter((c) => c.kind === "part");
const result = {
  repo: repoRoot, scannedFiles: files.length, parseErrors,
  counts: { components: components.length, screens: screens.length, parts: parts.length, edges: edges.length, colors: tokens.colors.length, cssVars: tokens.cssVars.length },
  components, edges, tokens,
};
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync(`out/${outName}.json`, JSON.stringify(result, null, 2));

console.log(`\n=== ${outName} (${path.basename(repoRoot)}) ===`);
console.log(`files=${files.length} parseErr=${parseErrors} | components=${components.length} (screens=${screens.length} parts=${parts.length}) edges=${edges.length} | colors=${tokens.colors.length} cssVars=${tokens.cssVars.length}`);
console.log("top parts:", parts.slice(0, 14).map((c) => c.name).join(", "));
console.log("screens:", screens.slice(0, 10).map((c) => c.name + (c.anonymous ? "(dir)" : "")).join(", "));
