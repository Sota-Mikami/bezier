// ISSUE-001 スパイク 生成: component-index を Claude に tool-use で渡し、
// 既存部品を流用した「新しい画面」の scene-graph を生成させる。
// 使い方: ANTHROPIC_API_KEY=... node generate.mjs <indexName> "<intent>"
// 例:     node generate.mjs chomchom "既存部品で、語彙の間隔反復(SRS)復習画面を新規に作って"
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

const indexName = process.argv[2] || "chomchom";
const intent = process.argv[3] || "この repo の既存部品を流用して、設定画面を新規に作って";
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 未設定"); process.exit(1); }
const idx = JSON.parse(fs.readFileSync(`out/${indexName}.json`, "utf8"));
const parts = idx.components.filter((c) => c.kind === "part");
const screens = idx.components.filter((c) => c.kind === "screen");

// キャッシュする design-system カタログ（prompt caching の主対象）
const catalog =
  `# repo: ${idx.repo}\n` +
  `## 既存パーツ（流用候補。これらの実コンポーネントだけで画面を構成すること）\n` +
  parts.map((c) => `- ${c.name} (props: ${c.props ? JSON.stringify(c.props.props ?? c.props.name ?? c.props.kind) : "?"}) [${c.file}]`).join("\n") +
  `\n## 既存スクリーン\n` + screens.map((c) => `- ${c.name} [${c.file}]`).join("\n") +
  `\n## design tokens (CSS変数)\n` + idx.tokens.cssVars.slice(0, 60).join(", ");

const tools = [
  { name: "search_components", description: "概念に合う既存パーツを名前で検索", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_component", description: "パーツの props と file を取得", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "get_tokens", description: "design token 一覧", input_schema: { type: "object", properties: {} } },
  { name: "emit_screen", description: "完成した画面の scene-graph を提出（終了）", input_schema: {
    type: "object", properties: {
      label: { type: "string" },
      route: { type: "string" },
      nodes: { type: "array", items: { type: "object", properties: {
        node_kind: { type: "string", enum: ["existing_component", "generated", "primitive"] },
        component: { type: "string", description: "node_kind=existing_component のとき、流用する既存パーツ名" },
        props: { type: "object" },
        children_note: { type: "string" },
      }, required: ["node_kind"] } },
      reused: { type: "array", items: { type: "string" }, description: "流用した既存パーツ名のリスト" },
    }, required: ["label", "nodes", "reused"],
  } },
];

function runTool(name, input) {
  if (name === "search_components") {
    const q = (input.query || "").toLowerCase();
    const hit = parts.filter((c) => c.name.toLowerCase().includes(q) || (c.file || "").toLowerCase().includes(q));
    return JSON.stringify((hit.length ? hit : parts).slice(0, 20).map((c) => ({ name: c.name, file: c.file })));
  }
  if (name === "get_component") {
    const c = parts.find((x) => x.name === input.name) || idx.components.find((x) => x.name === input.name);
    return JSON.stringify(c ?? { error: "not found" });
  }
  if (name === "get_tokens") return JSON.stringify(idx.tokens);
  return "{}";
}

const client = new Anthropic();
const system = [
  { type: "text", text: "あなたは continuum の生成エンジン。与えられた repo の『既存パーツだけ』を流用して新しい画面の scene-graph を組む。新規UIは最小限。必ず emit_screen で終える。" },
  { type: "text", text: catalog, cache_control: { type: "ephemeral" } },
];
let messages = [{ role: "user", content: `intent: ${intent}\nまず search_components/get_component で使える実パーツを調べ、最後に emit_screen を呼べ。` }];

let emitted = null, turns = 0, usage = { in: 0, out: 0, cache_read: 0, cache_write: 0 };
while (!emitted && turns < 8) {
  turns++;
  const res = await client.messages.create({ model: MODEL, max_tokens: 2000, system, tools, messages });
  usage.in += res.usage.input_tokens; usage.out += res.usage.output_tokens;
  usage.cache_read += res.usage.cache_read_input_tokens || 0; usage.cache_write += res.usage.cache_creation_input_tokens || 0;
  messages.push({ role: "assistant", content: res.content });
  const toolUses = res.content.filter((b) => b.type === "tool_use");
  if (!toolUses.length) { console.log("(no tool use)", res.content.map((b) => b.text || "").join("")); break; }
  const results = [];
  for (const tu of toolUses) {
    if (tu.name === "emit_screen") { emitted = tu.input; results.push({ type: "tool_result", tool_use_id: tu.id, content: "ok" }); }
    else { console.log(`  → ${tu.name}(${JSON.stringify(tu.input).slice(0, 60)})`); results.push({ type: "tool_result", tool_use_id: tu.id, content: runTool(tu.name, tu.input) }); }
  }
  messages.push({ role: "user", content: results });
}

console.log("\n=== RESULT ===");
console.log("model:", MODEL, "turns:", turns);
console.log("tokens:", usage, "(概算コスト確認用)");
if (emitted) {
  const reusedReal = (emitted.reused || []).filter((n) => parts.some((p) => p.name === n));
  console.log(`\nlabel: ${emitted.label}  route: ${emitted.route || "-"}`);
  console.log(`nodes: ${emitted.nodes.length}  existing_component nodes: ${emitted.nodes.filter((n) => n.node_kind === "existing_component").length}`);
  console.log(`reused 実パーツ: ${reusedReal.length}/${(emitted.reused || []).length} → ${reusedReal.join(", ")}`);
  fs.writeFileSync(`out/gen-${indexName}.json`, JSON.stringify(emitted, null, 2));
  console.log(`\n判定: 実パーツ流用 ${reusedReal.length}件 ${reusedReal.length >= 3 ? "✅ continue基準クリア" : "⚠️ 3未満"}`);
} else {
  console.log("emit_screen に到達せず");
}
