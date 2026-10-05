import { gitBlobSha } from "@/lib/utils/git-utils";
import { updateConfig } from "@/redux/features/config/slice";
import { getGitProviderAdapter } from "@/redux/features/git/provider-adapter";
import { githubCommitApi } from "@/redux/features/github/github-commit-api";
import { githubContentApi } from "@/redux/features/github/github-content-api";
import { gitlabCommitApi } from "@/redux/features/gitlab/gitlab-commit-api";
import { AppStore, makeStore } from "@/redux/store";
import {
  createFakeGitHub,
  createFakeGitLab,
  EDITED,
  ORIGINAL,
  THEIRS,
} from "@/test/fake-git-hosts";
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
      content: "content",
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
  it("keeps the sha in the editor's cached copy, so a reopened file is still guarded", async () => {
    const gh = createFakeGitHub({ "content/post.md": ORIGINAL });
    vi.stubGlobal("fetch", gh.fetch);
    const github = getGitProviderAdapter("Github");
    const args = github.contentArgs(
      store.getState().config,
      "content/post.md",
      {
        parser: true,
      },
    );
    const cachedSha = () =>
      (
        githubContentApi.endpoints.getGitHubContent.select(args as never)(
          store.getState(),
        ).data as { sha?: string } | undefined
      )?.sha;

    await github.fetchContent(store.dispatch, args);
    const opened = cachedSha();
    expect(opened).toBe(gh.fileAt("main", "content/post.md")!.sha);

    await publishToGitHub({ "content/post.md": opened as string });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reopened = cachedSha();
    expect(reopened).toBe(gh.fileAt("main", "content/post.md")!.sha);

    gh.push({ "content/post.md": THEIRS });
    const res = await publishToGitHub({
      "content/post.md": reopened as string,
    });
    expect(isCommitConflict(res.error)).toBe(true);
  });

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
