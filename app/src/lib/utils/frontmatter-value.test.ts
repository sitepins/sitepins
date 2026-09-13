import { describe, expect, it } from "vitest";
import {
  arrayAt,
  arrayValue,
  asNode,
  idOf,
  isWrappedValue,
  parseArrayItems,
  recordValue,
  stringValue,
  unwrapValue,
} from "./frontmatter-value";

// Frontmatter reaches the renderer either raw (as parsed from the file) or
// wrapped as `{ value, id }` by the form layer. Every reader handles both.

describe("isWrappedValue", () => {
  it("is true for a form-wrapped value", () => {
    expect(isWrappedValue({ value: "a", id: "1" })).toBe(true);
  });

  it("is true even when the payload is undefined", () => {
    expect(isWrappedValue({ value: undefined })).toBe(true);
  });

  it("is false for a raw value", () => {
    expect(isWrappedValue("a")).toBe(false);
    expect(isWrappedValue(null)).toBe(false);
    expect(isWrappedValue({ title: "a" })).toBe(false);
  });
});

describe("unwrapValue", () => {
  it("returns a raw value unchanged", () => {
    expect(unwrapValue("a")).toBe("a");
  });

  it("unwraps one level", () => {
    expect(unwrapValue({ value: "a", id: "1" })).toBe("a");
  });

  it("unwraps nested wrappers", () => {
    expect(unwrapValue({ value: { value: "a" } })).toBe("a");
  });

  it("passes undefined through", () => {
    expect(unwrapValue(undefined)).toBeUndefined();
  });
});

describe("typed readers", () => {
  it("stringValue returns only strings", () => {
    expect(stringValue({ value: "a" })).toBe("a");
    expect(stringValue({ value: 3 })).toBeUndefined();
    expect(stringValue(undefined)).toBeUndefined();
  });

  it("arrayValue reads through a wrapper", () => {
    expect(arrayValue({ value: [1, 2] })).toEqual([1, 2]);
    expect(arrayValue([1])).toEqual([1]);
    expect(arrayValue("a")).toBeUndefined();
  });

  it("recordValue rejects arrays", () => {
    expect(recordValue({ value: { a: 1 } })).toEqual({ a: 1 });
    expect(recordValue({ value: [1] })).toBeUndefined();
  });
});

describe("node helpers", () => {
  it("asNode passes objects through and empties primitives", () => {
    const obj = { a: 1 };
    expect(asNode(obj)).toBe(obj);
    expect(asNode("a")).toEqual({});
    expect(asNode(null)).toEqual({});
  });

  it("asNode keeps the reference, so walkers can mutate through it", () => {
    const tree: Record<string, unknown> = { child: { a: 1 } };
    asNode(tree.child).a = 2;
    expect(tree.child).toEqual({ a: 2 });
  });

  it("idOf reads the form id", () => {
    expect(idOf({ value: "a", id: "abc" })).toBe("abc");
    expect(idOf({ value: "a" })).toBeUndefined();
    expect(idOf("a")).toBeUndefined();
  });

  it("arrayAt returns the array only when the key holds one", () => {
    expect(arrayAt({ tags: ["a"] }, "tags")).toEqual(["a"]);
    expect(arrayAt({ tags: "a" }, "tags")).toBeUndefined();
    expect(arrayAt({}, "tags")).toBeUndefined();
  });

  it("arrayAt returns the live array, so pushes reach the tree", () => {
    const node: Record<string, unknown> = { tags: ["a"] };
    arrayAt(node, "tags")?.push("b");
    expect(node.tags).toEqual(["a", "b"]);
  });
});

describe("parseArrayItems & extractArrayItemsFromText", () => {
  it("parses raw arrays and wrapped array values", () => {
    expect(parseArrayItems(["tag1", "tag2"])).toEqual(["tag1", "tag2"]);
    expect(parseArrayItems([{ value: "tag1" }, { value: "tag2" }])).toEqual([
      "tag1",
      "tag2",
    ]);
  });

  it("parses comma and semicolon separated strings", () => {
    expect(parseArrayItems("tag1, tag2; tag3")).toEqual([
      "tag1",
      "tag2",
      "tag3",
    ]);
  });

  it("parses JSON array strings", () => {
    expect(parseArrayItems('["creative design", "web design"]')).toEqual([
      "creative design",
      "web design",
    ]);
  });

  it("extracts items from markdown code blocks with YAML bullets", () => {
    const yamlPrompt = `Add a set of relevant tags to the frontmatter, for example:
\`\`\`yaml
tags:
  - creative design
  - web design
  - user experience
  - lorem ipsum
  - content strategy
\`\`\`
Including appropriate tags introduces the target keywords.`;

    expect(parseArrayItems(yamlPrompt)).toEqual([
      "creative design",
      "web design",
      "user experience",
      "lorem ipsum",
      "content strategy",
    ]);
  });

  it("extracts items from raw YAML bullets without code blocks", () => {
    const rawYaml = `tags:
  - astro
  - nextjs
  - tailwind`;

    expect(parseArrayItems(rawYaml)).toEqual(["astro", "nextjs", "tailwind"]);
  });
});
