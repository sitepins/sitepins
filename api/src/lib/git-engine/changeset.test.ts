import { describe, expect, it } from "vitest";
import {
  applyChangeset,
  buildCommitMessage,
  ChangesetPolicyError,
  TApplyChangesetInput,
} from "./changeset";
import { GitEngineError } from "./errors";
import { createFakeGitHub, createFakeGitLab } from "./fake-hosts.fixture";
import { createGitHubClient } from "./github";
import { createGitLabClient } from "./gitlab";
import { TGitClient } from "./types";

const INITIAL = {
  "src/content/a.md": "A",
  "src/content/b.md": "B",
  "public/images/logo.png": "PNG",
  "package.json": "{}",
};
const POLICY = { writableRoots: ["src/content", "public/images", ".sitepins"] };
const buf = (s: string) => Buffer.from(s);

type THarness = {
  client: TGitClient;
  push: (changes: Record<string, string | null>) => string;
  head: () => string;
  text: (path: string, ref?: string) => string | null;
  lastMessage: () => string;
  beforeWrite: (fn: () => void) => void;
};

const hosts: [string, () => THarness][] = [
  [
    "GitHub",
    () => {
      const fake = createFakeGitHub(INITIAL);
      return {
        client: createGitHubClient({ ...fake, token: "ghs_test" }),
        push: fake.git.push,
        head: fake.git.head,
        text: fake.git.text,
        lastMessage: () => fake.git.lastCommit().message,
        beforeWrite: (fn) => (fake.state.beforeRefUpdate = fn),
      };
    },
  ],
  [
    "GitLab",
    () => {
      const fake = createFakeGitLab(INITIAL);
      return {
        client: createGitLabClient({ ...fake, token: "glpat_test" }),
        push: fake.git.push,
        head: fake.git.head,
        text: fake.git.text,
        lastMessage: () => fake.git.lastCommit().message,
        beforeWrite: (fn) => (fake.state.beforeCommit = fn),
      };
    },
  ],
];

const run = (h: THarness, input: Partial<TApplyChangesetInput>) =>
  applyChangeset(h.client, {
    changes: [],
    message: "Update",
    policy: POLICY,
    ...input,
  });

describe.each(hosts)("applyChangeset on %s", (_name, setup) => {
  it("commits upserts, deletes and renames in one commit", async () => {
    const h = setup();
    const base = h.head();
    const result = await run(h, {
      baseCommit: base,
      changes: [
        { op: "upsert", path: "src/content/a.md", content: buf("A2") },
        { op: "upsert", path: "src/content/new.md", content: buf("N") },
        { op: "delete", path: "public/images/logo.png" },
        { op: "rename", from: "src/content/b.md", path: "src/content/b2.md" },
      ],
    });

    expect(result.status).toBe("committed");
    expect(h.head()).not.toBe(base);
    expect(h.text("src/content/a.md")).toBe("A2");
    expect(h.text("src/content/new.md")).toBe("N");
    expect(h.text("public/images/logo.png")).toBeNull();
    expect(h.text("src/content/b.md")).toBeNull();
    expect(h.text("src/content/b2.md")).toBe("B");
  });

  it("commits on top of unrelated upstream changes", async () => {
    const h = setup();
    const base = h.head();
    h.push({ "src/content/b.md": "B-theirs" });

    const result = await run(h, {
      baseCommit: base,
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });

    expect(result.status).toBe("committed");
    expect(h.text("src/content/a.md")).toBe("A2");
    expect(h.text("src/content/b.md")).toBe("B-theirs");
  });

  it("reports a conflict when a touched file changed upstream since the base", async () => {
    const h = setup();
    const base = h.head();
    const theirs = h.push({ "src/content/a.md": "A-theirs" });

    const result = await run(h, {
      baseCommit: base,
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });

    expect(result).toMatchObject({
      status: "conflict",
      headSha: theirs,
      conflicts: [
        {
          path: "src/content/a.md",
          remoteContentBase64: buf("A-theirs").toString("base64"),
        },
      ],
    });
    expect(h.text("src/content/a.md")).toBe("A-theirs");
  });

  it("treats a rename source changed upstream as a conflict", async () => {
    const h = setup();
    const base = h.head();
    h.push({ "src/content/b.md": "B-theirs" });

    const result = await run(h, {
      baseCommit: base,
      changes: [
        { op: "rename", from: "src/content/b.md", path: "src/content/c.md" },
      ],
    });

    expect(result.status).toBe("conflict");
  });

  it("retries when the branch moves mid-commit without overlap", async () => {
    const h = setup();
    h.beforeWrite(() => h.push({ "src/content/b.md": "B-race" }));

    const result = await run(h, {
      baseCommit: h.head(),
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });

    expect(result.status).toBe("committed");
    expect(h.text("src/content/a.md")).toBe("A2");
    expect(h.text("src/content/b.md")).toBe("B-race");
  });

  it("returns a conflict when a racing push touches the same file", async () => {
    const h = setup();
    h.beforeWrite(() => h.push({ "src/content/a.md": "A-race" }));

    const result = await run(h, {
      baseCommit: h.head(),
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });

    expect(result.status).toBe("conflict");
    expect(h.text("src/content/a.md")).toBe("A-race");
  });

  it("refuses a base commit that isn't on the branch", async () => {
    const h = setup();
    await expect(
      run(h, {
        baseCommit: "f".repeat(40),
        changes: [
          { op: "upsert", path: "src/content/a.md", content: buf("A2") },
        ],
      }),
    ).rejects.toMatchObject({ code: "diverged", status: 409 });
  });

  it("checks expected blob shas when there is no base commit", async () => {
    const h = setup();
    const result = await run(h, {
      expectedShas: { "src/content/a.md": "0".repeat(40) },
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });
    expect(result.status).toBe("conflict");

    const created = await run(h, {
      expectedShas: { "src/content/fresh.md": null },
      changes: [
        { op: "upsert", path: "src/content/fresh.md", content: buf("F") },
      ],
    });
    expect(created.status).toBe("committed");
  });

  it("refuses the whole changeset when any path breaks policy", async () => {
    const h = setup();
    const head = h.head();
    const attempt = run(h, {
      changes: [
        { op: "upsert", path: "src/content/a.md", content: buf("A2") },
        {
          op: "upsert",
          path: ".github/workflows/x.yml",
          content: buf("on: push"),
        },
        { op: "upsert", path: "package.json", content: buf('{"scripts":{}}') },
      ],
    });

    await expect(attempt).rejects.toBeInstanceOf(ChangesetPolicyError);
    await attempt.catch((error: ChangesetPolicyError) => {
      expect(error.violations.map((v) => v.path)).toEqual([
        ".github/workflows/x.yml",
        "package.json",
      ]);
    });
    expect(h.head()).toBe(head);
  });

  it("plans without writing on a dry run, and skips deletes of missing files", async () => {
    const h = setup();
    const head = h.head();
    const result = await run(h, {
      dryRun: true,
      changes: [
        { op: "upsert", path: "src/content/a.md", content: buf("A2") },
        { op: "delete", path: "src/content/missing.md" },
      ],
    });

    expect(result).toEqual({
      status: "dry_run",
      headSha: head,
      changes: [
        { op: "upsert", path: "src/content/a.md", bytes: 2, existed: true },
      ],
    });
    expect(h.head()).toBe(head);
  });

  it("returns noop when only missing files would be deleted", async () => {
    const h = setup();
    const result = await run(h, {
      changes: [{ op: "delete", path: "src/content/missing.md" }],
    });
    expect(result.status).toBe("noop");
  });

  it("rejects duplicate paths, traversal and oversized changesets", async () => {
    const h = setup();
    await expect(
      run(h, {
        changes: [
          { op: "upsert", path: "src/content/a.md", content: buf("1") },
          { op: "delete", path: "./src/content/a.md" },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      run(h, {
        changes: [
          { op: "upsert", path: "src/content/../../x", content: buf("1") },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      run(h, {
        limits: { maxFileBytes: 1 },
        changes: [
          { op: "upsert", path: "src/content/a.md", content: buf("12") },
        ],
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("treats rewriting identical bytes as a noop", async () => {
    const h = setup();
    const head = h.head();
    const result = await run(h, {
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A") }],
    });
    expect(result.status).toBe("noop");
    expect(h.head()).toBe(head);
  });

  it("lists history, creates branches and opens one pull request per branch", async () => {
    const h = setup();
    h.push({ "src/content/a.md": "A2" });
    const history = await h.client.listCommits({
      path: "src/content/a.md",
      limit: 10,
    });
    expect(history).toHaveLength(2);

    expect(await h.client.createBranch("sitepins/agent-x", h.head())).toBe(
      true,
    );
    expect(await h.client.createBranch("sitepins/agent-x", h.head())).toBe(
      false,
    );
    const first = await h.client.openPullRequest({
      head: "sitepins/agent-x",
      title: "T",
      body: "B",
    });
    const again = await h.client.openPullRequest({
      head: "sitepins/agent-x",
      title: "T",
      body: "B",
    });
    expect(first.number).toBe(1);
    expect(again).toEqual(first);
  });

  it("writes the commit message it was given", async () => {
    const h = setup();
    const message = buildCommitMessage({
      message: "Add post",
      trailers: [
        ["Sitepins-User", "Ada"],
        ["Sitepins-Agent", "Claude Code"],
      ],
    });
    await run(h, {
      message,
      changes: [{ op: "upsert", path: "src/content/p.md", content: buf("P") }],
    });
    expect(h.lastMessage()).toBe(
      "Add post\n\nSitepins-User: Ada\nSitepins-Agent: Claude Code",
    );
  });
});

describe("GitHub specifics", () => {
  it("omits the author so GitHub attributes the commit to the app", async () => {
    const fake = createFakeGitHub(INITIAL);
    const client = createGitHubClient({ ...fake, token: "ghs_test" });
    await applyChangeset(client, {
      message: "Update",
      policy: POLICY,
      changes: [{ op: "upsert", path: "src/content/a.md", content: buf("A2") }],
    });
    expect(fake.git.lastCommit().author).toBeUndefined();
    expect(fake.state.authHeader).toBe("Bearer ghs_test");
  });

  it("rejects malformed repository names", () => {
    expect(() =>
      createGitHubClient({
        repository: "acme/site/../x",
        branch: "main",
        token: "t",
      }),
    ).toThrow(GitEngineError);
  });
});

describe("GitLab specifics", () => {
  it("sends the bot identity and guards updates with last_commit_id", async () => {
    const fake = createFakeGitLab(INITIAL);
    const client = createGitLabClient({ ...fake, token: "glpat_test" });
    await applyChangeset(client, {
      message: "Update",
      policy: POLICY,
      author: { name: "Sitepins", email: "sitepins@example.com" },
      changes: [
        { op: "upsert", path: "src/content/a.md", content: buf("A2") },
        { op: "upsert", path: "src/content/new.md", content: buf("N") },
      ],
    });

    const [body] = fake.state.commitBodies as {
      author_name: string;
      actions: { action: string; file_path: string; last_commit_id?: string }[];
    }[];
    expect(body.author_name).toBe("Sitepins");
    expect(body.actions).toEqual([
      expect.objectContaining({
        action: "update",
        file_path: "src/content/a.md",
        last_commit_id: expect.any(String),
      }),
      expect.objectContaining({
        action: "create",
        file_path: "src/content/new.md",
      }),
    ]);
  });
});
