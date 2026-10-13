import { createFakeGitHub } from "@/lib/git-engine/fake-hosts.fixture";
import { createGitHubClient } from "@/lib/git-engine/github";
import { setAgentAccessGuard } from "@/lib/extensionGuards";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitBlobSha } from "@/lib/git-engine/changeset";
import {
  applyAgentChangeset,
  applyTextEdits,
  commitUpload,
  createEntry,
  editFile,
  getChange,
  getDeployStatus,
  getGitCommands,
  listEntries,
  moveFile,
  getProjectContext,
  getSchema,
  listFiles,
  prepareUpload,
  listProjects,
  readFile,
  readFiles,
  searchContent,
  undoChange,
  logTypeFor,
  policyFor,
  resolveProject,
  rootsFromConfig,
  updateEntryFields,
} from "./agent.service";
import { redeemUploadTicket } from "./agent.auth";
import { clearAgentCaches, forgetHead, withCache } from "./agent.cache";
import {
  EAgentScope,
  EAgentWriteMode,
  EContextPart,
  TAgentContext,
} from "./agent.type";

const m = vi.hoisted(() => ({
  projectFindOne: vi.fn(),
  projectFind: vi.fn(),
  logInsertMany: vi.fn(),
  broadcast: vi.fn(),
  upstream: 0,
  fake: undefined as unknown as ReturnType<
    typeof import("@/lib/git-engine/fake-hosts.fixture").createFakeGitHub
  >,
}));
const { projectFindOne, logInsertMany, broadcast } = m;

vi.mock("@/config/variables", async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>();
  return {
    default: {
      ...actual.default,
      base_url: "http://api.test",
      better_auth_secret: "test-secret",
    },
  };
});
vi.mock("@/modules/project/project.model", () => ({
  Project: {
    findOne: (...a: unknown[]) => ({ lean: () => m.projectFindOne(...a) }),
    find: (...a: unknown[]) => ({
      select: () => ({ lean: () => m.projectFind(...a) }),
    }),
  },
}));
vi.mock("./agent-grant.model", () => ({
  AgentGrant: {
    findOne: () => ({
      lean: async () => ({
        grant_id: "g1",
        user_id: "u1",
        name: "Claude Code",
        org_id: "org-1",
        project_ids: ["p1"],
        scopes: ["projects:read", "content:read", "media:write"],
        write_mode: "direct",
      }),
    }),
    updateOne: () => ({ catch: () => undefined }),
  },
}));
vi.mock("@/modules/user/user.model", () => ({
  User: {
    findOne: () => ({
      select: () => ({
        lean: async () => ({ user_id: "u1", full_name: "Ada", email: "a@x" }),
      }),
    }),
  },
}));
vi.mock("@/lib/resourceAuth", () => ({
  requireOrgAccess: async () => ({ role: "editor" }),
}));
vi.mock("@/modules/project-log/project-log.model", () => ({
  ProjectLog: { insertMany: (...a: unknown[]) => m.logInsertMany(...a) },
}));
vi.mock("@/modules/common/editor.gateway", () => ({
  broadcastExternalCommit: (...a: unknown[]) => m.broadcast(...a),
}));
vi.mock("./agent.git", () => {
  const client = (branch = "main") =>
    createGitHubClient({
      repository: m.fake.repository,
      branch,
      token: "ghs_test",
      fetchImpl: m.fake.fetchImpl,
      onRequest: () => m.upstream++,
    });
  return {
    getProjectToken: async () => ({ token: "ghs_test" }),
    isGitLabProject: () => false,
    createProjectGitClient: async (
      _project: unknown,
      _user: string,
      branch?: string,
    ) => client(branch),
    createCachedProjectGitClient: async () =>
      withCache(client(), { repoKey: "github:acme/site", projectId: "p1" }),
  };
});

const SITE_CONFIG = JSON.stringify({
  content: "src/content",
  media: "public/images",
  configs: ["src/config"],
});
const PROJECT = {
  project_id: "p1",
  org_id: "org-1",
  project_name: "Site",
  provider: "Github",
  repository: "acme/site",
  branch: "main",
  status: "active",
};

const agent = (
  overrides: Partial<TAgentContext["grant"]> = {},
  scopes?: EAgentScope[],
): TAgentContext => {
  const grantScopes = scopes ?? [
    EAgentScope.PROJECTS_READ,
    EAgentScope.CONTENT_READ,
    EAgentScope.CONTENT_WRITE,
  ];
  return {
    user_id: "u1",
    user_name: "Ada",
    user_email: "ada@private.example",
    client_name: "Claude Code",
    token: "t",
    scopes: new Set(grantScopes),
    grant: {
      grant_id: "g1",
      user_id: "u1",
      token_index: "x",
      token_hint: "spat_abcd",
      name: "Claude Code",
      org_id: "org-1",
      project_ids: ["p1"],
      scopes: grantScopes,
      write_mode: EAgentWriteMode.DIRECT,
      ...overrides,
    },
  };
};

const upsert = (path: string, text: string) => ({
  op: "upsert" as const,
  path,
  content: Buffer.from(text),
});

beforeEach(() => {
  // The fake host reuses commit shas between tests, so cached trees must go.
  clearAgentCaches();
  m.upstream = 0;
  m.fake = createFakeGitHub({
    ".sitepins/config.json": SITE_CONFIG,
    "src/content/a.md": "A",
    "package.json": "{}",
  });
  projectFindOne.mockReset().mockResolvedValue(PROJECT);
  logInsertMany.mockReset().mockResolvedValue([]);
  broadcast.mockReset();
});

describe("resolveProject", () => {
  it("hides projects outside the grant or its organization", async () => {
    await expect(
      resolveProject(
        agent({ project_ids: ["other"] }),
        "p1",
        EAgentScope.CONTENT_READ,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    projectFindOne.mockResolvedValue({ ...PROJECT, org_id: "org-2" });
    await expect(
      resolveProject(agent(), "p1", EAgentScope.CONTENT_READ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets an all-sites grant reach any site in its organization, but no other", async () => {
    const all = agent({ project_ids: [], all_projects: true });
    await expect(
      resolveProject(all, "p1", EAgentScope.CONTENT_READ),
    ).resolves.toMatchObject({ project_id: "p1" });
    projectFindOne.mockResolvedValue({ ...PROJECT, org_id: "org-2" });
    await expect(
      resolveProject(all, "p1", EAgentScope.CONTENT_READ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("requires the scope", async () => {
    await expect(
      resolveProject(
        agent({}, [EAgentScope.PROJECTS_READ]),
        "p1",
        EAgentScope.CONTENT_READ,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects non-string ids", async () => {
    await expect(
      resolveProject(agent(), { $ne: "" }, EAgentScope.CONTENT_READ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("policy", () => {
  const roots = rootsFromConfig(JSON.parse(SITE_CONFIG));

  it("maps scopes to the folders from .sitepins/config.json", () => {
    expect(policyFor(new Set([EAgentScope.CONTENT_WRITE]), roots)).toEqual({
      writableRoots: ["src/content", "src/config"],
    });
    expect(
      policyFor(
        new Set([EAgentScope.MEDIA_WRITE, EAgentScope.SCHEMA_WRITE]),
        roots,
      ),
    ).toEqual({
      writableRoots: ["public/images", ".sitepins/schema", ".sitepins/snippet"],
    });
    expect(policyFor(new Set([EAgentScope.CODE_WRITE]), roots)).toEqual({
      writableRoots: "all",
    });
  });

  it("ignores config roots that try to escape the repository", () => {
    expect(
      rootsFromConfig({
        content: "../../etc",
        media: "/abs",
        configs: [".", "ok"],
      }),
    ).toEqual({
      content: ["ok"],
      media: [],
      schema: [".sitepins/schema", ".sitepins/snippet"],
    });
  });

  it("classifies activity log entries", () => {
    expect(logTypeFor("src/content/a.md", roots, JSON.parse(SITE_CONFIG))).toBe(
      "content",
    );
    expect(
      logTypeFor("src/config/site.json", roots, JSON.parse(SITE_CONFIG)),
    ).toBe("config");
    expect(
      logTypeFor(".sitepins/schema/post.json", roots, JSON.parse(SITE_CONFIG)),
    ).toBe("schema");
    expect(
      logTypeFor("public/images/x.png", roots, JSON.parse(SITE_CONFIG)),
    ).toBe("media");
    expect(logTypeFor("package.json", roots, JSON.parse(SITE_CONFIG))).toBe(
      "code",
    );
  });
});

describe("applyAgentChangeset", () => {
  it("commits as the bot, logs the agent and warns open editors", async () => {
    const result = await applyAgentChangeset(agent(), "p1", {
      message: "Update post",
      base_commit: m.fake.git.head(),
      changes: [
        upsert("src/content/a.md", "A2"),
        upsert("src/content/b.md", "B"),
      ],
    });

    expect(result).toMatchObject({ status: "committed", branch: "main" });
    const commit = m.fake.git.lastCommit();
    expect(commit.author).toBeUndefined();
    expect(commit.message).toBe(
      "Update post\n\nSitepins-User: Ada\nSitepins-Agent: Claude Code",
    );
    expect(commit.message).not.toContain("ada@private.example");
    expect(logInsertMany.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        file: "src/content/a.md",
        action: "update",
        file_type: "content",
        via: "Claude Code",
      }),
      expect.objectContaining({
        file: "src/content/b.md",
        action: "create",
        via: "Claude Code",
      }),
    ]);
    expect(broadcast).toHaveBeenCalledWith(
      "org-1",
      "p1",
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/content/a.md",
          via: "Claude Code",
        }),
      ]),
    );
  });

  it("refuses files outside the granted folders without committing anything", async () => {
    const head = m.fake.git.head();
    await expect(
      applyAgentChangeset(agent(), "p1", {
        message: "Sneaky",
        changes: [
          upsert("src/content/a.md", "A2"),
          upsert("package.json", '{"scripts":{"build":"curl x|sh"}}'),
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "policy" });
    expect(m.fake.git.head()).toBe(head);
  });

  it("treats .sitepins/config.json as code, since it defines the writable folders", async () => {
    const scopes = [
      EAgentScope.PROJECTS_READ,
      EAgentScope.CONTENT_READ,
      EAgentScope.CONTENT_WRITE,
      EAgentScope.SCHEMA_WRITE,
    ];
    await expect(
      applyAgentChangeset(agent({}, scopes), "p1", {
        message: "Widen my access",
        changes: [
          upsert(".sitepins/config.json", JSON.stringify({ content: "." })),
        ],
      }),
    ).rejects.toMatchObject({ code: "policy" });
    await expect(
      applyAgentChangeset(agent({}, scopes), "p1", {
        message: "Schema",
        changes: [upsert(".sitepins/schema/post.json", "{}")],
      }),
    ).resolves.toMatchObject({ status: "committed" });
  });

  it("names the permission that would allow a refused path", async () => {
    const attempt = applyAgentChangeset(agent(), "p1", {
      message: "x",
      changes: [
        upsert("public/images/x.png", "PNG"),
        upsert("package.json", "{}"),
      ],
    });
    await expect(attempt).rejects.toMatchObject({
      violations: [
        {
          path: "public/images/x.png",
          reason: expect.stringMatching(
            /^needs the media:write permission \("Manage media" in Sitepins/,
          ),
        },
        {
          path: "package.json",
          reason: expect.stringContaining('"Edit code"'),
        },
      ],
    });
  });

  it("never writes CI workflows, even with code access", async () => {
    const all = Object.values(EAgentScope);
    await expect(
      applyAgentChangeset(agent({}, all), "p1", {
        message: "CI",
        changes: [upsert(".github/workflows/x.yml", "on: push")],
      }),
    ).rejects.toMatchObject({ code: "policy" });
  });

  it("rejects writes from read-only grants and archived projects", async () => {
    await expect(
      applyAgentChangeset(
        agent({}, [EAgentScope.PROJECTS_READ, EAgentScope.CONTENT_READ]),
        "p1",
        {
          message: "x",
          changes: [upsert("src/content/a.md", "A2")],
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    projectFindOne.mockResolvedValue({ ...PROJECT, status: "archived" });
    await expect(
      applyAgentChangeset(agent(), "p1", {
        message: "x",
        changes: [upsert("src/content/a.md", "A2")],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("sends pull-request grants to a sitepins/ branch and leaves the project branch alone", async () => {
    const mainHead = m.fake.git.head();
    const result = await applyAgentChangeset(
      agent({ write_mode: EAgentWriteMode.PULL_REQUEST }),
      "p1",
      {
        message: "Proposed edit",
        changes: [upsert("src/content/a.md", "A2")],
      },
    );

    expect(result.status).toBe("committed");
    expect(result.branch).toMatch(/^sitepins\/agent-/);
    expect(result.pull_request).toEqual({
      number: 1,
      url: "https://github.test/pull/1",
    });
    expect(m.fake.git.head()).toBe(mainHead);
    expect(m.fake.git.text("src/content/a.md", result.branch)).toBe("A2");
    expect(result.next_step).toMatch(/pull_request\.url/);
    expect(broadcast).not.toHaveBeenCalled();
    expect(logInsertMany).not.toHaveBeenCalled();
  });

  it("won't let a pull-request grant pick an arbitrary branch, or a direct grant branch without git:branch", async () => {
    await expect(
      applyAgentChangeset(
        agent({ write_mode: EAgentWriteMode.PULL_REQUEST }),
        "p1",
        {
          message: "x",
          branch: "release",
          changes: [upsert("src/content/a.md", "A2")],
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      applyAgentChangeset(agent(), "p1", {
        message: "x",
        branch: "sitepins/x",
        changes: [upsert("src/content/a.md", "A2")],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns conflicts instead of committing over someone else's change", async () => {
    const base = m.fake.git.head();
    m.fake.git.push({ "src/content/a.md": "A-editor" });
    const result = await applyAgentChangeset(agent(), "p1", {
      message: "x",
      base_commit: base,
      changes: [upsert("src/content/a.md", "A2")],
    });
    expect(result.status).toBe("conflict");
    expect(logInsertMany).not.toHaveBeenCalled();
  });
});

describe("agent access guard", () => {
  afterEach(() => setAgentAccessGuard(() => undefined));

  it("lets a deployment refuse writes (e.g. by plan) before anything is committed, checking once", async () => {
    const seen: boolean[] = [];
    setAgentAccessGuard(({ write }) => {
      seen.push(write);
      if (write)
        throw Object.assign(new Error("Upgrade needed"), { statusCode: 402 });
    });
    const head = m.fake.git.head();

    await expect(
      applyAgentChangeset(agent(), "p1", {
        message: "x",
        changes: [upsert("src/content/a.md", "A2")],
      }),
    ).rejects.toThrow("Upgrade needed");
    expect(seen).toEqual([true]);
    expect(m.fake.git.head()).toBe(head);
  });
});

describe("listProjects", () => {
  afterEach(() => setAgentAccessGuard(() => undefined));

  it("lists the whole organization for an all-sites grant and only picked sites otherwise", async () => {
    m.projectFind.mockResolvedValue([PROJECT]);
    await listProjects(agent({ project_ids: [], all_projects: true }));
    expect(m.projectFind.mock.calls[0][0]).toEqual({ org_id: "org-1" });
    await listProjects(agent());
    expect(m.projectFind.mock.calls[1][0]).toEqual({
      org_id: "org-1",
      project_id: { $in: ["p1"] },
    });
  });

  it("drops sites the deployment refuses, and reports why when none are left", async () => {
    m.projectFind.mockResolvedValue([
      { ...PROJECT, user_id: "paid" },
      { ...PROJECT, project_id: "p2", user_id: "free" },
    ]);
    setAgentAccessGuard(({ project_owner_id }) => {
      if (project_owner_id === "free") throw new Error("Needs Pro");
    });
    const listed = await listProjects(agent({ all_projects: true }));
    expect(listed.map((p) => p.project_id)).toEqual(["p1"]);

    m.projectFind.mockResolvedValue([{ ...PROJECT, user_id: "free" }]);
    await expect(listProjects(agent())).rejects.toThrow("Needs Pro");
  });
});

it("caps commits per token at 30 per 10 minutes, without counting dry runs", async () => {
  const capped = agent({ grant_id: "busy-grant" });
  for (let i = 0; i < 30; i++) {
    await applyAgentChangeset(capped, "p1", {
      message: `c${i}`,
      changes: [upsert("src/content/a.md", `A${i}`)],
    });
  }
  await expect(
    applyAgentChangeset(capped, "p1", {
      message: "dry",
      dry_run: true,
      changes: [upsert("src/content/a.md", "dry")],
    }),
  ).resolves.toMatchObject({ status: "dry_run" });
  await expect(
    applyAgentChangeset(capped, "p1", {
      message: "one too many",
      changes: [upsert("src/content/a.md", "x")],
    }),
  ).rejects.toMatchObject({
    statusCode: 429,
    code: "rate_limited",
    details: { retry_after_seconds: expect.any(Number) },
  });
});

describe("cached reads", () => {
  it("serves a repeated read from memory, and sees a new commit once the head moves", async () => {
    const first = await readFile(agent(), "p1", { path: "src/content/a.md" });
    const cold = m.upstream;
    expect(cold).toBeGreaterThan(0);

    const again = await readFile(agent(), "p1", { path: "src/content/a.md" });
    expect(again.content).toBe("A");
    expect(m.upstream).toBe(cold);

    m.fake.git.push({ "src/content/a.md": "A2" });
    forgetHead("p1");
    const fresh = await readFile(agent(), "p1", { path: "src/content/a.md" });
    expect(fresh.content).toBe("A2");
    expect(fresh.sha).not.toBe(first.sha);
  });

  it("reads several files in one batch and reports missing ones", async () => {
    m.fake.git.push({ "src/content/b.md": "B" });
    const result = await readFiles(agent(), "p1", {
      paths: ["src/content/a.md", "src/content/b.md", "nope.md"],
    });
    expect(result.files).toEqual([
      expect.objectContaining({ path: "src/content/a.md", content: "A" }),
      expect.objectContaining({ path: "src/content/b.md", content: "B" }),
      { path: "nope.md", error: "not found", code: "not_found" },
    ]);
    expect(
      m.fake.state.requests.filter((r) => r === "POST /graphql"),
    ).toHaveLength(1);
  });

  it("drops the cached head after the agent's own commit", async () => {
    const before = await readFile(agent(), "p1", { path: "src/content/a.md" });
    await applyAgentChangeset(agent(), "p1", {
      message: "Edit",
      expected_shas: { "src/content/a.md": before.sha },
      changes: [upsert("src/content/a.md", "A3")],
    });
    const after = await readFile(agent(), "p1", { path: "src/content/a.md" });
    expect(after.content).toBe("A3");
  });
});

describe("listFiles", () => {
  beforeEach(() => {
    m.fake.git.push({
      "src/content/blog/one.md": "1",
      "src/content/blog/two.mdx": "2",
      "src/content/blog/img.png": "P",
    });
  });

  it("returns bare paths, filtered by glob relative to the folder", async () => {
    const result = await listFiles(agent(), "p1", {
      path: "src/content",
      glob: "blog/*.{md,mdx}",
    });
    expect(result.files).toEqual([
      "src/content/blog/one.md",
      "src/content/blog/two.mdx",
    ]);
    expect(result).not.toHaveProperty("dirs");
  });

  it("pages with a cursor", async () => {
    const page1 = await listFiles(agent(), "p1", { limit: 2 });
    expect(page1.files).toHaveLength(2);
    expect(page1.next_cursor).toBe("2");
    const page2 = await listFiles(agent(), "p1", {
      limit: 2,
      cursor: page1.next_cursor,
      include_sha: true,
    });
    expect(page2.files[0]).toEqual({
      path: expect.any(String),
      sha: expect.any(String),
    });
    expect(page2.total_files).toBe(page1.total_files);
  });
});

describe("searchContent", () => {
  it("searches the content folders and reports path:line matches", async () => {
    m.fake.git.push({
      "src/content/post.md": "---\ntitle: Hello\n---\nSay hello world",
      "src/layouts/base.astro": "hello from code",
    });
    const result = await searchContent(agent(), "p1", { query: "HELLO" });
    expect(result.searched_in).toEqual([
      "src/content",
      "src/config",
      "(rest of the site: templates, styles, settings)",
    ]);
    expect(result.matches).toEqual([
      {
        path: "src/content/post.md",
        line: 2,
        text: "title: Hello",
        area: "content",
        can_edit: true,
      },
      {
        path: "src/content/post.md",
        line: 4,
        text: "Say hello world",
        area: "content",
        can_edit: true,
      },
      {
        path: "src/layouts/base.astro",
        line: 1,
        text: "hello from code",
        area: "site",
        can_edit: false,
      },
    ]);

    const exact = await searchContent(agent(), "p1", {
      query: "Hello",
      case_sensitive: true,
      path: "src",
    });
    expect(exact.matches.map((x) => x.line)).toEqual([2]);
  });

  it("finds templates and styles too, and says which setting unlocks them", async () => {
    m.fake.git.push({
      "src/layouts/components/Banner.astro": '<div class="banner bg-blue-500">',
      "node_modules/x/banner.js": "banner",
      "package-lock.json": '"banner"',
    });
    const result = await searchContent(agent(), "p1", { query: "banner" });
    expect(result.searched_in).toEqual([
      "src/content",
      "src/config",
      "(rest of the site: templates, styles, settings)",
    ]);
    expect(result.matches).toEqual([
      expect.objectContaining({
        path: "src/layouts/components/Banner.astro",
        area: "site",
        can_edit: false,
      }),
    ]);
    expect(result.permission_hint).toContain('"Edit code"');
  });
});

describe("editFile", () => {
  it("replaces text and commits without the caller sending the file", async () => {
    m.fake.git.push({ "src/content/a.md": "title: Old\nbody" });
    const result = await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "Old", new_string: "New" }],
      message: "Rename",
    });
    expect(result.status).toBe("committed");
    expect(m.fake.git.text("src/content/a.md")).toBe("title: New\nbody");
  });

  it("refuses an edit whose text is missing or ambiguous", () => {
    expect(() =>
      applyTextEdits("a.md", "x x", [{ old_string: "y", new_string: "z" }]),
    ).toThrow(expect.objectContaining({ code: "no_match" }));
    expect(() =>
      applyTextEdits("a.md", "x x", [{ old_string: "x", new_string: "z" }]),
    ).toThrow(expect.objectContaining({ code: "ambiguous" }));
    expect(
      applyTextEdits("a.md", "x x $&", [
        { old_string: "x", new_string: "$1", replace_all: true },
      ]),
    ).toBe("$1 $1 $&");
  });

  it("reports a conflict when the file moved past the given sha", async () => {
    const result = await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "A", new_string: "B" }],
      message: "Edit",
      expected_sha: "0".repeat(40),
    });
    expect(result.status).toBe("conflict");
    expect(m.fake.git.text("src/content/a.md")).toBe("A");
  });

  it("needs a write scope", async () => {
    await expect(
      editFile(
        agent({}, [EAgentScope.PROJECTS_READ, EAgentScope.CONTENT_READ]),
        "p1",
        {
          path: "src/content/a.md",
          edits: [{ old_string: "A", new_string: "B" }],
          message: "Edit",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("getProjectContext", () => {
  beforeEach(() => {
    m.fake.git.push({
      ".sitepins/schema/blog.json": JSON.stringify({
        name: "blog",
        file: "src/content/blog",
        template: [{ name: "title", type: "text", isRequired: true }],
      }),
    });
  });

  it("returns a summary by default and details on request, built once per head", async () => {
    const summary = await getProjectContext(agent(), "p1");
    expect(summary.schemas).toEqual([
      {
        name: "blog",
        path: ".sitepins/schema/blog.json",
        file: "src/content/blog",
      },
    ]);
    expect(summary).not.toHaveProperty("site_config");
    const afterFirst = m.upstream;

    const detailed = await getProjectContext(agent(), "p1", [
      EContextPart.SCHEMAS,
      EContextPart.CONFIG,
    ]);
    expect(detailed.schemas[0]).toMatchObject({
      fields: [{ name: "title", type: "text", required: true }],
    });
    expect(detailed.site_config).toEqual(JSON.parse(SITE_CONFIG));
    expect(m.upstream).toBe(afterFirst);
  });

  it("points plain-language requests at settings, styles and templates", async () => {
    m.fake.git.push({
      "src/config/menu.json": "{}",
      "src/config/theme.json": "{}",
      "src/styles/main.css": "",
      "tailwind.config.js": "",
      "src/layouts/components/Banner.astro": "",
      "src/pages/index.astro": "",
      "src/content/sections/cta.md": "",
      "node_modules/pkg/style.css": "",
    });
    const context = await getProjectContext(agent(), "p1");
    expect(context.where_to_edit).toMatchObject({
      settings: ["src/config/menu.json", "src/config/theme.json"],
      styles: [
        "src/config/theme.json",
        "src/styles/main.css",
        "tailwind.config.js",
      ],
      templates: ["src/layouts", "src/layouts/components", "src/pages"],
    });
  });

  it("returns one schema in full by name", async () => {
    const result = await getSchema(agent(), "p1", "blog");
    expect(result.path).toBe(".sitepins/schema/blog.json");
    expect(result.schema).toMatchObject({ name: "blog" });
    await expect(getSchema(agent(), "p1", "nope")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("undoChange", () => {
  it("puts back every file the commit touched, including removing a file it added", async () => {
    const before = m.fake.git.head();
    const change = m.fake.git.push({
      "src/content/a.md": "A changed",
      "src/content/new.md": "added",
    });
    const result = await undoChange(agent(), "p1", { commit_sha: change });
    expect(result.status).toBe("committed");
    expect(m.fake.git.text("src/content/a.md")).toBe("A");
    expect(m.fake.git.text("src/content/new.md")).toBeNull();
    expect(m.fake.git.lastCommit().message).toMatch(/^Undo "external"/);
    expect(result.undone.files).toEqual([
      { path: "src/content/a.md", action: "restored" },
      { path: "src/content/new.md", action: "removed (it was added)" },
    ]);
    expect(before).not.toBe(m.fake.git.head());
  });

  it("keeps the caller's description above the revert note", async () => {
    const change = m.fake.git.push({ "src/content/a.md": "A changed" });
    await undoChange(agent(), "p1", {
      commit_sha: change,
      description: "The user asked for the old wording back.",
    });
    expect(m.fake.git.lastCommit().message).toContain(
      `The user asked for the old wording back.\n\nReverts ${change}.`,
    );
  });

  it("won't overwrite a file someone changed after that commit", async () => {
    const change = m.fake.git.push({ "src/content/a.md": "A changed" });
    m.fake.git.push({ "src/content/a.md": "A edited again" });
    const result = await undoChange(agent(), "p1", { commit_sha: change });
    expect(result.status).toBe("conflict");
    expect(m.fake.git.text("src/content/a.md")).toBe("A edited again");
  });

  it("previews with dry_run and refuses unknown commits", async () => {
    const change = m.fake.git.push({ "src/content/a.md": "A changed" });
    const preview = await undoChange(agent(), "p1", {
      commit_sha: change,
      dry_run: true,
    });
    expect(preview.status).toBe("dry_run");
    expect(m.fake.git.text("src/content/a.md")).toBe("A changed");
    await expect(
      undoChange(agent(), "p1", { commit_sha: "f".repeat(40) }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("getDeployStatus", () => {
  it("summarises a successful deploy with its live URL", async () => {
    const head = m.fake.git.head();
    m.fake.state.statuses.set(head, [
      { context: "netlify", state: "success", target_url: "https://n.test/1" },
    ]);
    m.fake.state.deployments.push({
      id: 7,
      sha: head,
      environment: "production",
      state: "success",
      url: "https://site.test",
    });
    const result = await getDeployStatus(agent(), "p1", {});
    expect(result).toMatchObject({
      commit: head,
      is_latest: true,
      state: "live",
      deployments: [
        {
          environment: "production",
          state: "success",
          url: "https://site.test",
        },
      ],
    });
    expect(result.summary).toContain("https://site.test");
  });

  it("reports a failed build with its reason, and building while pending", async () => {
    const head = m.fake.git.head();
    m.fake.state.statuses.set(head, [
      {
        context: "vercel",
        state: "failure",
        description: "Build failed",
        target_url: "https://v.test/log",
      },
    ]);
    const failed = await getDeployStatus(agent(), "p1", {});
    expect(failed.state).toBe("failed");
    expect(failed.summary).toContain("Build failed");
    expect(failed.summary).toContain("https://v.test/log");

    m.fake.state.statuses.set(head, [{ context: "vercel", state: "pending" }]);
    expect((await getDeployStatus(agent(), "p1", {})).state).toBe("building");
  });

  it("says it can't tell when the host reports nothing", async () => {
    const result = await getDeployStatus(agent(), "p1", {});
    expect(result.state).toBe("unknown");
    expect(result.summary).toMatch(/can't tell/);
  });
});

describe("getGitCommands", () => {
  it("returns prompt-free commands with a short-lived read-only token", async () => {
    const result = await getGitCommands(
      { ...agent(), token: "spat_real_secret" },
      "p1",
      {},
    );
    expect(result.local_state).toBe("unknown");
    expect(result.commands.clone).toMatch(
      /^GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c http.extraHeader= -c "http.extraHeader=Authorization: Bearer spgt_[^"]+" clone --branch main http:\/\/api.test\/git\/p1.git site$/,
    );
    expect(result.commands.sync).toContain(
      "+refs/heads/main:refs/remotes/origin/main && git rebase --autostash origin/main",
    );
    expect(JSON.stringify(result)).not.toContain("spat_real_secret");
  });

  it("tells whether the clone is up to date or behind, and what changed", async () => {
    const old = m.fake.git.head();
    expect(
      (await getGitCommands(agent(), "p1", { local_head: old })).local_state,
    ).toBe("up_to_date");

    m.fake.git.push({ "src/content/b.md": "B" });
    forgetHead("p1");
    const behind = await getGitCommands(agent(), "p1", { local_head: old });
    expect(behind).toMatchObject({
      local_state: "behind",
      changed_files_since_local: ["src/content/b.md"],
    });
  });

  it("spots local commits Sitepins never saw", async () => {
    const result = await getGitCommands(agent(), "p1", {
      local_head: "a".repeat(40),
    });
    expect(result.local_state).toBe("has_unsaved_local_commits");
    expect(result.next_step).toMatch(/write_files/);
  });
});

describe("updateEntryFields", () => {
  it("changes only the named frontmatter fields", async () => {
    m.fake.git.push({
      "src/content/post.md":
        "---\ntitle: Old # keep\ndraft: true\n---\nBody text\n",
    });
    const result = await updateEntryFields(agent(), "p1", {
      path: "src/content/post.md",
      set: { title: "New", "banner.color": "red" },
      unset: ["draft"],
      message: "Update post",
    });
    expect(result.status).toBe("committed");
    expect(m.fake.git.text("src/content/post.md")).toBe(
      "---\ntitle: New # keep\nbanner:\n  color: red\n---\nBody text\n",
    );
    expect(result.changed).toEqual(["title", "banner.color", "-draft"]);
  });

  it("previews the new frontmatter with dry_run", async () => {
    m.fake.git.push({ "src/config/theme.json": '{\n  "color": "blue"\n}\n' });
    const result = await updateEntryFields(agent(), "p1", {
      path: "src/config/theme.json",
      set: { color: "red" },
      message: "Make it red",
      dry_run: true,
    });
    expect(result.status).toBe("dry_run");
    expect(result.new_frontmatter).toBe('{\n  "color": "red"\n}\n');
    expect(m.fake.git.text("src/config/theme.json")).toContain("blue");
  });
});

describe("createEntry", () => {
  beforeEach(() => {
    m.fake.git.push({
      ".sitepins/schema/blog.json": JSON.stringify({
        name: "blog",
        fileType: "mdx",
        fmType: "yaml",
        template: [
          { name: "title", type: "string", isRequired: true },
          { name: "draft", type: "boolean", defaultValue: "true" },
          { name: "tags", type: "Array" },
        ],
      }),
    });
  });

  it("writes a new post from the folder's schema with defaults", async () => {
    const result = await createEntry(agent(), "p1", {
      folder: "src/content/blog/2026",
      title: "Hello World!",
      fields: { tags: ["news"] },
      body: "First paragraph.",
    });
    expect(result).toMatchObject({
      status: "committed",
      path: "src/content/blog/2026/hello-world.mdx",
      schema: ".sitepins/schema/blog.json",
    });
    expect(m.fake.git.text("src/content/blog/2026/hello-world.mdx")).toBe(
      "---\ntitle: Hello World!\ndraft: true\ntags:\n  - news\n---\n\nFirst paragraph.\n",
    );
    expect(m.fake.git.lastCommit().message).toMatch(/^Add Hello World!/);
  });

  it("explains bad fields and never overwrites", async () => {
    await expect(
      createEntry(agent(), "p1", {
        schema: "blog",
        title: "",
        fields: { titel: "x" },
      }),
    ).rejects.toThrow(
      /"titel" isn't a field.*Required fields are empty: title/,
    );
    m.fake.git.push({ "src/content/blog/taken.mdx": "x" });
    await expect(
      createEntry(agent(), "p1", { schema: "blog", title: "Taken" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "exists" });
  });
});

describe("undoChange without a commit", () => {
  it("undoes this token's newest change, skipping other people's", async () => {
    await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "A", new_string: "Mine" }],
      message: "My edit",
    });
    m.fake.git.push({ "package.json": '{"name":"x"}' }, "someone else");
    const result = await undoChange(agent(), "p1", {});
    expect(result.status).toBe("committed");
    expect(result.undone.message).toBe("My edit");
    expect(m.fake.git.text("src/content/a.md")).toBe("A");
    expect(m.fake.git.text("package.json")).toBe('{"name":"x"}');
  });

  it("says so when this token hasn't changed anything recently", async () => {
    await expect(
      undoChange(agent({ name: "Other agent" }), "p1", {}),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("uploads", () => {
  it("gives a one-time link and commits what is sent to it", async () => {
    const link = await prepareUpload(
      agent({}, [
        EAgentScope.PROJECTS_READ,
        EAgentScope.CONTENT_READ,
        EAgentScope.MEDIA_WRITE,
      ]),
      "p1",
      { path: "public/images/hero.png" },
    );
    expect(link).toMatchObject({
      method: "PUT",
      path: "public/images/hero.png",
      site_path: "/images/hero.png",
    });
    expect(link.command).toMatch(
      /^curl -sS --fail-with-body -T "<local file>" "http:\/\/api.test\/agent-upload\/spup_/,
    );

    const ticket = link.upload_url.split("/").pop()!;
    const { claims, agent: uploader } = await redeemUploadTicket(ticket);
    const result = await commitUpload(uploader, claims, Buffer.from("PNGDATA"));
    expect(result).toMatchObject({
      status: "committed",
      path: "public/images/hero.png",
      site_path: "/images/hero.png",
      bytes: 7,
    });
    expect(m.fake.git.text("public/images/hero.png")).toBe("PNGDATA");
    await expect(redeemUploadTicket(ticket)).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("refuses paths the token can't write, and existing files unless asked", async () => {
    await expect(
      prepareUpload(agent(), "p1", { path: "src/layouts/x.png" }),
    ).rejects.toThrow(/"Edit code"/);
    await expect(
      prepareUpload(agent(), "p1", { path: "src/content/a.md" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "exists" });
  });
});

describe("guesses become corrections", () => {
  it("suggests real paths for a missing file, from the cached tree", async () => {
    m.fake.git.push({ "src/content/blog/hello.md": "Hi" });
    const read = await readFiles(agent(), "p1", {
      paths: ["src/content/hello.md"],
    });
    expect(read.files[0]).toMatchObject({
      code: "not_found",
      did_you_mean: ["src/content/blog/hello.md"],
    });
    await expect(
      editFile(agent(), "p1", {
        path: "src/content/blog/helo.md",
        edits: [{ old_string: "Hi", new_string: "Hey" }],
        message: "x",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { did_you_mean: ["src/content/blog/hello.md"] },
    });
  });

  it("lists the reachable sites for an unknown project, and defaults a single-site grant", async () => {
    m.projectFind.mockResolvedValue([PROJECT]);
    await expect(
      readFiles(agent(), "nope", { paths: ["src/content/a.md"] }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { projects: [{ project_id: "p1", name: "Site" }] },
    });
    const read = await readFiles(agent(), undefined, {
      paths: ["src/content/a.md"],
    });
    expect(read.files[0]).toMatchObject({ content: "A" });
    await expect(
      readFiles(agent({ project_ids: ["p1", "p2"] }), undefined, {
        paths: ["src/content/a.md"],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("returns the closest lines when old_string doesn't match", async () => {
    m.fake.git.push({
      "src/content/a.md": 'title: "Hello World"\nbody text\n',
    });
    await expect(
      editFile(agent(), "p1", {
        path: "src/content/a.md",
        edits: [{ old_string: "title:  'Hello World'", new_string: "x" }],
        message: "x",
      }),
    ).rejects.toMatchObject({
      code: "no_match",
      fix: expect.stringMatching(/copy old_string exactly from read_files/i),
      details: { closest: [{ line: 1, text: 'title: "Hello World"' }] },
    });
  });

  it("lists schema names for an unknown schema, and folders for an unknown folder", async () => {
    m.fake.git.push({
      ".sitepins/schema/blog.json": JSON.stringify({ name: "blog" }),
      "src/content/blog/x.md": "---\ntitle: X\n---\n",
    });
    await expect(getSchema(agent(), "p1", "blgo")).rejects.toMatchObject({
      code: "not_found",
      details: { schemas: ["blog"] },
    });
    await expect(
      createEntry(agent(), "p1", { schema: "blgo", title: "T" }),
    ).rejects.toMatchObject({ details: { schemas: ["blog"] } });
    m.fake.git.push({ ".sitepins/schema/blog.json": null });
    await expect(
      createEntry(agent(), "p1", { folder: "src/content/blgo", title: "T" }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { did_you_mean: ["src/content/blog"] },
    });
  });

  it("refuses a delete of a missing file with suggestions", async () => {
    await expect(
      applyAgentChangeset(agent(), "p1", {
        message: "Delete",
        expected_shas: { "src/content/b.md": "f".repeat(40) },
        changes: [{ op: "delete", path: "src/content/b.md" }],
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { did_you_mean: ["src/content/a.md"] },
    });
  });
});

describe("updateEntryFields against the schema", () => {
  beforeEach(() => {
    m.fake.git.push({
      ".sitepins/schema/blog.json": JSON.stringify({
        name: "blog",
        template: [
          { name: "title", type: "string" },
          { name: "draft", type: "boolean" },
          { name: "banner", type: "object" },
        ],
      }),
      "src/content/blog/post.md": "---\ntitle: Old\nlegacy: 1\n---\nBody\n",
    });
  });

  it("refuses invented field names and names the valid ones", async () => {
    await expect(
      updateEntryFields(agent(), "p1", {
        path: "src/content/blog/post.md",
        set: { titel: "New" },
        message: "x",
      }),
    ).rejects.toMatchObject({
      code: "unknown_field",
      details: { valid_fields: ["title", "draft", "banner"] },
    });
    expect(m.fake.git.text("src/content/blog/post.md")).toContain("Old");
  });

  it("accepts nested and existing fields, checks types, and can allow new ones", async () => {
    const ok = await updateEntryFields(agent(), "p1", {
      path: "src/content/blog/post.md",
      set: { "banner.title": "B", legacy: 2 },
      message: "x",
    });
    expect(ok.status).toBe("committed");
    await expect(
      updateEntryFields(agent(), "p1", {
        path: "src/content/blog/post.md",
        set: { draft: "yes" },
        message: "x",
      }),
    ).rejects.toMatchObject({ code: "invalid_fields" });
    const added = await updateEntryFields(agent(), "p1", {
      path: "src/content/blog/post.md",
      set: { subtitle: "S" },
      allow_new_fields: true,
      message: "x",
    });
    expect(added.status).toBe("committed");
    expect(m.fake.git.text("src/content/blog/post.md")).toContain(
      "subtitle: S",
    );
  });
});

describe("write results", () => {
  it("returns the new sha of each written file and what to do next", async () => {
    const result = await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "A", new_string: "B" }],
      message: "Edit",
    });
    expect(result).not.toHaveProperty("previous_sha");
    expect(result.files).toEqual([
      { path: "src/content/a.md", sha: gitBlobSha(Buffer.from("B")) },
    ]);
    expect(result.next_step).toMatch(/^Saved\. Use get_deploy_status/);
    const read = await readFile(agent(), "p1", { path: "src/content/a.md" });
    expect(read.sha).toBe(result.files![0].sha);

    const again = await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "B", new_string: "B" }],
      message: "Same",
    });
    expect(again).toMatchObject({
      status: "noop",
      next_step: expect.stringMatching(/Nothing changed/),
    });
    const preview = await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "B", new_string: "C" }],
      message: "Preview",
      dry_run: true,
    });
    expect(preview.next_step).toMatch(/without dry_run/);
  });
});

describe("moveFile", () => {
  it("defaults expected_sha to the current file and previews with dry_run", async () => {
    const preview = await moveFile(agent(), "p1", {
      from: "src/content/a.md",
      to: "src/content/z.md",
      message: "Rename",
      dry_run: true,
    });
    expect(preview.status).toBe("dry_run");
    expect(m.fake.git.text("src/content/a.md")).toBe("A");

    const moved = await moveFile(agent(), "p1", {
      from: "src/content/a.md",
      to: "src/content/z.md",
      message: "Rename",
    });
    expect(moved.status).toBe("committed");
    expect(m.fake.git.text("src/content/z.md")).toBe("A");
    expect(m.fake.git.text("src/content/a.md")).toBeNull();
    expect(moved.files).toEqual(
      expect.arrayContaining([
        { path: "src/content/a.md", sha: null },
        { path: "src/content/z.md", sha: gitBlobSha(Buffer.from("A")) },
      ]),
    );
    await expect(
      moveFile(agent(), "p1", {
        from: "src/content/a.md",
        to: "src/content/y.md",
        message: "Again",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { did_you_mean: ["src/content/z.md"] },
    });
  });
});

describe("listEntries", () => {
  beforeEach(() => {
    m.fake.git.push({
      "src/content/blog/one.md":
        "---\ntitle: First post\ndate: 2026-01-02\ndraft: false\n---\n",
      "src/content/blog/two.md":
        "---\ntitle: Second post\ndate: 2026-03-04\ndraft: true\ntags: [a]\n---\n",
      "src/content/blog/three.md": "---\ntitle: Undated\n---\n",
      "src/content/blog/cover.png": "PNG",
    });
  });

  it("lists entries newest first with the default fields", async () => {
    const result = await listEntries(agent(), "p1", {
      folder: "src/content/blog",
    });
    expect(result.total).toBe(3);
    expect(result.entries.map((e) => e.path)).toEqual([
      "src/content/blog/two.md",
      "src/content/blog/one.md",
      "src/content/blog/three.md",
    ]);
    expect(result.entries[0]).toMatchObject({
      sha: expect.any(String),
      fields: { title: "Second post", date: "2026-03-04", draft: true },
    });
  });

  it("filters by title, picks fields, sorts by title and pages", async () => {
    const result = await listEntries(agent(), "p1", {
      folder: "src/content/blog",
      query: "POST",
      fields: ["tags"],
      sort: "title_asc" as never,
      limit: 1,
    });
    expect(result).toMatchObject({
      total: 2,
      next_cursor: "1",
      entries: [{ path: "src/content/blog/one.md", fields: {} }],
    });
    const next = await listEntries(agent(), "p1", {
      folder: "src/content/blog",
      query: "post",
      fields: ["tags"],
      sort: "title_asc" as never,
      cursor: "1",
    });
    expect(next.entries).toEqual([
      expect.objectContaining({ fields: { tags: ["a"] } }),
    ]);
  });

  it("suggests a folder when the one given doesn't exist", async () => {
    await expect(
      listEntries(agent(), "p1", { folder: "src/content/blogs" }),
    ).rejects.toMatchObject({
      code: "not_found",
      details: { did_you_mean: ["src/content/blog"] },
    });
  });
});

describe("getChange", () => {
  it("shows who changed what, file by file, with a diff", async () => {
    await editFile(agent(), "p1", {
      path: "src/content/a.md",
      edits: [{ old_string: "A", new_string: "B" }],
      message: "Change A",
    });
    const commit = m.fake.git.head();
    const result = await getChange(agent(), "p1", { commit_sha: commit });
    expect(result).toMatchObject({
      commit,
      subject: "Change A",
      made_by: { user: "Ada", via: "Claude Code" },
      total_files: 1,
      files: [
        {
          path: "src/content/a.md",
          change: "modified",
          diff: "@@ -1,1 +1,1 @@\n-A\n+B",
        },
      ],
    });

    const added = m.fake.git.push({
      "src/content/new.md": "N",
      "src/content/a.md": null,
    });
    const second = await getChange(agent(), "p1", { commit_sha: added });
    expect(second.files.map((f) => `${f.change} ${f.path}`)).toEqual([
      "removed src/content/a.md",
      "added src/content/new.md",
    ]);
    await expect(
      getChange(agent(), "p1", { commit_sha: "f".repeat(40) }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
