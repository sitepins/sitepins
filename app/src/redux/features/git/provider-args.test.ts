import { TFiles } from "@/types";
import { describe, expect, it } from "vitest";
import {
  getGitProviderArgs,
  gitProviderArgs,
  RepoConfig,
  toTreeEntry,
} from "./provider-args";

const config: RepoConfig = {
  owner: "acme",
  repoName: "site",
  branch: "main",
};

const { github, gitlab } = gitProviderArgs;

describe("getGitProviderArgs", () => {
  it("matches the provider name case-insensitively", () => {
    expect(getGitProviderArgs("Gitlab").id).toBe("gitlab");
    expect(getGitProviderArgs("gitlab").id).toBe("gitlab");
    expect(getGitProviderArgs("Github").id).toBe("github");
  });

  it("falls back to github for unknown or missing providers", () => {
    expect(getGitProviderArgs(undefined).id).toBe("github");
    expect(getGitProviderArgs(null).id).toBe("github");
    expect(getGitProviderArgs("").id).toBe("github");
    expect(getGitProviderArgs("bitbucket").id).toBe("github");
  });
});

describe("repoId", () => {
  it("joins owner and repo for github", () => {
    expect(github.repoId(config)).toBe("acme/site");
  });

  it("falls back to the owner alone when gitlab has no repo name", () => {
    expect(gitlab.repoId(config)).toBe("acme/site");
    expect(gitlab.repoId({ ...config, repoName: "" })).toBe("acme");
  });
});

describe("query arguments", () => {
  it("builds github content args", () => {
    expect(
      github.contentArgs(config, "content/a.md", { parser: true }),
    ).toEqual({
      owner: "acme",
      repo: "site",
      path: "content/a.md",
      ref: "main",
      parser: true,
    });
  });

  it("builds gitlab content args under its own key names", () => {
    expect(
      gitlab.contentArgs(config, "content/a.md", { parser: true }),
    ).toEqual({
      id: "acme/site",
      file_path: "content/a.md",
      ref: "main",
      parser: true,
    });
  });

  it("omits parser entirely when it is not requested", () => {
    expect(github.contentArgs(config, "a.md")).not.toHaveProperty("parser");
    expect(gitlab.contentArgs(config, "a.md")).not.toHaveProperty("parser");
  });

  it("addresses github trees by ref, ignoring the directory", () => {
    const args = github.treesArgs(config, "content/blog", { recursive: true });
    expect(args).toMatchObject({ tree_sha: "main", recursive: "1" });
    expect(args).not.toHaveProperty("path");
  });

  it("passes the directory through for gitlab trees", () => {
    expect(
      gitlab.treesArgs(config, "content/blog", { recursive: true }),
    ).toMatchObject({
      id: "acme/site",
      path: "content/blog",
      ref: "main",
      recursive: true,
    });
  });

  it("uses each provider's own falsy encoding for non-recursive trees", () => {
    expect(github.treesArgs(config, "").recursive).toBeUndefined();
    expect(gitlab.treesArgs(config, "").recursive).toBe(false);
  });
});

describe("treeScopeCovers", () => {
  it("treats a recursive github tree as covering the whole repo", () => {
    const args = github.treesArgs(config, "", { recursive: true });
    expect(github.treeScopeCovers(args, "content/blog/deep/a.md")).toBe(true);
  });

  it("limits a shallow github tree to root-level files", () => {
    const args = github.treesArgs(config, "", { recursive: false });
    expect(github.treeScopeCovers(args, "README.md")).toBe(true);
    expect(github.treeScopeCovers(args, "content/a.md")).toBe(false);
  });

  it("covers everything below the path for a recursive gitlab tree", () => {
    const args = gitlab.treesArgs(config, "content", { recursive: true });
    expect(gitlab.treeScopeCovers(args, "content/blog/a.md")).toBe(true);
    expect(gitlab.treeScopeCovers(args, "static/a.png")).toBe(false);
  });

  it("covers only direct children for a shallow gitlab tree", () => {
    const args = gitlab.treesArgs(config, "content", { recursive: false });
    expect(gitlab.treeScopeCovers(args, "content/a.md")).toBe(true);
    expect(gitlab.treeScopeCovers(args, "content/blog/a.md")).toBe(false);
  });

  it("covers the repo root for a recursive gitlab tree with an empty path", () => {
    const args = gitlab.treesArgs(config, "", { recursive: true });
    expect(gitlab.treeScopeCovers(args, "content/blog/a.md")).toBe(true);
  });

  it("does not confuse a sibling directory with a matching prefix", () => {
    const args = gitlab.treesArgs(config, "content", { recursive: true });
    expect(gitlab.treeScopeCovers(args, "contents/a.md")).toBe(false);
  });
});

describe("updateDirectoryListing", () => {
  const drop = (path: string) => (files: { path: string }[]) =>
    files.filter((file) => file.path !== path);

  it("returns a replacement array for github's bare-array cache", () => {
    const cache = [{ path: "a.md" }, { path: "b.md" }];

    expect(github.updateDirectoryListing(cache, drop("a.md"))).toEqual([
      { path: "b.md" },
    ]);
  });

  it("tolerates a github cache that has not loaded yet", () => {
    expect(github.updateDirectoryListing(undefined, drop("a.md"))).toEqual([]);
  });

  it("mutates items in place for gitlab's wrapped cache", () => {
    const cache = { items: [{ path: "a.md" }, { path: "b.md" }] };

    github.updateDirectoryListing(cache, drop("a.md")); // wrong provider: no-op
    expect(cache.items).toHaveLength(2);

    gitlab.updateDirectoryListing(cache, drop("a.md"));
    expect(cache.items).toEqual([{ path: "b.md" }]);
  });

  it("leaves a gitlab cache without items untouched", () => {
    const cache = { other: 1 };
    expect(() =>
      gitlab.updateDirectoryListing(cache, drop("a.md")),
    ).not.toThrow();
    expect(cache).toEqual({ other: 1 });
  });
});

describe("toTreeEntry", () => {
  const file: TFiles = {
    name: "hero.png",
    sha: "abc123",
    path: "static/hero.png",
    isFile: true,
    size: 42,
    commitDate: "2026-07-30T00:00:00.000Z",
  };

  it("marks files as blobs so media stays out of the code listing", () => {
    expect(toTreeEntry(file)).toEqual({
      path: "static/hero.png",
      sha: "abc123",
      type: "blob",
      size: 42,
      commitDate: "2026-07-30T00:00:00.000Z",
      createdDate: undefined,
    });
  });

  it("marks directories as trees", () => {
    expect(toTreeEntry({ ...file, isFile: false }).type).toBe("tree");
  });
});
