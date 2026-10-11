#!/usr/bin/env node
// Checks that every plain-language case in cases.json can be served by this
// token: each expected tool is listed by /mcp. No AI model involved.
// Usage: SITEPINS_TOKEN=spat_… node scripts/mcp-eval/check-cases.mjs [mcp_url]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2] || "http://localhost:4000/mcp";
const token = process.env.SITEPINS_TOKEN;
if (!token) {
  console.error(
    "Usage: SITEPINS_TOKEN=spat_… node scripts/mcp-eval/check-cases.mjs [mcp_url]",
  );
  process.exit(1);
}

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const text = await res.text();
const body = JSON.parse(
  text.startsWith("{")
    ? text
    : (text.split("\n").find((l) => l.startsWith("data: ")) ?? "").slice(6),
);
if (body.error) {
  console.error(`MCP error: ${body.error.message}`);
  process.exit(1);
}
const offered = new Set(body.result.tools.map((t) => t.name));

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
let missing = 0;
for (const c of cases) {
  const absent = c.tools.filter((t) => !offered.has(t));
  const status = absent.length
    ? `missing ${absent.join(", ")}${c.scope ? ` (needs ${c.scope})` : ""}`
    : "ok";
  if (absent.length) missing++;
  console.log(`${c.id.padEnd(18)} ${status}`);
}
console.log(
  `\n${cases.length - missing}/${cases.length} cases servable with this token`,
);
process.exit(missing ? 2 : 0);
