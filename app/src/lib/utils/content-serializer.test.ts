import { describe, expect, it } from "vitest";
import {
  contentFormatter,
  extractJsonComments,
  extractTomlComments,
  extractYamlComments,
  parseContentJson,
} from "./content-serializer";

// content-serializer round-trips a CMS page's frontmatter on every save.
// A regression here silently corrupts or drops user content, so these tests
// favor re-parsing the formatter's own output over asserting exact string
// layout (which is sensitive to the underlying yaml/toml library's style).

describe("parseContentJson", () => {
  it("parses fenced yaml frontmatter and splits out the body", () => {
    const content = "---\ntitle: Hello\ndraft: false\n---\nBody text here.\n";
    const { data, content: body } = parseContentJson(content, "yaml");
    expect(data).toEqual({ title: "Hello", draft: false });
    expect(body?.trim()).toBe("Body text here.");
  });

  it("parses plain key:value yaml with no fence", () => {
    const content = "title: Hello\ndraft: false\n";
    const { data, content: body } = parseContentJson(content, "yaml");
    expect(data).toEqual({ title: "Hello", draft: false });
    expect(body).toBeNull();
  });

  it("parses fenced toml frontmatter", () => {
    const content = '+++\ntitle = "Hello"\ndraft = false\n+++\nBody text.\n';
    const { data, content: body } = parseContentJson(content, "toml");
    expect(data).toEqual({ title: "Hello", draft: false });
    expect(body?.trim()).toBe("Body text.");
  });

  it("parses plain json", () => {
    const content = '{"title": "Hello", "draft": false}';
    const { data, content: body } = parseContentJson(content, "json");
    expect(data).toEqual({ title: "Hello", draft: false });
    expect(body).toBeNull();
  });
});

describe("contentFormatter round trips", () => {
  it("yaml: updates a value, drops a removed key, and keeps an unrelated comment", () => {
    const original =
      "---\n# the page title\ntitle: Old Title\ndraft: false\n---\nBody content\n";

    const output = contentFormatter({
      data: { title: "New Title" }, // draft intentionally removed
      page_content: "Body content\n",
      format: "yaml",
      originalContent: original,
    });

    expect(output).toContain("# the page title");

    const { data } = parseContentJson(output, "yaml");
    expect(data).toEqual({ title: "New Title" });
  });

  it("yaml: adds a new array item alongside existing ones", () => {
    const original = "---\ntags:\n  - a\n  - b\n---\nBody\n";

    const output = contentFormatter({
      data: { tags: ["a", "b", "c"] },
      page_content: "Body\n",
      format: "yaml",
      originalContent: original,
    });

    const { data } = parseContentJson(output, "yaml");
    expect(data).toEqual({ tags: ["a", "b", "c"] });
  });

  it("yaml: builds fresh frontmatter when there's no original content", () => {
    const output = contentFormatter({
      data: { title: "Brand New" },
      page_content: "",
      format: "yaml",
      startWith: "---",
    });

    const { data } = parseContentJson(output, "yaml");
    expect(data).toEqual({ title: "Brand New" });
  });

  it("toml: patches an existing key in place", () => {
    const original = '+++\ntitle = "Old Title"\ndraft = false\n+++\nBody\n';

    const output = contentFormatter({
      data: { title: "New Title", draft: false },
      page_content: "Body\n",
      format: "toml",
      originalContent: original,
    });

    const { data } = parseContentJson(output, "toml");
    expect(data).toEqual({ title: "New Title", draft: false });
  });

  it("toml: fallback stringify is parseable for a brand-new file", () => {
    const output = contentFormatter({
      data: { title: "Brand New", count: 3 },
      page_content: "",
      format: "toml",
    });

    const { data } = parseContentJson(output, "toml");
    expect(data).toEqual({ title: "Brand New", count: 3 });
  });

  it("json: serializes data as pretty JSON followed by the page content", () => {
    const output = contentFormatter({
      data: { title: "Hello" },
      page_content: "",
      format: "json",
    });

    const { data } = parseContentJson(output, "json");
    expect(data).toEqual({ title: "Hello" });
  });
});

describe("comment extraction", () => {
  it("extractYamlComments attaches a preceding comment to its key", () => {
    const comments = extractYamlComments("# the title\ntitle: Hello\n");
    expect(comments["title"]).toBe("the title");
  });

  it("extractTomlComments attaches a preceding comment under its table", () => {
    const comments = extractTomlComments(
      '[seo]\n# meta description\ndescription = "hi"\n',
    );
    expect(comments["seo.description"]).toBe("meta description");
  });

  it("extractJsonComments attaches a // comment to its key", () => {
    const comments = extractJsonComments(
      '{\n  // display name\n  "title": "Hello"\n}\n',
    );
    expect(comments["title"]).toBe("display name");
  });
});
