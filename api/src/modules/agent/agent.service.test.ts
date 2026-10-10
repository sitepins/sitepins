import { createFakeGitHub } from "@/lib/git-engine/fake-hosts.fixture";
import { createGitHubClient } from "@/lib/git-engine/github";
import { setAgentAccessGuard } from "@/lib/extensionGuards";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAgentChangeset,
  listProjects,
  logTypeFor,
  policyFor,
  resolveProject,
  rootsFromConfig,
} from "./agent.service";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";

const m = vi.hoisted(() => ({
  projectFindOne: vi.fn(),
  projectFind: vi.fn(),
  logInsertMany: vi.fn(),
  broadcast: vi.fn(),
  fake: undefined as unknown as ReturnType<
    typeof import("@/lib/git-engine/fake-hosts.fixture").createFakeGitHub
  >,
}));
const { projectFindOne, logInsertMany, broadcast } = m;

vi.mock("@/modules/project/project.model", () => ({
  Project: {
    findOne: (...a: unknown[]) => ({ lean: () => m.projectFindOne(...a) }),
    find: (...a: unknown[]) => ({
      select: () => ({ lean: () => m.projectFind(...a) }),
    }),
  },
}));
vi.mock("@/modules/project-log/project-log.model", () => ({
  ProjectLog: { insertMany: (...a: unknown[]) => m.logInsertMany(...a) },
}));
vi.mock("@/modules/common/editor.gateway", () => ({
  broadcastExternalCommit: (...a: unknown[]) => m.broadcast(...a),
}));
vi.mock("./agent.git", () => ({
  isGitLabProject: () => false,
  createProjectGitClient: async (
    _project: unknown,
    _user: string,
    branch = "main",
  ) =>
    createGitHubClient({
      repository: m.fake.repository,
      branch,
      token: "ghs_test",
      fetchImpl: m.fake.fetchImpl,
    }),
}));

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
          reason: "needs the media:write permission",
        },
        { path: "package.json", reason: "needs the code:write permission" },
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

  it("lets a deployment refuse writes (e.g. by plan) before anything is committed", async () => {
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
    expect(seen).toEqual([false, true]);
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
  ).rejects.toMatchObject({ statusCode: 429 });
});
