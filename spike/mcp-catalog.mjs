#!/usr/bin/env node
// MCP stdio server: component-index を Claude に tool として公開
// 使い方: node mcp-catalog.mjs <indexPath>
// stdin/stdout を MCP JSON-RPC で扱う
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";

const indexPath = process.argv[2];
if (!indexPath) {
  process.stderr.write("usage: node mcp-catalog.mjs <indexPath>\n");
  process.exit(1);
}
const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const parts = idx.components.filter((c) => c.kind === "part");
const screens = idx.components.filter((c) => c.kind === "screen");

const server = new Server(
  { name: "continuum-catalog", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_components",
      description: "概念に合う既存パーツを名前・ファイルパスで検索して返す",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "検索キーワード" } },
        required: ["query"],
      },
    },
    {
      name: "get_component",
      description: "特定のコンポーネント名の props / file / kind を取得する",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "コンポーネント名" } },
        required: ["name"],
      },
    },
    {
      name: "get_tokens",
      description: "repo の design token 一覧（CSS変数・カラー）を返す",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "emit_screen",
      description: "完成した画面の scene-graph を提出して処理を終了させる",
      inputSchema: {
        type: "object",
        properties: {
          label: { type: "string", description: "画面ラベル" },
          route: { type: "string", description: "画面のルートパス" },
          nodes: {
            type: "array",
            description: "scene-graph ノードのリスト",
            items: {
              type: "object",
              properties: {
                node_kind: {
                  type: "string",
                  enum: ["existing_component", "generated", "primitive"],
                },
                component: {
                  type: "string",
                  description: "node_kind=existing_component のとき、流用する既存パーツ名",
                },
                props: { type: "object" },
                children_note: { type: "string" },
              },
              required: ["node_kind"],
            },
          },
          reused: {
            type: "array",
            items: { type: "string" },
            description: "流用した既存パーツ名のリスト",
          },
        },
        required: ["label", "nodes", "reused"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "search_components") {
    const q = ((args && args.query) || "").toLowerCase();
    const hit = parts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.file || "").toLowerCase().includes(q)
    );
    const results = (hit.length ? hit : parts).slice(0, 20).map((c) => ({
      name: c.name,
      file: c.file,
      kind: c.kind,
    }));
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  if (name === "get_component") {
    const compName = (args && args.name) || "";
    const c =
      parts.find((x) => x.name === compName) ||
      idx.components.find((x) => x.name === compName);
    return {
      content: [{ type: "text", text: JSON.stringify(c ?? { error: "not found" }, null, 2) }],
    };
  }

  if (name === "get_tokens") {
    return { content: [{ type: "text", text: JSON.stringify(idx.tokens, null, 2) }] };
  }

  if (name === "emit_screen") {
    // 画面データをファイルに書き出してサーバーを停止させる合図
    const outPath = process.env.EMIT_OUT_PATH;
    if (outPath) {
      fs.writeFileSync(outPath, JSON.stringify(args, null, 2));
    } else {
      // fallback: stdout に書き出す（ただしこれは MCP プロトコルを壊す可能性があるため非推奨）
      process.stderr.write(`EMIT_SCREEN:${JSON.stringify(args)}\n`);
    }
    return { content: [{ type: "text", text: "scene-graph emitted" }] };
  }

  return { content: [{ type: "text", text: `unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
