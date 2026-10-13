import ApiError from "@/errors/ApiError";
import { defineAgentTool, registerAgentTools } from "@/lib/agentExtensions";
import { GitEngineError } from "@/lib/git-engine/errors";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { availableTools, EGuideTopic } from "./agent.guide";
import { toolFailure } from "./agent.tools";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";
import { buildMcpServer } from "./mcp.server";

const m = vi.hoisted(() => ({
  updateEntryFields: vi.fn(),
  applyAgentChangeset: vi.fn(),
  listProjects: vi.fn(),
  moveFile: vi.fn(),
  editFile: vi.fn(),
}));

vi.mock("./agent.service", () => ({
  onlyProjectId: (agent: TAgentContext) =>
    !agent.grant.all_projects && agent.grant.project_ids.length === 1
      ? agent.grant.project_ids[0]
      : undefined,
  EEntrySort: { DATE_DESC: "date_desc", TITLE_ASC: "title_asc" },
  listEntries: vi.fn(),
  getChange: vi.fn(),
  moveFile: (...a: unknown[]) => m.moveFile(...a),
  applyAgentChangeset: (...a: unknown[]) => m.applyAgentChangeset(...a),
  listProjects: (...a: unknown[]) => m.listProjects(...a),
  getProjectContext: vi.fn(),
  getSchema: vi.fn(),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  readFiles: vi.fn(),
  searchContent: vi.fn(),
  editFile: (...a: unknown[]) => m.editFile(...a),
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
    guide: "Plan questions: echo_plan; never quote prices from memory.",
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
      "get_guide",
      "get_project_context",
      "get_schema",
      "list_files",
      "read_files",
      "search_content",
      "list_entries",
      "list_history",
      "get_change",
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
      "get_guide",
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

type TListedTool = {
  name: string;
  description: string;
  annotations?: Record<string, unknown>;
  inputSchema: { properties: Record<string, unknown>; required?: string[] };
};

const listTools = async (agent: TAgentContext) =>
  ((await rpc("tools/list", {}, agent)).result?.tools ?? []) as TListedTool[];

const instructionsFor = async (agent: TAgentContext) =>
  (
    await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
      agent,
    )
  ).result?.instructions as string;

const ALL = withScopes(Object.values(EAgentScope));
const READ_ONLY = withScopes([
  EAgentScope.PROJECTS_READ,
  EAgentScope.CONTENT_READ,
]);
const PROFILES: [string, TAgentContext][] = [
  ["all scopes", ALL],
  ["read-only", READ_ONLY],
  ["content editor", AGENT],
  ["org only", withScopes([EAgentScope.ORG_READ])],
  [
    "pull-request writer",
    {
      ...AGENT,
      grant: { ...AGENT.grant, write_mode: EAgentWriteMode.PULL_REQUEST },
    },
  ],
];

describe("guidance", () => {
  it.each(PROFILES)(
    "never names a tool the token can't see (%s)",
    async (_, agent) => {
      const known = (await listTools(ALL)).map((t) => t.name);
      const visible = (await listTools(agent)).map((t) => t.name);
      expect(new Set(visible)).toEqual(availableTools(agent));
      const texts = [await instructionsFor(agent)];
      for (const topic of Object.values(EGuideTopic)) {
        const guide = await callTool("get_guide", { topic }, agent);
        expect(guide.isError).toBeUndefined();
        texts.push(guide.content[0].text);
      }
      for (const text of texts) {
        const named = known.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
        expect(named.filter((n) => !visible.includes(n))).toEqual([]);
      }
    },
  );

  it("routes requests, states the write mode and stays short", async () => {
    const all = await instructionsFor(ALL);
    expect(all).toContain("Write mode: direct");
    expect(all).toContain("read_files → update_fields");
    expect(all).toContain("Plan questions: echo_plan");
    expect(all).toContain("get_guide");
    expect(all.split(/\s+/).length).toBeLessThan(400);

    const readOnly = await instructionsFor(READ_ONLY);
    expect(readOnly).toMatch(/read-only.*"Edit content"/);
    expect(readOnly).toContain("Find text: search_content");
    expect(readOnly).not.toContain("echo_plan");

    const pr = await instructionsFor(PROFILES[4][1]);
    expect(pr).toContain("Write mode: pull_request");
  });

  it("says which setting unlocks a recipe the token can't use", async () => {
    const guide = JSON.parse(
      (await callTool("get_guide", { topic: "editing_text" }, READ_ONLY))
        .content[0].text,
    );
    expect(guide).toMatchObject({ available: false });
    expect(guide.note).toContain('"Edit content"');
    const steps = JSON.parse(
      (await callTool("get_guide", { topic: "new_entry" }, ALL)).content[0]
        .text,
    );
    expect(steps.tools).toEqual(
      expect.arrayContaining(["get_schema", "create_entry", "list_entries"]),
    );
    const billing = JSON.parse(
      (await callTool("get_guide", { topic: "billing" }, ALL)).content[0].text,
    );
    expect(billing.steps).toEqual([
      "Plan questions: echo_plan; never quote prices from memory.",
    ]);
  });

  it("gives every tool a title, a short description and honest hints", async () => {
    for (const tool of await listTools(ALL)) {
      if (tool.name === "echo_plan") continue;
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(300);
      expect(tool.annotations?.title, tool.name).toEqual(expect.any(String));
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations.idempotentHint, tool.name).toBe(true);
      }
    }
  });
});

describe("parameters", () => {
  it("lists branch options only with git:branch", async () => {
    const props = async (agent: TAgentContext, name: string) =>
      Object.keys(
        (await listTools(agent)).find((t) => t.name === name)!.inputSchema
          .properties,
      );
    for (const name of [
      "edit_file",
      "update_fields",
      "create_entry",
      "write_files",
      "move_file",
      "undo_change",
    ]) {
      expect(await props(AGENT, name), name).not.toContain("branch");
      expect(await props(ALL, name), name).toEqual(
        expect.arrayContaining(["branch", "open_pr"]),
      );
    }
    for (const name of [
      "edit_file",
      "update_fields",
      "create_entry",
      "write_files",
      "move_file",
      "undo_change",
    ]) {
      expect(await props(AGENT, name), name).toContain("description");
    }
  });

  it("makes project_id optional when the token has one site", async () => {
    const required = async (agent: TAgentContext) =>
      (await listTools(agent)).find((t) => t.name === "read_files")!.inputSchema
        .required;
    expect(await required(AGENT)).not.toContain("project_id");
    expect(
      await required({
        ...AGENT,
        grant: { ...AGENT.grant, project_ids: ["p1", "p2"] },
      }),
    ).toContain("project_id");
  });

  it("moves without expected_sha and passes dry_run through", async () => {
    m.moveFile.mockResolvedValue({ status: "dry_run" });
    await callTool("move_file", {
      from: "a.md",
      to: "b.md",
      message: "Rename",
      dry_run: true,
    });
    const [, projectId, input] = m.moveFile.mock.calls[0];
    expect(projectId).toBeUndefined();
    expect(input).toMatchObject({ from: "a.md", to: "b.md", dry_run: true });
    expect(input.expected_sha).toBeUndefined();
  });
});

describe("errors", () => {
  it("names the bad field instead of dumping the validator report", async () => {
    const result = await callTool(
      "invite_member",
      { email: "not-an-email", role: "editor" },
      ALL,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: expect.stringMatching(/^Invalid input in email/),
      code: "invalid_input",
      fix: expect.stringContaining("email"),
    });
  });

  it("always returns error, code and an optional fix", () => {
    const parse = (error: unknown) =>
      JSON.parse(toolFailure(error).content[0].text);
    expect(parse(new ApiError("gone", 404, ""))).toEqual({
      error: "gone",
      code: "not_found",
    });
    expect(parse(new GitEngineError("no", 403, "policy")).code).toBe(
      "permission",
    );
    expect(parse(new GitEngineError("moved", 409, "ref_moved")).code).toBe(
      "conflict",
    );
    expect(parse(new ApiError("slow down", 429, "")).code).toBe("rate_limited");
    expect(parse(new TypeError("x"))).toEqual({
      error: "The tool failed unexpectedly.",
      code: "unavailable",
    });
  });

  it("passes edit_file's suggestions through to the agent", async () => {
    m.editFile.mockRejectedValue(
      Object.assign(new ApiError("no match", 409, ""), {
        code: "no_match",
        fix: "copy old_string exactly from read_files",
        details: { closest: [{ line: 3, text: "Hello" }] },
      }),
    );
    const result = await callTool("edit_file", {
      path: "a.md",
      edits: [{ old_string: "Helo", new_string: "Hi" }],
      message: "x",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: "no match",
      code: "no_match",
      fix: "copy old_string exactly from read_files",
      closest: [{ line: 3, text: "Hello" }],
    });
  });
});
