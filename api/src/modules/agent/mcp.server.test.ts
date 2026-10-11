import { defineAgentTool, registerAgentTools } from "@/lib/agentExtensions";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";
import { buildMcpServer } from "./mcp.server";

const m = vi.hoisted(() => ({
  updateEntryFields: vi.fn(),
  applyAgentChangeset: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("./agent.service", () => ({
  applyAgentChangeset: (...a: unknown[]) => m.applyAgentChangeset(...a),
  listProjects: (...a: unknown[]) => m.listProjects(...a),
  getProjectContext: vi.fn(),
  getSchema: vi.fn(),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  readFiles: vi.fn(),
  searchContent: vi.fn(),
  editFile: vi.fn(),
  undoChange: vi.fn(),
  getDeployStatus: vi.fn(),
  getGitCommands: vi.fn(),
  updateEntryFields: (...a: unknown[]) => m.updateEntryFields(...a),
  createEntry: vi.fn(),
  prepareUpload: vi.fn(),
  listHistory: vi.fn(),
}));
vi.mock("./agent.org", () => ({
  getOrganization: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

const AGENT: TAgentContext = {
  user_id: "u1",
  user_name: "Ada",
  user_email: "ada@example.com",
  client_name: "Claude Code",
  token: "t",
  scopes: new Set([
    EAgentScope.PROJECTS_READ,
    EAgentScope.CONTENT_READ,
    EAgentScope.CONTENT_WRITE,
  ]),
  grant: {
    grant_id: "g1",
    user_id: "u1",
    token_index: "x",
    token_hint: "spat_abcd",
    name: "Claude Code",
    org_id: "o1",
    project_ids: ["p1"],
    scopes: [
      EAgentScope.PROJECTS_READ,
      EAgentScope.CONTENT_READ,
      EAgentScope.CONTENT_WRITE,
    ],
    write_mode: EAgentWriteMode.DIRECT,
  },
};

registerAgentTools(
  defineAgentTool({
    name: "echo_plan",
    description: "Test extension tool",
    scope: EAgentScope.ORG_READ,
    inputSchema: z.object({ word: z.string() }),
    handler: async (agent, { word }) => ({ word, user: agent.user_id }),
  }),
);

const withScopes = (scopes: EAgentScope[]): TAgentContext => ({
  ...AGENT,
  scopes: new Set(scopes),
});

const handlerFor = (agent: TAgentContext) =>
  createMcpHandler(() => buildMcpServer(agent), {
    legacy: "stateless",
    responseMode: "json",
  });

const rpc = async (
  method: string,
  params: Record<string, unknown> = {},
  agent: TAgentContext = AGENT,
) => {
  const res = await handlerFor(agent).fetch(
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

const callTool = async (
  name: string,
  args: Record<string, unknown>,
  agent: TAgentContext = AGENT,
) =>
  (await rpc("tools/call", { name, arguments: args }, agent)).result as {
    isError?: boolean;
    content: { text: string }[];
    structuredContent?: unknown;
  };

const toolNames = async (agent: TAgentContext) =>
  (
    ((await rpc("tools/list", {}, agent)).result?.tools ?? []) as {
      name: string;
    }[]
  ).map((t) => t.name);

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
      "get_schema",
      "list_files",
      "read_files",
      "search_content",
      "list_history",
      "get_deploy_status",
      "get_clone_command",
      "edit_file",
      "update_fields",
      "create_entry",
      "create_upload_url",
      "write_files",
      "move_file",
      "undo_change",
    ]);
    expect(
      tools.find((t) => t.name === "read_files")?.annotations?.readOnlyHint,
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

  it("lists only what the token's scopes allow", async () => {
    const readOnly = await toolNames(
      withScopes([EAgentScope.PROJECTS_READ, EAgentScope.CONTENT_READ]),
    );
    expect(readOnly).toContain("read_files");
    expect(readOnly).not.toContain("write_files");
    expect(readOnly).not.toContain("edit_file");

    const orgAdmin = await toolNames(
      withScopes([EAgentScope.ORG_READ, EAgentScope.MEMBERS_WRITE]),
    );
    expect(orgAdmin).toEqual([
      "get_organization",
      "invite_member",
      "update_member_role",
      "remove_member",
      "echo_plan",
    ]);
  });

  it("returns compact JSON once, without a structured copy", async () => {
    const result = await callTool("list_projects", {});
    expect(result.content[0].text).toBe('{"projects":[{"project_id":"p1"}]}');
    expect(result.structuredContent).toBeUndefined();
  });

  it("runs registered extension tools with the verified agent", async () => {
    const agent = withScopes([EAgentScope.ORG_READ]);
    const result = await callTool("echo_plan", { word: "hi" }, agent);
    expect(JSON.parse(result.content[0].text)).toEqual({
      word: "hi",
      user: "u1",
    });
  });

  it("refuses duplicate extension tool names", () => {
    expect(() =>
      registerAgentTools(
        defineAgentTool({
          name: "echo_plan",
          description: "dup",
          scope: EAgentScope.ORG_READ,
          handler: async () => null,
        }),
      ),
    ).toThrow(/already registered/);
  });

  it("advertises schemas Gemini-style clients accept, while still validating", async () => {
    const everything = withScopes(Object.values(EAgentScope));
    const { result } = await rpc("tools/list", {}, everything);
    const text = JSON.stringify(result?.tools);
    expect(text).not.toContain("$schema");
    expect(text).not.toMatch(/"type":\[/);
    expect(text).not.toContain('"format":"email"');
    const emptyObjects: string[] = [];
    const walk = (node: unknown, where: string, root = false): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (
        !root &&
        n.type === "object" &&
        !Object.keys((n.properties as object) ?? {}).length
      ) {
        emptyObjects.push(where);
      }
      for (const [k, v] of Object.entries(n)) walk(v, `${where}.${k}`);
    };
    for (const t of result?.tools as { name: string; inputSchema: unknown }[]) {
      walk(t.inputSchema, t.name, true);
    }
    expect(emptyObjects).toEqual([]);
    const tools = result?.tools as {
      name: string;
      inputSchema: { properties: Record<string, Record<string, unknown>> };
    }[];
    const files = tools.find((t) => t.name === "write_files")!.inputSchema
      .properties.files as { items: { properties: Record<string, unknown> } };
    expect(files.items.properties.expected_sha).toMatchObject({
      type: "string",
      nullable: true,
    });

    const invite = await callTool(
      "invite_member",
      { email: "not-an-email", role: "editor" },
      everything,
    );
    expect(invite.isError).toBe(true);
    expect(invite.content[0].text).toMatch(/email/i);
  });

  it("takes update_fields values as text or JSON", async () => {
    m.updateEntryFields.mockResolvedValue({ status: "dry_run" });
    await callTool("update_fields", {
      project_id: "p1",
      path: "src/content/a.md",
      message: "Edit",
      set: [
        { field: "title", value: "Hello" },
        { field: "draft", value_json: "false" },
        { field: "tags", value_json: '["a","b"]' },
      ],
    });
    expect(m.updateEntryFields.mock.calls[0][2].set).toEqual({
      title: "Hello",
      draft: false,
      tags: ["a", "b"],
    });
    const bad = await callTool("update_fields", {
      project_id: "p1",
      path: "a.md",
      message: "x",
      set: [{ field: "title" }],
    });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/exactly one of value or value_json/);
  });
});
