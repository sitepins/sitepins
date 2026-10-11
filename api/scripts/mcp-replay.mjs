#!/usr/bin/env node
// Replays a typical agent session against /mcp and prints per-call timings.
// Usage: SITEPINS_TOKEN=spat_… node scripts/mcp-replay.mjs <project_id> [mcp_url]
// Read-only: the write step is a dry run. Run it twice to see cold vs warm cache.

const [projectId, url = "http://localhost:4000/mcp"] = process.argv.slice(2);
const token = process.env.SITEPINS_TOKEN;
if (!projectId || !token) {
  console.error(
    "Usage: SITEPINS_TOKEN=spat_… node scripts/mcp-replay.mjs <project_id> [mcp_url]",
  );
  process.exit(1);
}

let id = 0;
const rpc = async (method, params = {}) => {
  const started = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  const json = text.startsWith("{")
    ? text
    : (text.split("\n").find((l) => l.startsWith("data: ")) ?? "").slice(6);
  return { ms, bytes: text.length, body: JSON.parse(json || "{}") };
};

const call = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const out = r.body.result?.content?.[0]?.text ?? "";
  const failed = r.body.error || r.body.result?.isError;
  console.log(
    `${name.padEnd(22)} ${String(r.ms).padStart(6)} ms ${String(r.bytes).padStart(8)} B${failed ? `  ERROR ${out.slice(0, 120)}` : ""}`,
  );
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
};

const total = performance.now();
const list = await rpc("tools/list");
console.log(
  `${"tools/list".padEnd(22)} ${String(list.ms).padStart(6)} ms ${String(list.bytes).padStart(8)} B  (${list.body.result?.tools?.length ?? 0} tools)`,
);
await call("list_projects");
const context = await call("get_project_context", { project_id: projectId });
const files = await call("list_files", {
  project_id: projectId,
  path: context?.roots?.content?.[0],
  glob: "**/*.{md,mdx,json}",
  limit: 5,
});
const paths = (files?.files ?? []).slice(0, 5);
for (const path of paths)
  await call("read_files", { project_id: projectId, paths: [path] });
if (paths.length) await call("read_files", { project_id: projectId, paths });
await call("search_content", { project_id: projectId, query: "title" });
await call("get_deploy_status", { project_id: projectId });
if (paths[0]) {
  const file = (
    await call("read_files", { project_id: projectId, paths: [paths[0]] })
  )?.files?.[0];
  const lines = file?.content?.split("\n") ?? [];
  const firstLine = lines.find(
    (l) => l.trim().length > 3 && lines.filter((x) => x === l).length === 1,
  );
  if (firstLine) {
    await call("edit_file", {
      project_id: projectId,
      path: paths[0],
      edits: [{ old_string: firstLine, new_string: firstLine }],
      message: "replay dry run",
      dry_run: true,
    });
  }
}
console.log(
  `${"total".padEnd(22)} ${String(Math.round(performance.now() - total)).padStart(6)} ms`,
);
