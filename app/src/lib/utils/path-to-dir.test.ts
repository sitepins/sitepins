import { TConfig, TFiles, TTree } from "@/types";
import { describe, expect, it } from "vitest";
import { pathToDir } from "./path-to-dir";

/**
 * Every optimistic cache update rebuilds the sidebar through this function, so
 * a regression here shows up as files appearing in the wrong section rather
 * than as a failed request.
 */

const config = {
  content: "content",
  media: "static/images",
  configs: ["hugo.toml"],
} as TConfig;

const blob = (path: string, size?: number): TTree => ({
  path,
  sha: `sha-${path}`,
  type: "blob",
  size,
});

const dir = (path: string): TTree => ({
  path,
  sha: `sha-${path}`,
  type: "tree",
});

const sectionOf = (result: TFiles[], name: string) =>
  result.find((node) => node.name === name);

const namesOf = (node: TFiles | undefined) =>
  (node?.children ?? []).map((child) => child.name);

describe("pathToDir", () => {
  it("always returns the four top-level sections", () => {
    expect(pathToDir([], config).map((n) => n.name)).toEqual([
      "root",
      "media",
      "theme",
      "code",
    ]);
  });

  it("unwraps the content directory so its files sit at the root", () => {
    const result = pathToDir(
      [dir("content"), blob("content/post.md"), blob("content/about.md")],
      config,
    );

    expect(namesOf(sectionOf(result, "root"))).toEqual(["post.md", "about.md"]);
  });

  it("nests subdirectories under content", () => {
    const result = pathToDir(
      [dir("content"), dir("content/blog"), blob("content/blog/first.md")],
      config,
    );

    const blog = sectionOf(result, "root")?.children?.[0];
    expect(blog).toMatchObject({ name: "blog", isFile: false });
    expect(namesOf(blog)).toEqual(["first.md"]);
  });

  it("routes files under the media directory into the media section", () => {
    const result = pathToDir(
      [dir("static/images"), blob("static/images/hero.png", 2048)],
      config,
    );

    // Unlike content, media keeps its full directory structure.
    expect(namesOf(sectionOf(result, "media"))).toEqual(["static"]);
    expect(findByName(sectionOf(result, "media"), "hero.png")).toBeDefined();
    expect(namesOf(sectionOf(result, "root"))).toEqual([]);
  });

  it("carries the blob size onto media entries", () => {
    const result = pathToDir([blob("static/images/hero.png", 2048)], config);

    const hero = findByName(sectionOf(result, "media"), "hero.png");
    expect(hero).toMatchObject({ size: 2048, isFile: true, isMedia: true });
  });

  it("routes configured theme files into the theme section", () => {
    const result = pathToDir([blob("hugo.toml")], config);

    expect(namesOf(sectionOf(result, "theme"))).toEqual(["hugo.toml"]);
    expect(namesOf(sectionOf(result, "code"))).toEqual([]);
  });

  it("puts everything else into code", () => {
    const result = pathToDir(
      [dir("layouts"), blob("layouts/index.html"), blob("README.md")],
      config,
    );

    expect(namesOf(sectionOf(result, "code"))).toEqual([
      "layouts",
      "README.md",
    ]);
  });

  it("keeps media out of the code section", () => {
    const result = pathToDir([blob("assets/logo.png")], config);

    expect(namesOf(sectionOf(result, "code"))).toEqual([]);
  });

  it("hides dotfiles and the .sitepins folder from code", () => {
    const result = pathToDir(
      [blob(".gitignore"), blob(".sitepins/config.json"), blob("main.go")],
      config,
    );

    expect(namesOf(sectionOf(result, "code"))).toEqual(["main.go"]);
  });

  it("marks entries with an extension as files and others as directories", () => {
    const result = pathToDir(
      [dir("content/notes"), blob("content/notes/a.md")],
      config,
    );

    const notes = sectionOf(result, "root")?.children?.[0];
    expect(notes?.isFile).toBe(false);
    expect(notes?.children?.[0]?.isFile).toBe(true);
  });

  it("ignores .gitkeep placeholders", () => {
    const result = pathToDir(
      [dir("content/empty"), blob("content/empty/.gitkeep")],
      config,
    );

    const empty = sectionOf(result, "root")?.children?.[0];
    expect(empty?.name).toBe("empty");
    expect(empty?.children).toEqual([]);
  });

  it("does not duplicate a directory shared by sibling files", () => {
    const result = pathToDir(
      [
        dir("content/blog"),
        blob("content/blog/a.md"),
        blob("content/blog/b.md"),
      ],
      config,
    );

    const root = sectionOf(result, "root");
    expect(root?.children).toHaveLength(1);
    expect(namesOf(root?.children?.[0])).toEqual(["a.md", "b.md"]);
  });

  it("falls back to the flat content list when the configured dir is absent", () => {
    const result = pathToDir([blob("posts/a.md")], {
      ...config,
      content: "posts",
    } as TConfig);

    expect(namesOf(sectionOf(result, "root"))).toEqual(["a.md"]);
  });

  it("tolerates a trailing slash on configured directories", () => {
    const result = pathToDir([blob("content/a.md")], {
      ...config,
      content: "content/",
    } as TConfig);

    expect(namesOf(sectionOf(result, "root"))).toEqual(["a.md"]);
  });
});

function findByName(
  node: TFiles | undefined,
  name: string,
): TFiles | undefined {
  for (const child of node?.children ?? []) {
    if (child.name === name) return child;
    const nested = findByName(child, name);
    if (nested) return nested;
  }
  return undefined;
}
