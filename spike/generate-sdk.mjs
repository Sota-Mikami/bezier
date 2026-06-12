#!/usr/bin/env node
// ISSUE-002 生成エンジン 経路A: @anthropic-ai/claude-agent-sdk + MCP stdio
// APIキー不要 — CEO の Claude Code サブスク認証で動く
//
// 使い方: node generate-sdk.mjs <indexName> "<intent>"
// 例:     node generate-sdk.mjs chomchom "既存部品で、語彙のSRS復習画面を作って"
import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexName = process.argv[2] || "chomchom";
const intent = process.argv[3] || "この repo の既存部品を流用して、設定画面を新規に作って";

const indexPath = path.join(__dirname, "out", `${indexName}.json`);
if (!fs.existsSync(indexPath)) {
  console.error(`index not found: ${indexPath}`);
  process.exit(1);
}
const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const parts = idx.components.filter((c) => c.kind === "part");

// emit_screen の結果を受け取るための一時ファイル
const emitOutPath = path.join(os.tmpdir(), `bezier-emit-${Date.now()}.json`);

// MCP catalog サーバーの設定
const mcpCatalogPath = path.join(__dirname, "mcp-catalog.mjs");

const systemPrompt = `あなたは bezier の生成エンジン。
与えられた repo の既存パーツだけを流用して、新しい画面の scene-graph を組む。
新規 UI は最小限に留める。必ず emit_screen ツールで終える。

emit_screen のフォーマット:
- label: 画面の名前
- route: /path/to/route
- nodes: 画面を構成するノードのリスト（node_kind は existing_component/generated/primitive）
- reused: 流用した既存パーツ名のリスト（3件以上目指す）

まず search_components や get_component で使える実パーツを確認してから emit_screen を呼べ。`;

const prompt = `repo: ${idx.repo}
intent: ${intent}

まず search_components("") で使えるパーツ一覧を確認し、関連パーツを get_component で詳細確認して、最後に emit_screen で scene-graph を提出せよ。`;

console.log(`\n=== bezier generate (経路A: Agent SDK) ===`);
console.log(`index: ${indexName}  parts: ${parts.length}  intent: ${intent}`);
console.log(`emit out: ${emitOutPath}\n`);

let result = null;
let allText = "";
let turns = 0;

try {
  const queryIter = query({
    prompt,
    options: {
      systemPrompt,
      tools: [], // built-in tools 無効化（MCP ツールのみ使用）
      allowedTools: [
        `mcp__bezier-catalog__search_components`,
        `mcp__bezier-catalog__get_component`,
        `mcp__bezier-catalog__get_tokens`,
        `mcp__bezier-catalog__emit_screen`,
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      mcpServers: {
        "bezier-catalog": {
          type: "stdio",
          command: "node",
          args: [mcpCatalogPath, indexPath],
          env: {
            ...process.env,
            EMIT_OUT_PATH: emitOutPath,
          },
        },
      },
    },
  });

  for await (const message of queryIter) {
    if (message.type === "assistant") {
      turns++;
      const text = message.message?.content
        ?.filter((b) => b.type === "text")
        ?.map((b) => b.text)
        ?.join("") || "";
      if (text) {
        process.stdout.write(`[turn ${turns}] ${text.slice(0, 200)}\n`);
        allText += text;
      }
      // ツール使用をログ
      const toolUses = message.message?.content?.filter((b) => b.type === "tool_use") || [];
      for (const tu of toolUses) {
        console.log(`  → tool: ${tu.name}(${JSON.stringify(tu.input || {}).slice(0, 80)})`);
      }
    } else if (message.type === "result") {
      console.log(`\n[result] stop_reason: ${message.stop_reason || "-"}  cost: $${message.total_cost_usd?.toFixed(4) || "??"}`);
    }
  }
} catch (err) {
  console.error("\n[ERROR]", err.message || err);
  // 経路A失敗の場合は詳細を出力して経路Bへのフォールバック指示
  console.error("\n経路A 失敗。経路B (claude -p) へのフォールバックを検討。");
  process.exit(2);
}

// emit_screen の結果を読み込む
if (fs.existsSync(emitOutPath)) {
  result = JSON.parse(fs.readFileSync(emitOutPath, "utf8"));
  fs.unlinkSync(emitOutPath); // 一時ファイルを削除
}

console.log("\n=== RESULT ===");
console.log(`turns: ${turns}`);

if (result) {
  const reusedReal = (result.reused || []).filter((n) =>
    parts.some((p) => p.name === n)
  );
  console.log(`\nlabel: ${result.label}  route: ${result.route || "-"}`);
  console.log(
    `nodes: ${result.nodes.length}  existing_component nodes: ${result.nodes.filter((n) => n.node_kind === "existing_component").length}`
  );
  console.log(
    `reused 実パーツ: ${reusedReal.length}/${(result.reused || []).length} → ${reusedReal.join(", ")}`
  );

  // schema_version と metadata を付与（scene-graph-schema-v1 準拠）
  const enriched = {
    schema_version: "1",
    source_repo: idx.repo,
    generated_at: new Date().toISOString(),
    intent,
    ...result,
  };

  const outPath = path.join(__dirname, "out", `gen-${indexName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log(`\nscene-graph saved: ${outPath}`);
  console.log(
    `\n判定: 実パーツ流用 ${reusedReal.length}件 ${reusedReal.length >= 3 ? "✅ continue基準クリア" : "⚠️  3未満"}`
  );
} else {
  console.log("emit_screen が呼ばれなかった（MCP経由で受信できず）");
  console.log("assistant text:\n", allText.slice(0, 500));
}
