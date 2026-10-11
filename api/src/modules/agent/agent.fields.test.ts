import { describe, expect, it } from "vitest";
import {
  checkEntryFields,
  defaultsFromTemplate,
  missingRequired,
  serializeEntry,
  updateFields,
} from "./agent.fields";

const BODY = "\n# Hello\n\nSome --- text with +++ fences inside.\n";

describe("updateFields", () => {
  it("changes YAML frontmatter fields and keeps comments, order and body", () => {
    const text = `---\n# hero section\ntitle: Old title # shown on top\ndraft: true\nbanner:\n  image: /a.png\n  button:\n    label: Go\ntags: [a, b]\n---${BODY}`;
    const { text: out } = updateFields("src/content/post.md", text, {
      set: {
        title: "New title",
        "banner.button.label": "Start",
        "seo.description": "Hi",
      },
      unset: ["draft"],
    });
    expect(out).toBe(
      `---\n# hero section\ntitle: New title # shown on top\nbanner:\n  image: /a.png\n  button:\n    label: Start\ntags: [ a, b ]\nseo:\n  description: Hi\n---${BODY}`,
    );
  });

  it("never wraps long YAML strings", () => {
    const long = "x ".repeat(80).trim();
    const { text } = updateFields("a.md", "---\ntitle: a\n---\n", {
      set: { title: long },
    });
    expect(text.split("\n")[1]).toBe(`title: ${long}`);
  });

  it("updates TOML frontmatter in place and appends new top-level keys", () => {
    const text = `+++\ntitle = "Old" # keep me\ndraft = true\n\n[params]\ncolor = "blue"\n+++${BODY}`;
    const { text: out } = updateFields("content/post.md", text, {
      set: { title: "New", "params.color": "red", weight: 3 },
      unset: ["draft"],
    });
    expect(out).toBe(
      `+++\ntitle = "New" # keep me\n\nweight = 3\n[params]\ncolor = "red"\n+++${BODY}`,
    );
  });

  it("refuses TOML changes it can't make safely", () => {
    expect(() =>
      updateFields("a.toml", 'title = "x"\n', { set: { "a.b": "c" } }),
    ).toThrow(/edit_file/);
    expect(() =>
      updateFields("a.toml", 'title = "x"\n', { set: { title: { a: 1 } } }),
    ).toThrow(/edit_file/);
  });

  it("edits JSON data files with their own indentation", () => {
    const text = '{\n    "site": {\n        "title": "A"\n    }\n}\n';
    const { text: out } = updateFields("src/config/config.json", text, {
      set: { "site.title": "B", "menu.0.name": "Home" },
    });
    expect(out).toBe(
      '{\n    "site": {\n        "title": "B"\n    },\n    "menu": [\n        {\n            "name": "Home"\n        }\n    ]\n}\n',
    );
  });

  it("explains when a file has no frontmatter", () => {
    expect(() =>
      updateFields("a.md", "# Just text\n", { set: { title: "x" } }),
    ).toThrow(/no frontmatter/);
  });
});

describe("new entries", () => {
  const template = [
    { name: "title", type: "string", isRequired: true },
    { name: "date", type: "Date", alwaysUseCurrentDate: true },
    { name: "draft", type: "boolean", defaultValue: "true" },
    { name: "category", type: "string", options: ["news", "guides"] },
    { name: "tags", type: "Array" },
    {
      name: "author",
      type: "object",
      fields: [{ name: "name", type: "string", defaultValue: "Team" }],
    },
  ];

  it("fills defaults the way the editor does", () => {
    const data = defaultsFromTemplate(template, "Hello");
    expect(data).toEqual({
      title: "Hello",
      date: new Date().toISOString().split("T")[0],
      draft: true,
      category: "",
      tags: [],
      author: { name: "Team" },
    });
  });

  it("names unknown fields, wrong types and missing required ones", () => {
    expect(
      checkEntryFields(template, {
        titel: "x",
        draft: "no",
        category: "other",
      }),
    ).toEqual([
      expect.stringMatching(/"titel" isn't a field.*title, date/),
      '"draft" must be boolean',
      '"category" must be one of: news, guides',
    ]);
    expect(missingRequired(template, { title: "" })).toEqual(["title"]);
  });

  it("serializes like a new file from the editor", () => {
    expect(serializeEntry("yaml", { title: "A", tags: [] }, "Body\n")).toBe(
      "---\ntitle: A\ntags: []\n---\nBody\n",
    );
    expect(serializeEntry("toml", { title: "A", weight: 2 }, "\n")).toBe(
      "+++\ntitle = 'A'\nweight = 2\n+++\n\n",
    );
  });
});
