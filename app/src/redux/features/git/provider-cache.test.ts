import { githubContentApi } from "@/redux/features/github";
import { gitlabContentApi } from "@/redux/features/gitlab";
import { AppStore, makeStore } from "@/redux/store";
import { TConfig, TTree } from "@/types";
import { beforeEach, describe, expect, it } from "vitest";
import { getGitProviderAdapter, TreeCache } from "./provider-adapter";

/**
 * Exercises the adapter against a real store, so cache-key construction and
 * the immer recipes are covered rather than just the argument builders.
 * `updateQueryData` is a no-op on an entry that does not exist, which is
 * exactly how the previous hand-rolled arguments silently missed writes.
 */

const config = {
  owner: "acme",
  repoName: "site",
  branch: "main",
} as TConfig;

const github = getGitProviderAdapter("Github");
const gitlab = getGitProviderAdapter("Gitlab");

const tree = (paths: string[]): TreeCache => ({
  files: paths.map((path) => ({ path, sha: "s", type: "blob" }) as TTree),
  trees: [],
});

let store: AppStore;

beforeEach(() => {
  store = makeStore();
});

const seedGithubTree = (args: Record<string, unknown>, paths: string[]) =>
  store.dispatch(
    githubContentApi.util.upsertQueryData(
      "getGitHubTrees",
      args as never,
      tree(paths) as never,
    ),
  );

const seedGitlabTree = (args: Record<string, unknown>, paths: string[]) =>
  store.dispatch(
    gitlabContentApi.util.upsertQueryData(
      "getGitLabTrees",
      args as never,
      tree(paths) as never,
    ),
  );

const readGithubTree = (args: Record<string, unknown>) =>
  githubContentApi.endpoints.getGitHubTrees.select(args as never)(
    store.getState(),
  ).data as TreeCache | undefined;

const readGitlabTree = (args: Record<string, unknown>) =>
  gitlabContentApi.endpoints.getGitLabTrees.select(args as never)(
    store.getState(),
  ).data as TreeCache | undefined;

describe("selectCachedTreeArgs", () => {
  it("reports nothing before anything is cached", () => {
    expect(github.selectCachedTreeArgs(store.getState())).toEqual([]);
  });

  it("returns every cached argument shape for the provider", async () => {
    const root = github.treesArgs(config, "", { recursive: true });
    const shallow = github.treesArgs(config, "", { recursive: false });
    await seedGithubTree(root, ["a.md"]);
    await seedGithubTree(shallow, ["a.md"]);

    expect(github.selectCachedTreeArgs(store.getState())).toHaveLength(2);
  });

  it("does not leak one provider's cache into the other", async () => {
    await seedGithubTree(github.treesArgs(config, "", { recursive: true }), []);

    expect(gitlab.selectCachedTreeArgs(store.getState())).toEqual([]);
  });
});

describe("updateTreeCache", () => {
  it("writes through the args the query was cached under", async () => {
    const args = github.treesArgs(config, "", { recursive: true });
    await seedGithubTree(args, ["content/a.md", "content/b.md"]);

    github.updateTreeCache(store.dispatch, args, (draft) => {
      draft.files = draft.files.filter((f) => f.path !== "content/a.md");
    });

    expect(readGithubTree(args)?.files.map((f) => f.path)).toEqual([
      "content/b.md",
    ]);
  });

  it("leaves other cached entries untouched", async () => {
    const root = github.treesArgs(config, "", { recursive: true });
    const shallow = github.treesArgs(config, "", { recursive: false });
    await seedGithubTree(root, ["a.md"]);
    await seedGithubTree(shallow, ["a.md"]);

    github.updateTreeCache(store.dispatch, root, (draft) => {
      draft.files = [];
    });

    expect(readGithubTree(root)?.files).toEqual([]);
    expect(readGithubTree(shallow)?.files).toHaveLength(1);
  });

  // The regression this abstraction exists to prevent: the delete path used to
  // build `{ id, path, ref, recursive: false }` while the sidebar query caches
  // `{ id, ref, recursive: true }`, so removals never reached it.
  it("reaches the recursive root tree GitLab actually caches", async () => {
    const rootArgs = gitlab.treesArgs(config, "", { recursive: true });
    await seedGitlabTree(rootArgs, ["content/a.md", "content/b.md"]);

    const cached = gitlab.selectCachedTreeArgs(store.getState());
    expect(cached).toHaveLength(1);

    for (const args of cached) {
      gitlab.updateTreeCache(store.dispatch, args, (draft) => {
        draft.files = draft.files.filter((f) => f.path !== "content/a.md");
      });
    }

    expect(readGitlabTree(rootArgs)?.files.map((f) => f.path)).toEqual([
      "content/b.md",
    ]);
  });

  it("is a no-op when the arguments match no cached entry", async () => {
    const args = gitlab.treesArgs(config, "", { recursive: true });
    await seedGitlabTree(args, ["content/a.md"]);

    const stale = gitlab.treesArgs(config, "content", { recursive: false });
    gitlab.updateTreeCache(store.dispatch, stale, (draft) => {
      draft.files = [];
    });

    expect(readGitlabTree(args)?.files).toHaveLength(1);
  });
});

describe("updateDirectoryCache", () => {
  it("replaces GitHub's bare-array listing", async () => {
    const args = github.contentArgs(config, "content");
    await store.dispatch(
      githubContentApi.util.upsertQueryData(
        "getGitHubContent",
        args as never,
        [{ path: "content/a.md" }, { path: "content/b.md" }] as never,
      ),
    );

    github.updateDirectoryCache(store.dispatch, args, (files) =>
      files.filter((f) => f.path !== "content/a.md"),
    );

    const data = githubContentApi.endpoints.getGitHubContent.select(
      args as never,
    )(store.getState()).data as { path: string }[];
    expect(data.map((f) => f.path)).toEqual(["content/b.md"]);
  });

  it("mutates GitLab's items array in place", async () => {
    const args = gitlab.contentArgs(config, "content");
    await store.dispatch(
      gitlabContentApi.util.upsertQueryData(
        "getGitLabContent",
        args as never,
        {
          items: [{ path: "content/a.md" }, { path: "content/b.md" }],
        } as never,
      ),
    );

    gitlab.updateDirectoryCache(store.dispatch, args, (files) => [
      ...files,
      { path: "content/c.md" },
    ]);

    const data = gitlabContentApi.endpoints.getGitLabContent.select(
      args as never,
    )(store.getState()).data as { items: { path: string }[] };
    expect(data.items.map((f) => f.path)).toEqual([
      "content/a.md",
      "content/b.md",
      "content/c.md",
    ]);
  });
});

describe("updateContentCache", () => {
  it("patches a single file entry addressed by the parser flag", async () => {
    const args = github.contentArgs(config, "content/a.md", { parser: true });
    await store.dispatch(
      githubContentApi.util.upsertQueryData(
        "getGitHubContent",
        args as never,
        {
          content: "old",
        } as never,
      ),
    );

    github.updateContentCache(store.dispatch, args, (draft) => {
      draft.content = "new";
      draft.commitDate = "2026-07-30";
    });

    const data = githubContentApi.endpoints.getGitHubContent.select(
      args as never,
    )(store.getState()).data as { content: string; commitDate: string };
    expect(data).toMatchObject({ content: "new", commitDate: "2026-07-30" });
  });

  it("does not cross-write between the parsed and raw entries", async () => {
    const parsed = github.contentArgs(config, "a.md", { parser: true });
    const raw = github.contentArgs(config, "a.md", { parser: false });
    await store.dispatch(
      githubContentApi.util.upsertQueryData(
        "getGitHubContent",
        parsed as never,
        {
          content: "parsed",
        } as never,
      ),
    );
    await store.dispatch(
      githubContentApi.util.upsertQueryData(
        "getGitHubContent",
        raw as never,
        {
          content: "raw",
        } as never,
      ),
    );

    github.updateContentCache(store.dispatch, parsed, (draft) => {
      draft.content = "patched";
    });

    const rawData = githubContentApi.endpoints.getGitHubContent.select(
      raw as never,
    )(store.getState()).data as { content: string };
    expect(rawData.content).toBe("raw");
  });
});
