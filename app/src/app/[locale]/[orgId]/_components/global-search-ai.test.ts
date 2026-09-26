import { TConfig, TFiles } from "@/types";
import { describe, expect, it, vi } from "vitest";
import {
  buildSearchIndex,
  getViewedFilePath,
  toRepoPath,
} from "./global-search-ai";

vi.mock("@/editor/plugins/copilot-kit", () => ({
  getAICredential: () => undefined,
}));

const config = {
  provider: "github",
  owner: "acme",
  repoName: "site",
  branch: "main",
  content: "src/content",
  arrangement: [],
} as unknown as TConfig;

const file = (path: string, extra: Partial<TFiles> = {}): TFiles => ({
  name: path.split("/").pop()!,
  path: `content/${path}`,
  sha: null,
  isFile: true,
  ...extra,
});

describe("toRepoPath", () => {
  it("strips only the virtual tree prefix", () => {
    expect(toRepoPath(file("content/posts/a.md"))).toBe("content/posts/a.md");
  });
});

describe("buildSearchIndex", () => {
  it("assigns collections and merges cached commit dates", () => {
    const index = buildSearchIndex(
      [file("src/content/blog/a.md", { size: 42 }), file("astro.config.mjs")],
      config,
      [{ name: "Blog", path: "src/content/blog" }],
      {
        "acme/site/main/src/content/blog/a.md": {
          sha: "x",
          commitDate: "2026-01-02T00:00:00Z",
          createdDate: "2025-01-01T00:00:00Z",
        },
      },
    );
    expect(index[0]).toEqual({
      id: 0,
      path: "src/content/blog/a.md",
      collection: "Blog",
      updated: "2026-01-02T00:00:00Z",
      created: "2025-01-01T00:00:00Z",
      size: 42,
    });
    expect(index[1]).toMatchObject({ id: 1, collection: undefined });
  });
});

describe("getViewedFilePath", () => {
  const knownPaths = new Set(["src/content/blog/a.md", "astro.config.mjs"]);

  it("resolves an open content file", () => {
    expect(
      getViewedFilePath({
        pathname: "/org-1/p1/content/src/content/blog/a.md",
        projectId: "p1",
        params: { file: ["src", "content", "blog", "a.md"] },
        config,
        knownPaths,
      }),
    ).toBe("src/content/blog/a.md");
  });

  it("resolves an open code file", () => {
    expect(
      getViewedFilePath({
        pathname: "/org-1/p1/code/astro.config.mjs",
        projectId: "p1",
        params: { file: ["astro.config.mjs"] },
        config,
        knownPaths,
      }),
    ).toBe("astro.config.mjs");
  });

  it("ignores folder listings and non-file pages", () => {
    expect(
      getViewedFilePath({
        pathname: "/org-1/p1/content/src/content/blog",
        projectId: "p1",
        params: { file: ["src", "content", "blog"] },
        config,
        knownPaths,
      }),
    ).toBeNull();
    expect(
      getViewedFilePath({
        pathname: "/org-1/p1/settings/general",
        projectId: "p1",
        params: {},
        config,
        knownPaths,
      }),
    ).toBeNull();
  });
});
