#!/usr/bin/env node
/**
 * continuum ISSUE-004 — 汎用 preview ジェネレータ
 *
 * 使い方:
 *   node generate-preview.mjs <indexName>
 *
 * 入力:
 *   out/<indexName>.json    — component-index (extract 済み)
 *   out/gen-<indexName>.json — scene-graph (generate 済み)
 *
 * 出力:
 *   <repoPath>/src/app/continuum-preview/page.tsx   (throwaway)
 *   <repoPath>/src/app/continuum-preview/layout.tsx (throwaway)
 *   <repoPath>/.gitignore に continuum-preview を追記
 *
 * 既存コード (chom-chom固有ロジック) を汎用化した版。
 * - existing_component: index の実ファイルパスから relative import を解決
 * - generated: scene-graph の props から inline JSX を生成
 * - complex props / context 依存: FALLBACK プレースホルダ
 * - provider 自動検出: root layout.tsx の import から推定し standalone layout を生成
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── entry point ──────────────────────────────────────────────────────────────

const indexName = process.argv[2];
if (!indexName) {
  console.error("使い方: node generate-preview.mjs <indexName>");
  process.exit(1);
}

const indexPath = path.join(__dirname, "out", `${indexName}.json`);
const genPath = path.join(__dirname, "out", `gen-${indexName}.json`);

for (const p of [indexPath, genPath]) {
  if (!fs.existsSync(p)) {
    console.error(`not found: ${p}`);
    process.exit(1);
  }
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const sceneGraph = JSON.parse(fs.readFileSync(genPath, "utf8"));

const repoPath = index.repo;
if (!repoPath || !fs.existsSync(repoPath)) {
  console.error(`repo not found: ${repoPath}`);
  console.error("→ alloy など repo がディスク上に存在しない場合は generate-preview をスキップ");
  process.exit(2);
}

console.log(`\n=== continuum generate-preview ===`);
console.log(`index: ${indexName}  repo: ${repoPath}`);
console.log(`scene: ${sceneGraph.label || "unknown"}  nodes: ${sceneGraph.nodes?.length || 0}`);

// ─── detect framework ──────────────────────────────────────────────────────────

function detectFramework(repoPath) {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return "unknown";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next"]) return "next-app-router";
    if (deps["vite"]) return "vite";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function detectSrcDir(repoPath) {
  return fs.existsSync(path.join(repoPath, "src")) ? "src" : "";
}

function detectAppDir(repoPath) {
  const srcApp = path.join(repoPath, "src", "app");
  const rootApp = path.join(repoPath, "app");
  if (fs.existsSync(srcApp)) return srcApp;
  if (fs.existsSync(rootApp)) return rootApp;
  return null;
}

const framework = detectFramework(repoPath);
console.log(`framework: ${framework}`);

if (framework !== "next-app-router") {
  console.error(`未対応フレームワーク: ${framework}. Next.js app-router のみサポート。`);
  process.exit(3);
}

const appDir = detectAppDir(repoPath);
if (!appDir) {
  console.error(`app ディレクトリが見つかりません: ${repoPath}`);
  process.exit(1);
}

const srcDir = detectSrcDir(repoPath);
const hasSrc = srcDir === "src";

// ─── detect providers from root layout ────────────────────────────────────────

function detectProviders(repoPath, appDir) {
  const layoutPath = path.join(appDir, "layout.tsx");
  if (!fs.existsSync(layoutPath)) return { providers: [], cssImports: [], fontImport: null };

  const content = fs.readFileSync(layoutPath, "utf8");

  // Extract CSS imports
  const cssImports = [];
  const cssRe = /import\s+["']([^"']*\.css)["']/g;
  let m;
  while ((m = cssRe.exec(content)) !== null) {
    cssImports.push(m[1]);
  }

  // Detect font
  let fontImport = null;
  const fontRe = /import\s+\{([^}]+)\}\s+from\s+["']next\/font\/google["']/;
  const fontMatch = content.match(fontRe);
  if (fontMatch) {
    fontImport = fontMatch[1].trim().split(/\s*,\s*/)[0].trim();
  }

  // Detect known safe providers (those that work without external services)
  const providers = [];

  // AIContextProvider (chom-chom specific)
  if (content.includes("AIContextProvider") && content.includes("ai-context")) {
    providers.push({
      name: "AIContextProvider",
      importPath: "@/lib/ai-context",
      safe: true,
      reason: "AI context for LLM features",
    });
  }

  // CommentContextProvider (template, alloy) — safe: works without Supabase (returns null)
  if (content.includes("CommentContextProvider")) {
    providers.push({
      name: "CommentContextProvider",
      // From preview dir (src/app/continuum-preview/), the comments dir is at ../comments/
      importPath: "../comments/comment-context",
      safe: true,
      reason: "comment context (gracefully disabled if no Supabase)",
    });
  }

  // ChatSessionProvider (chom-chom)
  if (content.includes("ChatSessionProvider")) {
    providers.push({
      name: "ChatSessionProvider",
      importPath: "@/lib/chat-session",
      safe: true,
      reason: "chat session context",
    });
  }

  // AuthGate — UNSAFE for preview (blocks rendering with sign-in gate)
  // Explicitly skip: AuthGate wraps children and requires auth

  return { providers, cssImports, fontImport };
}

const { providers, cssImports, fontImport } = detectProviders(repoPath, appDir);
console.log(`providers detected: ${providers.map((p) => p.name).join(", ") || "none"}`);
console.log(`cssImports: ${cssImports.join(", ")}`);
if (fontImport) console.log(`font: ${fontImport}`);

// ─── resolve component file path ─────────────────────────────────────────────

/**
 * index.components から name に対応する file を返す
 */
function resolveComponentFile(name, index) {
  const comp = index.components?.find((c) => c.name === name);
  return comp ? comp.file : null;
}

/**
 * index の file パスを preview ルートからの relative import path に変換する
 * index の file は repo root からの相対パス (e.g. "src/components/Foo.tsx")
 * preview ルート: src/app/continuum-preview/page.tsx
 * → relative: ../../components/Foo  または @/components/Foo
 */
function fileToImportPath(file, hasSrc) {
  // Use @/ alias if repo has src/ convention
  if (hasSrc && file.startsWith("src/")) {
    // src/components/Foo.tsx → @/components/Foo
    const withoutSrc = file.slice(4); // "components/Foo.tsx"
    const withoutExt = withoutSrc.replace(/\.(tsx|ts|jsx|js)$/, "");
    return `@/${withoutExt}`;
  }
  // app-relative path without src
  // app/components/Foo.tsx → ../../components/Foo (from app/continuum-preview/)
  const withoutExt = file.replace(/\.(tsx|ts|jsx|js)$/, "");
  return `../../${withoutExt}`;
}

// ─── props mocker ────────────────────────────────────────────────────────────

/**
 * prop名からモック値を heuristically 決定する
 * scene-graph の value には template変数 ({xxx}, {{xxx}}) が来ることがある
 * → 安全なモック値に変換して型エラーを避ける
 */
function mockPropValue(key, value) {
  // スキップキー (rendering に不要な meta 情報)
  const skipKeys = ["note", "children_note", "slot", "purpose"];
  if (skipKeys.includes(key)) return null;

  // Boolean props
  if (typeof value === "boolean") {
    return value ? `{true}` : `{false}`;
  }

  // Number props
  if (typeof value === "number") {
    return `{${value}}`;
  }

  // Array / Object → skip (complex, will cause type errors)
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return null;
  }

  // String props
  if (typeof value === "string") {
    // CSS values → skip as JSX prop
    if (value.startsWith("var(--") || value.match(/^#[0-9a-f]{3,6}$/i) || value.match(/^\d+px/)) {
      return null;
    }

    // Template variables: {xxx} or {{xxx}} patterns
    if (value.match(/^\{.*\}$/) || value.match(/^\{\{.*\}\}$/)) {
      // Determine mock from key name heuristics
      return mockByKeyName(key);
    }

    // Simple string literal (no template vars) → use as-is unless it looks like navigation
    if (value.startsWith("navigate(") || value.startsWith("router.") || value.startsWith("() =>")) {
      return mockByKeyName(key);
    }

    // Reasonable string literal
    return JSON.stringify(value);
  }

  return null;
}

/**
 * prop 名から plausible なモック値を返す
 */
function mockByKeyName(key) {
  // Callback / handler props
  if (key.startsWith("on") || key.startsWith("handle") || key === "onClose" || key === "onOpenChange") {
    return `{() => {}}`;
  }
  // Boolean-ish open/closed state props
  if (key === "open" || key === "isOpen" || key === "visible" || key === "show") {
    return `{false}`;
  }
  // Data arrays
  if (key === "achievements" || key === "entries" || key === "items" || key === "screens") {
    return `{[]}`;
  }
  // Complex object props — skip (will cause type errors)
  if (key === "vocab" || key === "meta" || key === "document" || key === "workspace") {
    return null; // skip → ErrorBoundary will catch if required
  }
  // ID props
  if (key.endsWith("Id") || key.endsWith("_id") || key === "issueId" || key === "workspaceId") {
    return `"mock-id"`;
  }
  // active/current tabs
  if (key === "active" || key === "current" || key === "selected") {
    return `"home"`;
  }
  // count / number
  if (key.endsWith("Count") || key.endsWith("count") || key.endsWith("Num") || key === "dueCount") {
    return `{0}`;
  }
  // string fallback
  return `"mock-${key}"`;
}

/**
 * scene-graph ノードの props から JSX attrs string を生成する
 * - template 変数 ({xxx}) は heuristics でモックに変換
 * - complex props はスキップ（ErrorBoundary が実行時エラーを捕捉）
 */
function mockPropsAttrs(props) {
  if (!props || typeof props !== "object") return "";
  const attrs = [];

  for (const [key, value] of Object.entries(props)) {
    const mockVal = mockPropValue(key, value);
    if (mockVal !== null) {
      attrs.push(`${key}=${mockVal}`);
    }
  }

  return attrs.length > 0 ? " " + attrs.join(" ") : "";
}

// ─── complex props detector ───────────────────────────────────────────────────

/**
 * コンポーネントが複雑すぎてpreviewで安全にレンダーできるか判定
 * FALLBACK を返すべきコンポーネントを検出する
 */
function shouldFallback(name, file, sceneNodeProps, index) {
  // Screen kind (full page component) — too complex for preview
  const comp = index.components?.find((c) => c.name === name);
  if (comp?.kind === "screen") return "screen-component (full page)";

  // props が ref 型（TypeScript 型参照）で複雑な場合
  if (comp?.props?.kind === "ref") {
    const refName = comp.props.name;
    // 既知の複雑な ref 型
    const complexRefs = ["NodeProps", "Props", "Screen"];
    if (complexRefs.some((r) => refName?.includes(r))) {
      return `complex ref props: ${refName}`;
    }
  }

  // Context providers / gates が children をブロックするもの
  const blockingComponents = ["AuthGate", "PasswordGate", "CommentLayer"];
  if (blockingComponents.includes(name)) return "blocking-provider (auth/password gate)";

  // Supabase/外部サービス依存の重い部品
  if (name.includes("Session") && name !== "ChatSessionProvider") {
    return "service-dependent (Session)";
  }

  return null; // safe to render
}

// ─── generated node JSX builder ──────────────────────────────────────────────

/**
 * generated ノードから inline JSX コンポーネントを生成する
 * scene-graph の props.role / props.title / props.layout / props.note から推定
 */
function buildGeneratedJsx(node, index_) {
  const p = node.props || {};
  const role = p.role || "container";
  const title = p.title || p.label || "";
  const layout = p.layout || "stack";
  const direction = p.direction || "vertical";
  const gap = p.gap || "16px";
  const padding = p.padding || "16px";
  const note = p.note || p.children_note || "";

  // CSS vars をそのまま使えるようにする（tokenがあれば）
  const bgColor = p.background || "var(--color-bg, #fff)";
  const borderColor = p.borderBottom || "none";

  const flexDir = direction === "horizontal" ? "row" : "column";

  const extraStyle =
    layout === "grid"
      ? `gridTemplateColumns: ${JSON.stringify(p.columns || "1fr")}, display: 'grid'`
      : `flexDirection: '${flexDir}'`;

  const titleJsx = title
    ? `<h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text, #1a1a1a)' }}>${title}</h2>`
    : "";

  const noteJsx = note
    ? `<p style={{ fontSize: '11px', color: 'var(--color-text-sub, #888)', margin: '4px 0 0' }}>{/* ${note.slice(0, 80)} */}</p>`
    : "";

  return `<div style={{ display: '${layout === "grid" ? "grid" : "flex"}', flexDirection: '${flexDir}', gap: '${gap}', padding: '${padding}', background: '${bgColor}', borderBottom: '${borderColor}' }}>
            <div style={{ fontSize: '10px', color: 'var(--color-primary, #f97316)', fontWeight: 700, marginBottom: 4 }}>[generated: ${role}]</div>
            ${titleJsx}
            ${noteJsx}
          </div>`;
}

// ─── render strategy per node ────────────────────────────────────────────────

/**
 * 各ノードの render 戦略を決定し、JSX + import情報を返す
 */
function planNodeRender(node, index) {
  const kind = node.node_kind;
  const compName = node.component;

  if (kind === "generated" || kind === "primitive") {
    return {
      strategy: "generated",
      jsx: buildGeneratedJsx(node, index),
      import: null,
      renderStatus: "REAL",
    };
  }

  if (kind === "existing_component") {
    const file = resolveComponentFile(compName, index);
    if (!file) {
      return {
        strategy: "fallback",
        jsx: null,
        import: null,
        compName,
        fallbackReason: "component not found in index",
        renderStatus: "FALLBACK",
      };
    }

    const fallbackReason = shouldFallback(compName, file, node.props, index);
    if (fallbackReason) {
      return {
        strategy: "fallback",
        jsx: null,
        import: null,
        compName,
        fallbackReason,
        renderStatus: "FALLBACK",
      };
    }

    const importPath = fileToImportPath(file, hasSrc);
    const propsAttrs = mockPropsAttrs(node.props);

    return {
      strategy: "real",
      // ErrorBoundary で wrap して runtime error を FALLBACK に落とす
      jsx: `<ErrorBoundary key="${compName}" fallback={<FallbackBox name="${compName}" reason="runtime error (required props missing)" />}>\n              <${compName}${propsAttrs} />\n            </ErrorBoundary>`,
      import: { name: compName, path: importPath },
      compName,
      renderStatus: "REAL",
    };
  }

  return {
    strategy: "fallback",
    jsx: null,
    import: null,
    compName: compName || "unknown",
    fallbackReason: `unknown node_kind: ${kind}`,
    renderStatus: "FALLBACK",
  };
}

// ─── build page.tsx ───────────────────────────────────────────────────────────

const nodes = sceneGraph.nodes || [];
const plans = nodes.map((n, i) => ({ ...planNodeRender(n, index), nodeIndex: i, node: n }));

// Deduplicate imports
const imports = new Map();
for (const plan of plans) {
  if (plan.import) {
    imports.set(plan.compName, plan.import);
  }
}

// Stats
const realCount = plans.filter((p) => p.renderStatus === "REAL").length;
const fallbackCount = plans.filter((p) => p.renderStatus === "FALLBACK").length;
const total = plans.length;
const renderRate = total > 0 ? Math.round((realCount / total) * 100) : 0;

console.log(`\nrender planning:`);
for (const plan of plans) {
  const nodeKind = plan.node?.node_kind || "?";
  const compOrRole = plan.compName || plan.node?.props?.role || "generated";
  console.log(`  [${plan.nodeIndex}] ${nodeKind.padEnd(20)} ${plan.renderStatus.padEnd(8)} ${compOrRole}${plan.fallbackReason ? ` (${plan.fallbackReason})` : ""}`);
}
console.log(`\nrender rate: ${realCount}/${total} = ${renderRate}%`);

// Build import lines
const importLines = Array.from(imports.values())
  .map((imp) => `import { ${imp.name} } from "${imp.path}";`)
  .join("\n");

// Build node render JSX
function buildNodeJsx(plan) {
  const i = plan.nodeIndex;
  const nodeKind = plan.node?.node_kind || "?";
  const compOrRole = plan.compName || plan.node?.props?.role || "node";
  const statusColor = plan.renderStatus === "REAL"
    ? "var(--color-positive, #22c55e)"
    : "var(--color-info, #3b82f6)";

  const labelJsx = `
        <div style={{ fontSize: '10px', color: 'var(--color-text-sub, #888)', marginBottom: 4 }}>
          node ${i}: ${compOrRole} (${nodeKind}) —{" "}
          <span style={{ color: '${statusColor}', fontWeight: 700 }}>${plan.renderStatus}</span>
        </div>`;

  if (plan.strategy === "real") {
    return `
      <div style={{ margin: '8px 16px', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, overflow: 'hidden' }}>
        ${labelJsx}
        <div>${plan.jsx}</div>
      </div>`;
  } else if (plan.strategy === "generated") {
    return `
      <div style={{ margin: '8px 16px', border: '1px dashed var(--color-border, #e5e7eb)', borderRadius: 8 }}>
        ${labelJsx}
        ${plan.jsx}
      </div>`;
  } else {
    // fallback
    return `
      <div style={{ margin: '8px 16px', padding: '12px 16px', background: 'var(--color-bg-surface, #f9fafb)', border: '2px dashed var(--color-border, #e5e7eb)', borderRadius: 8 }}>
        ${labelJsx}
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-sub, #888)' }}>FALLBACK: ${plan.fallbackReason || "複雑な依存"}</p>
      </div>`;
  }
}

const nodesJsx = plans.map(buildNodeJsx).join("\n");

// Render rate table rows
const tableRows = plans
  .map((plan) => {
    const compOrRole = plan.compName || plan.node?.props?.role || "generated";
    const nodeKind = plan.node?.node_kind || "?";
    const statusColor = plan.renderStatus === "REAL"
      ? "var(--color-positive, #22c55e)"
      : "var(--color-info, #3b82f6)";
    return `          <tr key={${plan.nodeIndex}} style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
            <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace' }}>${compOrRole}</td>
            <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--color-text-sub, #888)' }}>${nodeKind}</td>
            <td style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '${statusColor}' }}>${plan.renderStatus}${plan.fallbackReason ? ` (${plan.fallbackReason.slice(0, 40)})` : ""}</td>
          </tr>`;
  })
  .join("\n");

const continueOrFix = renderRate >= 60 ? "✅ continue" : "⚠️ fix";

const pageContent = `"use client";

/**
 * continuum ISSUE-004 — 汎用 preview ページ (throwaway)
 * scene-graph: ${sceneGraph.label || "unknown"} (gen-${indexName}.json)
 * generated by: spike/generate-preview.mjs
 *
 * render 率: ${realCount}/${total} = ${renderRate}% → ${continueOrFix}
 */

import { useState, Component, type ReactNode, type ErrorInfo } from "react";
${importLines}

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

type EBProps = { children: ReactNode; fallback: ReactNode };
type EBState = { hasError: boolean };

class ErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.warn("[continuum preview] ErrorBoundary caught:", e.message); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function FallbackBox({ name, reason }: { name: string; reason: string }) {
  return (
    <div style={{ padding: '10px 14px', background: 'var(--color-bg-surface, #f9fafb)', border: '2px dashed var(--color-border, #e5e7eb)', borderRadius: 6 }}>
      <p style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-sub, #888)' }}>
        [FALLBACK: {name}] {reason}
      </p>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ContinuumPreviewPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', background: 'var(--color-bg, #fff)', minHeight: '100vh' }}>
      {/* watermark */}
      <div style={{ background: 'var(--color-primary, #f97316)', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
          continuum preview — ${sceneGraph.label || indexName}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
          gen-${indexName}.json | ${realCount}/${total} REAL (${renderRate}%)
        </span>
      </div>

      {/* nodes */}
      <div style={{ paddingBottom: 80 }}>
${nodesJsx}

        {/* render rate summary */}
        <div style={{ margin: '16px', padding: 16, background: 'var(--color-bg-surface, #f9fafb)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--color-text, #1a1a1a)' }}>
            clean render 率: ${realCount}/${total} (${renderRate}%) — ${continueOrFix}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-sub, #888)' }}>コンポーネント</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-sub, #888)' }}>種別</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-sub, #888)' }}>状態</th>
              </tr>
            </thead>
            <tbody>
${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
`;

// ─── build layout.tsx ─────────────────────────────────────────────────────────

/**
 * standalone layout を生成する
 * root layout の AuthGate / PasswordGate などをbypassし、
 * CSS と安全なプロバイダーだけを wrap する
 */
function buildLayoutContent(cssImports, providers, fontImport, appDir, hasSrc) {
  // CSS imports - resolve relative to preview dir (which is inside app/)
  const cssLines = cssImports
    .map((css) => {
      // "../globals.css" style relative
      if (css.startsWith("./") || css.startsWith("../")) {
        return `import "../${css.replace(/^\.\//, "")}"`;
      }
      return `import "${css}"`;
    })
    .join("\n");

  // Font (Next.js only — optional)
  let fontDef = "";
  let fontClass = "";
  if (fontImport) {
    // Skip font import to keep layout simple; fonts will be inherited from CSS
    fontDef = "";
    fontClass = "";
  }

  // Provider wrapping
  const safeProviders = providers.filter((p) => p.safe);
  const providerImports = safeProviders
    .map((p) => `import { ${p.name} } from "${p.importPath}";`)
    .join("\n");

  const openTags = safeProviders
    .map((p) => `        <${p.name}>`)
    .join("\n");
  const closeTags = safeProviders
    .reverse()
    .map((p) => `        </${p.name}>`)
    .join("\n");

  const inner = safeProviders.length > 0
    ? `${openTags}
          {children}
${closeTags}`
    : `        {children}`;

  return `/**
 * continuum ISSUE-004 — standalone preview layout (throwaway)
 * generated by: spike/generate-preview.mjs
 * AuthGate / PasswordGate をバイパスし、安全なプロバイダーだけ wrap する
 */
import type { Metadata } from "next";
${cssLines}
${providerImports}

export const metadata: Metadata = {
  title: "continuum preview — ${indexName}",
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
${inner}
      </body>
    </html>
  );
}
`;
}

const layoutContent = buildLayoutContent(cssImports, providers, fontImport, appDir, hasSrc);

// ─── write files ─────────────────────────────────────────────────────────────
// NOTE: ISSUE-005 以降、continuum-preview/ ディレクトリの作成・gitignore・AuthGate bypass は
//       ShimEngine (shim-engine.mjs) が担う。ここでは ShimEngine が作成済みのディレクトリに
//       page.tsx / layout.tsx を書き込むだけ。

const previewDir = path.join(appDir, "continuum-preview");
// ShimEngine が apply() 済みなら既にある。なければ（--no-shim 等）ここで作成。
fs.mkdirSync(previewDir, { recursive: true });

const pagePath = path.join(previewDir, "page.tsx");
const layoutPath = path.join(previewDir, "layout.tsx");

fs.writeFileSync(pagePath, pageContent);
fs.writeFileSync(layoutPath, layoutContent);

console.log(`\n  wrote: ${pagePath}`);
console.log(`  wrote: ${layoutPath}`);

// ─── result ───────────────────────────────────────────────────────────────────

console.log(`\n=== 完了 ===`);
console.log(`  preview URL: http://localhost:<PORT>/continuum-preview`);
console.log(`  render rate: ${realCount}/${total} = ${renderRate}% (${continueOrFix})`);
console.log(`  page: ${pagePath}`);
console.log(`  layout: ${layoutPath}`);

// Machine-readable output for cli.mjs
const resultSummary = {
  indexName,
  repoPath,
  previewDir,
  pagePath,
  layoutPath,
  renderRate,
  realCount,
  fallbackCount,
  total,
  continueOrFix,
  nodes: plans.map((p) => ({
    index: p.nodeIndex,
    kind: p.node?.node_kind,
    component: p.compName || p.node?.props?.role || "generated",
    status: p.renderStatus,
    fallbackReason: p.fallbackReason || null,
  })),
};

const summaryPath = path.join(__dirname, "out", `preview-summary-${indexName}.json`);
fs.writeFileSync(summaryPath, JSON.stringify(resultSummary, null, 2));
console.log(`  summary: ${summaryPath}`);
