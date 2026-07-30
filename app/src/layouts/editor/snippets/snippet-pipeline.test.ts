import { toMarkdown } from "mdast-util-to-markdown";
import type { Root, RootContent, Text } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";
import { remarkHtml } from "./html/html-transformer";
import { remarkHugo } from "./hugo/hugo-transformer";
import { remarkJsx } from "./jsx/jsx-transformer";
import { nodeValue, shortcodeMetaOf, type JsxNode } from "./snippet-mdast";

// The shortcode / JSX pipeline is the part of the editor that can silently
// corrupt a user's content: a mis-parsed tag loses the component and its body
// on the next save. These tests pin the mdast the transformers produce and the
// markdown they stringify back, so a refactor that changes either is caught.

/** Parses markdown through the real editor plugin chain. */
function transform(markdown: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkHtml)
    .use(remarkJsx)
    .use(remarkHugo);

  const tree = processor.runSync(processor.parse(markdown)) as Root;
  return { tree, processor };
}

/** Round-trips markdown back out using the extensions the plugins registered. */
function stringify(markdown: string) {
  const { tree, processor } = transform(markdown);
  const extensions = processor.data("toMarkdownExtensions") ?? [];
  return toMarkdown(tree, { extensions }).trim();
}

function collect(tree: Root, type: string) {
  const found: RootContent[] = [];
  visit(tree, type, (node) => {
    found.push(node as RootContent);
  });
  return found;
}

const jsxNodes = (tree: Root) =>
  [...collect(tree, "jsx_block"), ...collect(tree, "jsx_inline")] as JsxNode[];

describe("JSX components", () => {
  it("lifts a self-closing component to a block node", () => {
    const { tree } = transform("<Notice />");
    const nodes = jsxNodes(tree);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("Notice");
    expect(nodes[0].isSelfClosing).toBe(true);
    expect(nodes[0].type).toBe("jsx_block");
  });

  it("parses attributes off the opening tag", () => {
    const { tree } = transform('<Notice type="warning" title="Heads up" />');
    const [node] = jsxNodes(tree);

    expect(node.name).toBe("Notice");
    expect(node.attributes).toMatchObject({
      type: "warning",
      title: "Heads up",
    });
  });

  it("treats a valueless attribute as a boolean", () => {
    const { tree } = transform("<Notice dismissible />");
    const [node] = jsxNodes(tree);

    expect(node.attributes).toHaveProperty("dismissible");
  });

  it("keeps a component with a body from being marked self-closing", () => {
    const { tree } = transform("<Notice>\n\nHello body\n\n</Notice>");
    const [node] = jsxNodes(tree);

    expect(node.name).toBe("Notice");
    expect(node.isSelfClosing).toBe(false);
    expect(node.children.length).toBeGreaterThan(0);
  });

  it("preserves the body text through a round trip", () => {
    const out = stringify("<Notice>\n\nHello body\n\n</Notice>");

    expect(out).toContain("<Notice>");
    expect(out).toContain("Hello body");
    expect(out).toContain("</Notice>");
  });

  it("round-trips a self-closing component", () => {
    expect(stringify("<Notice />")).toContain("<Notice");
  });

  it("keeps nested components intact", () => {
    const { tree } = transform(
      "<Tabs>\n\n<Tab>\n\nFirst\n\n</Tab>\n\n<Tab>\n\nSecond\n\n</Tab>\n\n</Tabs>",
    );
    const names = jsxNodes(tree).map((n) => n.name);

    expect(names).toContain("Tabs");
    expect(names.filter((n) => n === "Tab")).toHaveLength(2);
  });

  it("round-trips nested components without losing the inner tags", () => {
    const out = stringify(
      "<Tabs>\n\n<Tab>\n\nFirst\n\n</Tab>\n\n<Tab>\n\nSecond\n\n</Tab>\n\n</Tabs>",
    );

    expect(out).toContain("<Tabs>");
    expect(out).toContain("</Tabs>");
    expect(out.match(/<Tab>/g)).toHaveLength(2);
    expect(out).toContain("First");
    expect(out).toContain("Second");
  });

  it("keeps a component inline when it sits beside real text", () => {
    const { tree } = transform("Some text <Badge /> trailing words");
    const nodes = jsxNodes(tree);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("jsx_inline");
  });

  it("ignores lowercase html tags", () => {
    const { tree } = transform("<div>plain html</div>");

    expect(jsxNodes(tree)).toHaveLength(0);
  });

  // A zero-width char stops remark from parsing the tag as html, so the
  // component falls through to the shortcode transformer instead. It must
  // still survive, flagged as JSX and with the invisible chars stripped.
  it("keeps a component that carries zero-width characters", () => {
    const { tree } = transform("<Notice​ />");
    const shortcodes = collect(tree, "shortcode");

    expect(shortcodes).toHaveLength(1);
    expect(shortcodeMetaOf(shortcodes[0])?.isJsxComponent).toBe(true);
    expect((shortcodes[0] as { content: string }).content).toBe("<Notice />");
  });
});

describe("Hugo shortcodes", () => {
  it("recognises an angle-bracket shortcode", () => {
    const { tree } = transform("{{< figure src=/img.png >}}");
    const nodes = collect(tree, "shortcode");

    expect(nodes).toHaveLength(1);
    expect(shortcodeMetaOf(nodes[0])?.name).toBe("figure");
  });

  it("recognises a percent shortcode", () => {
    const { tree } = transform("{{% note %}}");
    const nodes = collect(tree, "shortcode");

    expect(nodes).toHaveLength(1);
    expect(shortcodeMetaOf(nodes[0])?.name).toBe("note");
  });

  it("merges an opening and closing pair into one block node", () => {
    const { tree } = transform("{{< note >}}\n\nInner text\n\n{{< /note >}}");
    const nodes = collect(tree, "shortcode");

    expect(nodes).toHaveLength(1);
    const meta = shortcodeMetaOf(nodes[0]);
    expect(meta?.isBlock).toBe(true);
    expect(meta?.closingContent).toBe("{{< /note >}}");
  });

  it("round-trips a block shortcode with its body", () => {
    const out = stringify("{{< note >}}\n\nInner text\n\n{{< /note >}}");

    expect(out).toContain("{{< note >}}");
    expect(out).toContain("Inner text");
    expect(out).toContain("{{< /note >}}");
  });

  it("round-trips a standalone shortcode", () => {
    expect(stringify("{{< figure src=/img.png >}}")).toContain(
      "{{< figure src=/img.png >}}",
    );
  });

  it("marks a JSX component so it can be routed away from Hugo", () => {
    const { tree } = transform("<Notice />");
    const jsx = jsxNodes(tree);

    // JSX is handled by remarkJsx before remarkHugo sees the `<` delimiter.
    expect(jsx).toHaveLength(1);
    expect(collect(tree, "shortcode")).toHaveLength(0);
  });

  it("keeps surrounding prose when a shortcode is mid-paragraph", () => {
    const out = stringify("Before {{< badge >}} after");

    expect(out).toContain("Before");
    expect(out).toContain("{{< badge >}}");
    expect(out).toContain("after");
  });
});

// Snippets nest: a component can wrap another component, and a Hugo block can
// wrap either. These are the cases most likely to lose content, so each one
// pins both the parsed shape and a full markdown round trip.
describe("nested snippets", () => {
  it("nests a hugo block inside a hugo block", () => {
    const src =
      "{{< outer >}}\n\n{{< inner >}}\n\nDeep\n\n{{< /inner >}}\n\n{{< /outer >}}";
    const { tree } = transform(src);
    const outer = collect(tree, "shortcode");

    expect(shortcodeMetaOf(outer[0])?.name).toBe("outer");
    expect(shortcodeMetaOf(outer[0])?.isBlock).toBe(true);

    const out = stringify(src);
    expect(out).toBe(
      "{{< outer >}}\n{{< inner >}}\nDeep\n{{< /inner >}}\n{{< /outer >}}",
    );
    expect(stringify(out)).toBe(out);
  });

  it("nests same-named hugo blocks without closing the wrong one", () => {
    const src =
      "{{< box >}}\n\n{{< box >}}\n\nInner\n\n{{< /box >}}\n\n{{< /box >}}";
    const out = stringify(src);

    expect(out).toBe(
      "{{< box >}}\n{{< box >}}\nInner\n{{< /box >}}\n{{< /box >}}",
    );
    expect(stringify(out)).toBe(out);
  });

  it("nests a hugo block inside a JSX component", () => {
    const src =
      "<Notice>\n\n{{< inner >}}\n\nDeep\n\n{{< /inner >}}\n\n</Notice>";
    const out = stringify(src);

    expect(out).toBe("<Notice>\n{{< inner >}}\nDeep\n{{< /inner >}}\n</Notice>");
    expect(stringify(out)).toBe(out);
  });

  it("nests JSX three levels deep", () => {
    const src =
      "<Tabs>\n\n<Tab>\n\n<Notice>\n\nDeep\n\n</Notice>\n\n</Tab>\n\n</Tabs>";
    const { tree } = transform(src);

    expect(jsxNodes(tree).map((n) => n.name)).toEqual(
      expect.arrayContaining(["Tabs", "Tab", "Notice"]),
    );

    const out = stringify(src);
    expect(out).toBe(
      "<Tabs>\n<Tab>\n<Notice>\nDeep\n</Notice>\n</Tab>\n</Tabs>",
    );
    expect(stringify(out)).toBe(out);
  });

  it("nests self-closing components inside a component", () => {
    const src = "<Tabs>\n\n<Tab />\n\n<Tab />\n\n</Tabs>";
    const out = stringify(src);

    expect(out).toContain("<Tabs>");
    expect(out).toContain("</Tabs>");
    expect(out.match(/<Tab \/>/g)).toHaveLength(2);
    expect(stringify(out)).toBe(out);
  });

  // Pre-existing, verified identical on the code before the typing migration.
  // Both cases parse and serialize correctly on the first pass; only a second
  // round trip drifts. Update these when the underlying bug is fixed.
  describe("known round-trip drift", () => {
    it("appends a stray closing tag to self-closing JSX inside a hugo block", () => {
      const src = "{{< outer >}}\n\n<Notice />\n\n{{< /outer >}}";
      const once = stringify(src);

      expect(once).toBe("{{< outer >}}\n<Notice />\n{{< /outer >}}");
      expect(stringify(once)).toBe(
        "{{< outer >}}\n<Notice /></Notice>\n{{< /outer >}}",
      );
    });

    it("adds blank lines to same-named nested components", () => {
      const src = "<Box>\n\n<Box>\n\nInner\n\n</Box>\n\n</Box>";
      const once = stringify(src);

      expect(once).toBe("<Box>\n<Box>\nInner\n</Box>\n</Box>");
      expect(stringify(once)).toBe("<Box>\n<Box>\n\nInner\n</Box>\n\n</Box>");
    });
  });
});

describe("mixed content", () => {
  it("keeps headings and lists next to a component", () => {
    const out = stringify(
      "# Title\n\n<Notice />\n\n- one\n- two\n\nClosing paragraph.",
    );

    expect(out).toContain("# Title");
    expect(out).toContain("<Notice");
    expect(out).toContain("* one");
    expect(out).toContain("Closing paragraph.");
  });

  it("does not fuse adjacent blocks together", () => {
    const out = stringify("# Title\n\nParagraph one.\n\nParagraph two.");
    const lines = out.split("\n").filter(Boolean);

    expect(lines).toContain("# Title");
    expect(lines).toContain("Paragraph one.");
    expect(lines).toContain("Paragraph two.");
  });

  it("survives a second pass through the pipeline", () => {
    const source = "<Notice>\n\nHello body\n\n</Notice>";
    const once = stringify(source);
    const twice = stringify(once);

    expect(twice).toBe(once);
  });

  it("survives a second pass for hugo blocks", () => {
    const source = "{{< note >}}\n\nInner text\n\n{{< /note >}}";
    const once = stringify(source);
    const twice = stringify(once);

    expect(twice).toBe(once);
  });

  it("leaves plain markdown untouched", () => {
    const out = stringify("Just a **bold** word and a [link](/x).");

    expect(out).toContain("**bold**");
    expect(out).toContain("[link](/x)");
  });
});

describe("nodeValue", () => {
  it("reads the value off literal nodes", () => {
    expect(nodeValue({ type: "text", value: "hi" } as Text)).toBe("hi");
  });

  it("returns an empty string for nodes without one", () => {
    expect(nodeValue({ type: "paragraph" })).toBe("");
    expect(nodeValue(undefined)).toBe("");
    expect(nodeValue(null)).toBe("");
  });

  it("ignores a non-string value", () => {
    expect(nodeValue({ type: "text", value: 42 } as never)).toBe("");
  });
});
