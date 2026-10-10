import { describe, expect, it } from "vitest";
import { normalizeRepoPath, writeDenial } from "./path-policy";

const CONTENT_ONLY = {
  writableRoots: ["src/content", "public/images", ".sitepins"],
};

describe("normalizeRepoPath", () => {
  it("strips ./ and duplicate slashes", () => {
    expect(normalizeRepoPath("./src//content/a.md")).toBe("src/content/a.md");
  });

  it.each([
    "../secrets",
    "src/../../etc/passwd",
    "/etc/passwd",
    ".git/config",
    "sub/.GIT/hooks/pre-commit",
    "a\\b",
    "a\u0000b",
    "a\nb",
    "",
    ".",
    42,
  ])("rejects %j", (input) => {
    expect(() => normalizeRepoPath(input)).toThrow();
  });
});

describe("writeDenial", () => {
  it("allows paths inside writable roots", () => {
    expect(writeDenial("src/content/blog/a.md", CONTENT_ONLY)).toBeNull();
    expect(writeDenial(".sitepins/schema/blog.json", CONTENT_ONLY)).toBeNull();
  });

  it("refuses paths outside the roots, including look-alike prefixes", () => {
    expect(writeDenial("package.json", CONTENT_ONLY)).toMatch(
      /outside the folders/,
    );
    expect(writeDenial("src/content-evil/a.md", CONTENT_ONLY)).toMatch(
      /outside the folders/,
    );
  });

  it.each([
    ".github/workflows/deploy.yml",
    ".GitHub/Workflows/x.yml",
    ".github/actions/setup/action.yml",
    ".gitlab-ci.yml",
    ".gitmodules",
    ".forgejo/workflows/ci.yml",
  ])("never allows %s, even with code access", (path) => {
    expect(writeDenial(path, { writableRoots: "all" })).toMatch(
      /never writable/,
    );
  });

  it("allows any other path with code access", () => {
    expect(writeDenial("package.json", { writableRoots: "all" })).toBeNull();
  });
});
