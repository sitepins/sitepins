import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";
import { buildMcpServer } from "./mcp.server";

const m = vi.hoisted(() => ({
  applyAgentChangeset: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("./agent.service", () => ({
  applyAgentChangeset: (...a: unknown[]) => m.applyAgentChangeset(...a),
  listProjects: (...a: unknown[]) => m.listProjects(...a),
  getProjectContext: vi.fn(),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  listHistory: vi.fn(),
}));

const AGENT: TAgentContext = {
  user_id: "u1",
  user_name: "Ada",
  user_email: "ada@example.com",
  client_name: "Claude Code",
  token: "t",
  scopes: new Set([EAgentScope.CONTENT_READ]),
  grant: {
    grant_id: "g1",
    user_id: "u1",
    token_index: "x",
    token_hint: "spat_abcd",
    name: "Claude Code",
    org_id: "o1",
    project_ids: ["p1"],
    scopes: [EAgentScope.CONTENT_READ],
    write_mode: EAgentWriteMode.DIRECT,
  },
};

const handler = createMcpHandler(() => buildMcpServer(AGENT), {
  legacy: "stateless",
  responseMode: "json",
});

const rpc = async (method: string, params: Record<string, unknown> = {}) => {
  const res = await handler.fetch(
    new Request("http://api.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  // Legacy clients get SSE framing; the JSON-RPC message is on the data line.
  const json = text.startsWith("{")
    ? text
    : (text.split("\n").find((l) => l.startsWith("data: ")) ?? "").slice(6);
  return JSON.parse(json) as {
    result?: Record<string, unknown>;
    error?: unknown;
  };
};

const callTool = async (name: string, args: Record<string, unknown>) =>
  (await rpc("tools/call", { name, arguments: args })).result as {
    isError?: boolean;
    content: { text: string }[];
  };

beforeEach(() => {
  m.applyAgentChangeset.mockReset().mockResolvedValue({
    status: "committed",
    branch: "main",
    commitSha: "c1",
  });
  m.listProjects.mockReset().mockResolvedValue([{ project_id: "p1" }]);
});

describe("remote MCP tools", () => {
  it("lists the tools with read-only and destructive hints", async () => {
    const { result } = await rpc("tools/list");
    const tools = (result?.tools ?? []) as {
      name: string;
      annotations?: Record<string, boolean>;
    }[];
    expect(tools.map((t) => t.name)).toEqual([
      "list_projects",
      "get_project_context",
      "list_files",
      "read_file",
      "list_history",
      "get_clone_command",
      "write_files",
      "move_file",
    ]);
    expect(
      tools.find((t) => t.name === "read_file")?.annotations?.readOnlyHint,
    ).toBe(true);
    expect(
      tools.find((t) => t.name === "write_files")?.annotations?.destructiveHint,
    ).toBe(true);
  });

  it("requires expected_sha (or base_commit) so an agent can't blindly overwrite", async () => {
    const result = await callTool("write_files", {
      project_id: "p1",
      message: "Edit",
      files: [{ path: "src/content/a.md", content: "A2" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/expected_sha/);
    expect(m.applyAgentChangeset).not.toHaveBeenCalled();
  });

  it("passes expected shas and content through to one changeset", async () => {
    await callTool("write_files", {
      project_id: "p1",
      message: "Edit",
      files: [
        { path: "src/content/a.md", content: "A2", expected_sha: "abc" },
        {
          path: "public/images/x.png",
          content_base64: "iVBORw==",
          expected_sha: null,
        },
      ],
      deletes: [{ path: "src/content/old.md", expected_sha: "def" }],
    });

    const [agent, projectId, input] = m.applyAgentChangeset.mock.calls[0];
    expect(agent).toBe(AGENT);
    expect(projectId).toBe("p1");
    expect(input.expected_shas).toEqual({
      "src/content/a.md": "abc",
      "public/images/x.png": null,
      "src/content/old.md": "def",
    });
    expect(
      input.changes.map(
        (c: { op: string; path: string }) => `${c.op} ${c.path}`,
      ),
    ).toEqual([
      "upsert src/content/a.md",
      "upsert public/images/x.png",
      "delete src/content/old.md",
    ]);
    expect(input.changes[1].content).toEqual(Buffer.from("iVBORw==", "base64"));
  });

  it("returns conflicts as readable text with the current remote content", async () => {
    m.applyAgentChangeset.mockResolvedValue({
      status: "conflict",
      branch: "main",
      headSha: "h",
      conflicts: [
        {
          path: "a.md",
          remoteSha: "s",
          remoteContentBase64: Buffer.from("theirs").toString("base64"),
        },
      ],
    });
    const result = await callTool("write_files", {
      project_id: "p1",
      message: "Edit",
      files: [{ path: "a.md", content: "mine", expected_sha: "old" }],
    });
    expect(JSON.parse(result.content[0].text).conflicts[0]).toEqual({
      path: "a.md",
      remote_sha: "s",
      remote_content: "theirs",
    });
  });
});
