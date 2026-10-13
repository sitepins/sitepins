import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./agent.diff";
import { closestLines, closestPaths } from "./agent.suggest";

describe("closestPaths", () => {
  it("prefers the same file name, then near spellings", () => {
    const paths = [
      "src/content/blog/hello.md",
      "src/content/blog/help.md",
      "src/content/about.md",
    ];
    expect(closestPaths("src/content/hello.md", paths)).toEqual([
      "src/content/blog/hello.md",
      "src/content/blog/help.md",
    ]);
    expect(closestPaths("zzz/qqqqqq.md", paths)).toEqual([]);
  });
});

describe("closestLines", () => {
  it("ignores whitespace and quote style", () => {
    const text = 'a: 1\ntitle: "Hello World"\nzzz';
    expect(closestLines(text, "title:  'Hello World'\nmore")).toEqual([
      { line: 2, text: 'title: "Hello World"' },
    ]);
  });
});

describe("unifiedDiff", () => {
  it("shows changed lines with context", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nB\nc\n")).toBe(
      "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c",
    );
    expect(unifiedDiff("", "new\n")).toBe("@@ -0,0 +1,1 @@\n+new");
    expect(unifiedDiff("same", "same")).toBe("");
  });
});
