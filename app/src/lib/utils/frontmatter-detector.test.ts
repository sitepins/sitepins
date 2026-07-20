import { describe, expect, it } from "vitest";
import { fmDetector } from "./frontmatter-detector";

describe("fmDetector", () => {
  describe("by file extension", () => {
    it("detects yaml from .yaml/.yml", () => {
      expect(fmDetector("anything", ".yaml")).toBe("yaml");
      expect(fmDetector("anything", ".yml")).toBe("yaml");
    });

    it("detects toml from .toml", () => {
      expect(fmDetector("anything", ".toml")).toBe("toml");
    });

    it("detects json from .json/.jsonc", () => {
      expect(fmDetector('{"a":1}', ".json")).toBe("json");
      expect(fmDetector('{"a":1}', ".jsonc")).toBe("json");
    });

    it("defaults markdown/mdx to yaml frontmatter", () => {
      expect(fmDetector("# Hello", ".md")).toBe("yaml");
      expect(fmDetector("# Hello", ".mdx")).toBe("yaml");
    });
  });

  describe("by content fence, no extension hint", () => {
    it("detects toml from a +++ fence", () => {
      expect(fmDetector("+++\ntitle = \"x\"\n+++\nbody")).toBe("toml");
    });

    it("detects toml from a ---toml fence", () => {
      expect(fmDetector("---toml\ntitle = \"x\"\n---\nbody")).toBe("toml");
    });

    it("detects yaml from a --- fence", () => {
      expect(fmDetector("---\ntitle: x\n---\nbody")).toBe("yaml");
    });

    it("detects json from a leading { or [", () => {
      expect(fmDetector('{"title": "x"}')).toBe("json");
      expect(fmDetector("[1, 2, 3]")).toBe("json");
    });

    it("detects plain yaml key: value content with no fence", () => {
      expect(fmDetector("title: Hello World\ndraft: false\n")).toBe("yaml");
    });
  });

  it("extension hint is overridden by an explicit content fence", () => {
    // a .md file whose body happens to start with a TOML fence should still
    // be read as toml, not the markdown-implied yaml default
    expect(fmDetector("+++\ntitle = \"x\"\n+++\nbody", ".md")).toBe("toml");
  });

  it("falls back to toml for ambiguous content with no signal at all", () => {
    expect(fmDetector("just plain text, no fence, no colon")).toBe("toml");
  });
});
