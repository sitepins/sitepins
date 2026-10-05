import { gitBlobSha } from "@/lib/utils/git-utils";
import { updateConfig } from "@/redux/features/config/slice";
import { githubCommitApi } from "@/redux/features/github/github-commit-api";
import { gitlabCommitApi } from "@/redux/features/gitlab/gitlab-commit-api";
import { AppStore, makeStore } from "@/redux/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommitConflictError,
  findConflicts,
  isCommitConflict,
  toConflictResult,
} from "./commit-conflict";

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getSession: async () => null },
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf-8");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

describe("findConflicts", () => {
  it("only checks paths that have an expected sha", async () => {
    const readRemote = vi.fn(async () => ({ sha: "new" }));
    const conflicts = await findConflicts(
      { "a.md": "old" },
      ["a.md", "b.md"],
      readRemote,
    );

    expect(readRemote).toHaveBeenCalledTimes(1);
    expect(conflicts).toEqual([
      { path: "a.md", remoteSha: "new", remoteContent: undefined },
    ]);
  });

  it("reports a deleted file with a null sha", async () => {
    const conflicts = await findConflicts(
      { "a.md": "old" },
      ["a.md"],
      async () => null,
    );
    expect(conflicts[0].remoteSha).toBeNull();
  });

  it("passes a file that still matches", async () => {
    expect(
      await findConflicts({ "a.md": "same" }, ["a.md"], async () => ({
        sha: "same",
      })),
    ).toEqual([]);
  });

  it("round-trips through the RTK error shape", () => {
    const { error } = toConflictResult(
      new CommitConflictError([{ path: "a.md", remoteSha: null }]),
    );
    expect(isCommitConflict(error)).toBe(true);
    expect(isCommitConflict({ status: 409, message: "x" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// In-memory GitHub, enough of the REST API for updateGitHubFiles.
// ---------------------------------------------------------------------------

type GhCommit = { tree: string; parents: string[] };

const createFakeGitHub = (initial: Record<string, string>) => {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, GhCommit>();
  let seq = 0;
  let head: string | null = null;

  const writeTree = (entries: Map<string, string>) => {
    const sha = `tree${++seq}`;
    trees.set(sha, entries);
    return sha;
  };
  const writeCommit = (tree: string, parents: string[]) => {
    const sha = `commit${++seq}`;
    commits.set(sha, { tree, parents });
    return sha;
  };
  const writeBlob = (content: string) => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    return sha;
  };
  const headTree = () =>
    new Map(head ? trees.get(commits.get(head)!.tree)! : []);

  /** Simulates someone else pushing to the branch. */
  const push = (changes: Record<string, string | null>) => {
    const entries = headTree();
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) entries.delete(path);
      else entries.set(path, writeBlob(content));
    }
    head = writeCommit(writeTree(entries), head ? [head] : []);
    return head;
  };

  const isAncestor = (ancestor: string, sha: string): boolean => {
    if (ancestor === sha) return true;
    return (commits.get(sha)?.parents ?? []).some((p) =>
      isAncestor(ancestor, p),
    );
  };

  const fileAt = (ref: string, path: string) => {
    const commit = commits.get(ref === "main" ? (head ?? "") : ref);
    const sha = commit ? trees.get(commit.tree)!.get(path) : undefined;
    return sha ? { sha, content: blobs.get(sha)! } : null;
  };

  push(initial);

  const state = {
    beforeRefUpdate: undefined as (() => void) | undefined,
    failBlobs: false,
    refUpdates: [] as Record<string, unknown>[],
    contentWrites: [] as Record<string, unknown>[],
  };

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const route = decodeURIComponent(url.pathname).replace(
      "/repos/acme/site",
      "",
    );

    if (route === "/user") return json(200, { login: "editor" });

    if (method === "GET" && route === "/branches/main") {
      if (!head) return json(404, { message: "Branch not found" });
      const tree = commits.get(head)!.tree;
      return json(200, {
        name: "main",
        commit: { sha: head, commit: { tree: { sha: tree } } },
      });
    }

    if (route.startsWith("/contents/")) {
      const path = route.slice("/contents/".length);
      const current = fileAt("main", path);
      if (method === "GET") {
        const file = fileAt(url.searchParams.get("ref") ?? "main", path);
        if (!file) return json(404, { message: "Not Found" });
        return json(200, {
          type: "file",
          sha: file.sha,
          encoding: "base64",
          content: b64(file.content),
        });
      }
      state.contentWrites.push({ method, path, ...body });
      if (current?.sha !== body.sha)
        return json(409, { message: `${path} does not match ${body.sha}` });
      const sha = push({
        [path]: method === "DELETE" ? null : unb64(body.content),
      });
      return json(200, {
        content: method === "DELETE" ? null : { sha: fileAt(sha, path)!.sha },
        commit: { sha },
      });
    }

    if (method === "POST" && route === "/git/blobs") {
      if (state.failBlobs)
        return json(403, { message: "Resource not accessible" });
      return json(201, { sha: writeBlob(body.content) });
    }

    if (method === "POST" && route === "/git/trees") {
      const entries = new Map(body.base_tree ? trees.get(body.base_tree)! : []);
      for (const entry of body.tree) {
        if (entry.sha === null) entries.delete(entry.path);
        else entries.set(entry.path, entry.sha);
      }
      return json(201, { sha: writeTree(entries) });
    }

    if (method === "POST" && route === "/git/commits") {
      const sha = writeCommit(body.tree, body.parents ?? []);
      return json(201, { sha, tree: { sha: body.tree } });
    }

    if (method === "PATCH" && route === "/git/refs/heads/main") {
      state.refUpdates.push(body);
      const hook = state.beforeRefUpdate;
      state.beforeRefUpdate = undefined;
      hook?.();
      if (!body.force && head && !isAncestor(head, body.sha)) {
        return json(422, { message: "Update is not a fast forward" });
      }
      head = body.sha;
      return json(200, { object: { sha: head } });
    }

    return json(404, { message: `Unhandled ${method} ${route}` });
  };

  return {
    fetch,
    push,
    state,
    fileAt,
    head: () => head!,
    parentsOf: (sha: string) => commits.get(sha)!.parents,
  };
};

const ORIGINAL = "---\ntitle: Hello\n---\n\nBody\n";
const EDITED = "---\ntitle: Hello, edited\n---\n\nBody\n";
const THEIRS = "---\ntitle: Hello\n---\n\nBody\n\nAppended by a developer.\n";

let store: AppStore;

beforeEach(() => {
  store = makeStore();
  store.dispatch(
    updateConfig({
      token: "app-token",
      owner: "acme",
      repoName: "site",
      branch: "main",
      provider: "Github",
    }),
  );
  toast.error.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const publishToGitHub = (expectedShas?: Record<string, string>) =>
  store.dispatch(
    githubCommitApi.endpoints.updateGitHubFiles.initiate({
      owner: "acme",
      repo: "site",
      tree: "main",
      files: [{ path: "content/post.md", content: EDITED }],
      message: "Update post",
      expectedShas,
    } as never),
  );

describe("updateGitHubFiles", () => {
  it("rebuilds on top of a push to another file instead of dropping it", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const opened = gh.fileAt("main", "content/post.md")!.sha;
    let theirs = "";
    gh.state.beforeRefUpdate = () => {
      theirs = gh.push({ "content/other.md": "theirs" });
    };

    const res = await publishToGitHub({ "content/post.md": opened });

    expect(res.error).toBeUndefined();
    expect(gh.state.refUpdates.every((u) => !u.force)).toBe(true);
    expect(gh.parentsOf(gh.head())).toEqual([theirs]);
    expect(gh.fileAt("main", "content/other.md")?.content).toBe("theirs");
    expect(gh.fileAt("main", "content/post.md")?.content).toBe(EDITED);
  });

  it("refuses when the opened file changed before publishing", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const opened = gh.fileAt("main", "content/post.md")!.sha;
    const theirs = gh.push({ "content/post.md": THEIRS });

    const res = await publishToGitHub({ "content/post.md": opened });

    expect(isCommitConflict(res.error)).toBe(true);
    expect(res.error).toMatchObject({
      conflicts: [{ path: "content/post.md", remoteContent: THEIRS }],
    });
    expect(gh.head()).toBe(theirs);
    expect(gh.state.refUpdates).toHaveLength(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refuses when the opened file changes between the check and the ref update", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const opened = gh.fileAt("main", "content/post.md")!.sha;
    let theirs = "";
    gh.state.beforeRefUpdate = () => {
      theirs = gh.push({ "content/post.md": THEIRS });
    };

    const res = await publishToGitHub({ "content/post.md": opened });

    expect(isCommitConflict(res.error)).toBe(true);
    expect(gh.head()).toBe(theirs);
    expect(gh.fileAt("main", "content/post.md")?.content).toBe(THEIRS);
  });

  it("overwrites a changed file when no sha is expected, keeping the other commit as parent", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const theirs = gh.push({
      "content/post.md": THEIRS,
      "content/other.md": "theirs",
    });

    const res = await publishToGitHub();

    expect(res.error).toBeUndefined();
    expect(gh.parentsOf(gh.head())).toEqual([theirs]);
    expect(gh.fileAt("main", "content/post.md")?.content).toBe(EDITED);
    expect(gh.fileAt("main", "content/other.md")?.content).toBe("theirs");
  });

  it("guards the Contents API fallback too", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    gh.state.failBlobs = true;
    const opened = gh.fileAt("main", "content/post.md")!.sha;
    gh.push({ "content/post.md": THEIRS });

    const res = await publishToGitHub({ "content/post.md": opened });

    expect(isCommitConflict(res.error)).toBe(true);
    expect(gh.state.contentWrites).toHaveLength(0);
    expect(gh.fileAt("main", "content/post.md")?.content).toBe(THEIRS);
  });

  it("writes through the Contents API fallback with the opened sha", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    gh.state.failBlobs = true;
    const opened = gh.fileAt("main", "content/post.md")!.sha;

    const res = await publishToGitHub({ "content/post.md": opened });

    expect(res.error).toBeUndefined();
    expect(gh.state.contentWrites).toMatchObject([
      { method: "PUT", sha: opened },
    ]);
    expect(gh.fileAt("main", "content/post.md")?.content).toBe(EDITED);
  });
});

// ---------------------------------------------------------------------------
// In-memory GitLab: files API plus the commits endpoint's last_commit_id check.
// ---------------------------------------------------------------------------

const createFakeGitLab = (initial: Record<string, string>) => {
  const files = new Map<string, { content: string; lastCommit: string }>();
  let seq = 0;
  const commit = (changes: Record<string, string>) => {
    const id = `glcommit${++seq}`;
    for (const [path, content] of Object.entries(changes)) {
      files.set(path, { content, lastCommit: id });
    }
    return id;
  };
  commit(initial);

  const state = {
    beforeCommit: undefined as (() => void) | undefined,
    commitBodies: [] as { actions: Record<string, unknown>[] }[],
  };

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const route = decodeURIComponent(
      url.pathname.replace("/api/v4/projects/acme%2Fsite", ""),
    );

    if (url.pathname === "/api/v4/user")
      return json(200, { username: "editor" });

    if (route === "/repository/tree") {
      return json(
        200,
        [...files.keys()].map((path) => ({ path, type: "blob" })),
      );
    }

    if (route.startsWith("/repository/files/")) {
      const file = files.get(route.slice("/repository/files/".length));
      if (!file) return json(404, { message: "404 File Not Found" });
      return json(200, {
        blob_id: gitBlobSha(file.content),
        last_commit_id: file.lastCommit,
        encoding: "base64",
        content: b64(file.content),
      });
    }

    if (method === "POST" && route === "/repository/commits") {
      const body = JSON.parse(String(init!.body));
      state.commitBodies.push(body);
      const hook = state.beforeCommit;
      state.beforeCommit = undefined;
      hook?.();
      for (const action of body.actions) {
        const current = files.get(action.file_path);
        if (
          action.last_commit_id &&
          current?.lastCommit !== action.last_commit_id
        ) {
          return json(400, {
            message: `The file has changed since you started editing it: ${action.file_path}`,
          });
        }
      }
      const id = commit(
        Object.fromEntries(
          body.actions.map((a: { file_path: string; content: string }) => [
            a.file_path,
            a.content,
          ]),
        ),
      );
      return json(201, { id });
    }

    return json(404, { message: `Unhandled ${method} ${route}` });
  };

  return {
    fetch,
    commit,
    state,
    read: (path: string) => files.get(path)?.content,
  };
};

const publishToGitLab = (expectedShas?: Record<string, string>) =>
  store.dispatch(
    gitlabCommitApi.endpoints.updateGitLabFiles.initiate({
      id: "acme/site",
      branch: "main",
      files: [{ path: "content/post.md", content: EDITED }],
      message: "Update post",
      expectedShas,
    }),
  );

describe("updateGitLabFiles", () => {
  beforeEach(() => {
    store.dispatch(updateConfig({ provider: "Gitlab" }));
  });

  it("sends the file's last commit id so GitLab can reject a stale write", async () => {
    const gl = createFakeGitLab({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);

    const res = await publishToGitLab({
      "content/post.md": gitBlobSha(ORIGINAL),
    });

    expect(res.error).toBeUndefined();
    expect(gl.state.commitBodies[0].actions[0]).toMatchObject({
      action: "update",
      last_commit_id: "glcommit1",
    });
    expect(gl.read("content/post.md")).toBe(EDITED);
  });

  it("refuses when the opened file changed before publishing", async () => {
    const gl = createFakeGitLab({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    gl.commit({ "content/post.md": THEIRS });

    const res = await publishToGitLab({
      "content/post.md": gitBlobSha(ORIGINAL),
    });

    expect(res.error).toMatchObject({
      status: 409,
      conflicts: [{ path: "content/post.md", remoteContent: THEIRS }],
    });
    expect(gl.state.commitBodies).toHaveLength(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a conflict when GitLab rejects a file changed mid-publish", async () => {
    const gl = createFakeGitLab({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gl.fetch);
    gl.state.beforeCommit = () => gl.commit({ "content/post.md": THEIRS });

    const res = await publishToGitLab({
      "content/post.md": gitBlobSha(ORIGINAL),
    });

    expect(isCommitConflict(res.error)).toBe(true);
    expect(gl.read("content/post.md")).toBe(THEIRS);
  });
});
