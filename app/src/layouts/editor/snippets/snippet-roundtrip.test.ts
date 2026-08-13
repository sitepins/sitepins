import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor, type TElement } from "platejs";
import { describe, expect, it } from "vitest";
import { BaseEditorKit } from "../plugins/editor-base-kit";
import { ShortcodeInlineKit, ShortcodeKit } from "./common/snippet-plugin";
import { HtmlBlockKit, HtmlInlineKit } from "./html/html-plugin";
import { JsxBlockKit, JsxInlineKit } from "./jsx/jsx-plugin";
import {
  MdxCommentInlineKit,
  MdxCommentKit,
} from "./mdx-comment/mdx-comment-plugin";

// The snippet plugins live in `EditorKit`, not `BaseEditorKit`. Without them
// the shortcode/html/jsx element types are unregistered and Slate flattens
// them to plain text, which hides exactly the bugs these tests look for.
const Kit = [
  ...BaseEditorKit,
  ShortcodeKit,
  ShortcodeInlineKit,
  HtmlBlockKit,
  HtmlInlineKit,
  JsxBlockKit,
  JsxInlineKit,
  MdxCommentKit,
  MdxCommentInlineKit,
];

/**
 * The raw/rich toggle serializes the Slate value back to markdown and reparses
 * it. Anything that is not a fixed point of that round trip mutates the user's
 * file every time they flip the switch — a `<br />` that multiplies, a tag that
 * gets escaped into literal text, a shortcode body that drifts.
 *
 * Each case asserts two things:
 *   - the second pass equals the first (the round trip is idempotent), and
 *   - no `<br />` is invented along the way.
 */

function roundTrip(markdown: string): string {
  const editor = createSlateEditor({ plugins: Kit, value: [] });
  const api = editor.getApi(MarkdownPlugin);
  const slateNodes = api.markdown.deserialize(markdown, { withoutMdx: true });
  return api.markdown.serialize({ value: slateNodes });
}

function mountedRoundTrip(markdown: string): string {
  const parser = createSlateEditor({ plugins: Kit, value: [] });
  const value = parser
    .getApi(MarkdownPlugin)
    .markdown.deserialize(markdown, { withoutMdx: true });
  const mountedEditor = createSlateEditor({ plugins: Kit, value });

  return mountedEditor
    .getApi(MarkdownPlugin)
    .markdown.serialize({ value: mountedEditor.children as TElement[] });
}

const brCount = (s: string) => (s.match(/<br\s*\/?>/g) || []).length;

function expectStable(source: string) {
  const first = roundTrip(source);
  const second = roundTrip(first);

  expect(second).toBe(first);
  expect(brCount(first)).toBe(brCount(source));
}

describe("hugo shortcodes", () => {
  it("keeps a block shortcode with a trailing br stable", () => {
    expectStable(
      `{{< notice "tip" >}}\nThis is a simple tip.\n<br />\n{{< /notice >}}`,
    );
  });

  it("keeps a block shortcode without a br stable", () => {
    expectStable(`{{< notice "info" >}}\nJust some text.\n{{< /notice >}}`);
  });

  it("keeps an inline shortcode stable", () => {
    expectStable(`Text with {{< badge >}} inline.`);
  });

  it("keeps a heading followed by a br inside a shortcode stable", () => {
    expectStable(
      `{{< notice "tip" >}}\n#### A heading\n<br />\n{{< /notice >}}`,
    );
  });

  it("keeps a shortcode with multiple paragraphs stable", () => {
    expectStable(
      `{{< notice "tip" >}}\nFirst paragraph.\n\nSecond paragraph.\n{{< /notice >}}`,
    );
  });
});

describe("nested hugo shortcodes", () => {
  it("keeps tabs containing tabs stable", () => {
    expectStable(
      `{{< tabs >}}\n{{< tab "Tab 1" >}}\nPlain body.\n{{< /tab >}}\n{{< /tabs >}}`,
    );
  });

  it("keeps a nested tab with a heading and a br stable", () => {
    expectStable(
      `{{< tabs >}}\n{{< tab "Tab 1" >}}\n#### Hey There, I am a tab\n<br />\n{{< /tab >}}\n{{< /tabs >}}`,
    );
  });

  it("keeps two nested tabs stable", () => {
    expectStable(
      `{{< tabs >}}\n{{< tab "Tab 1" >}}\nOne.\n{{< /tab >}}\n\n{{< tab "Tab 2" >}}\nTwo.\n{{< /tab >}}\n{{< /tabs >}}`,
    );
  });

  it("keeps percent and same-named nested shortcodes stable", () => {
    expectStable(
      `{{% note %}}\n{{% note %}}\nInner body.\n{{% /note %}}\n{{% /note %}}`,
    );
  });
});

describe("jsx components", () => {
  it("keeps a self-closing component stable", () => {
    expectStable(`<Badge />`);
  });

  it("keeps a component with attributes stable", () => {
    expectStable(`<Notice type="warn" title="Hi" />`);
  });

  it("keeps a block component with a body stable", () => {
    expectStable(`<Notice type="warn">\nThe body text.\n</Notice>`);
  });

  it("keeps a block component containing a br stable", () => {
    expectStable(`<Notice>\nBody text.\n<br />\n</Notice>`);
  });

  it("keeps nested components stable", () => {
    expectStable(`<Outer>\n<Inner />\n</Outer>`);
  });

  it("keeps JSX tabs with multiline paragraphs stable without creating br nodes", () => {
    expectStable(
      `<Tabs client:load>\n<Tab name="Tab 1">\n### Did you come here for something in particular?\nDid you come here for something in particular or just general Riker-bashing? And blowing into maximum warp speed, you appeared for an instant to be in two places at once. We have a saboteur aboard. We know you're dealing in stolen ore. But I wanna talk about the assassination attempt on Lieutenant Worf.\n</Tab>\n</Tabs>`,
    );
  });

  it("keeps an inline component with boolean attributes stable", () => {
    expectStable(`Text with <Badge dismissible /> inline.`);
  });
});

describe("raw html", () => {
  it("keeps an inline br in a paragraph stable", () => {
    expectStable(`Some text.\n<br />`);
  });

  it("keeps a standalone block element stable", () => {
    expectStable(`<div>\nBlock content.\n</div>`);
  });

  it("keeps inline markup stable", () => {
    expectStable(`Text with <strong>bold</strong> inside.`);
  });

  it("keeps direct HTML attributes in their source form", () => {
    const src = `<ul>\n  <li class="nav-item">\n    <a class="nav-link" href="/">Home</a>\n  </li>\n</ul>`;
    const out = roundTrip(src);

    expect(out).toContain(`class="nav-item"`);
    expect(out).toContain(`class="nav-link"`);
    expect(out).not.toContain("className=");
    expectStable(src);
  });

  it("keeps a complete HTML document in one block", () => {
    const src = `<html>
<head>
<title>Page Title</title>
</head>
<body>

<h1>My First Heading</h1>
<p>My first paragraph.</p>

</body>
</html>`;
    const editor = createSlateEditor({ plugins: Kit, value: [] });
    const nodes = editor
      .getApi(MarkdownPlugin)
      .markdown.deserialize(src, { withoutMdx: true });

    expect(nodes).toHaveLength(1);
    expect((nodes[0] as { value?: string }).value).toBe(src);
    expectStable(src);
  });

  it("keeps document metadata, scripts, styles, and HTML comments", () => {
    const src = `<!doctype html>\n<html>\n<head>\n<style>body { color: red; }</style>\n<script>window.ready = true;</script>\n</head>\n<body>\n<!-- page note -->\n<p>Body text.</p>\n</body>\n</html>`;
    const out = roundTrip(src);

    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<!-- page note -->");
    expect(out).toContain("window.ready = true;");
    expectStable(src);
  });
});

describe("markdown fidelity", () => {
  it("preserves --- thematic breaks", () => {
    const out = roundTrip(`# Heading 1\n\n---\n\n### Paragraph\n`);

    expect(out).toContain("---");
    expect(out).not.toContain("***");
  });

  it("preserves link titles and relative links", () => {
    const src = `[I'm an inline-style link with title](https://www.google.com "Google")\n\n[I'm a relative reference to a repository file](../blob/master/LICENSE)\n`;
    const out = roundTrip(src);

    expect(out).toContain(`(https://www.google.com "Google")`);
    expect(out).toContain(
      `[I'm a relative reference to a repository file](../blob/master/LICENSE)`,
    );
    expect(out).not.toMatch(/[\u200B\u200C\u200D\uFEFF]/);
    expectStable(src);
  });

  it("preserves HTML attributes inside fenced code", () => {
    const src =
      '```html\n<ul>\n  <li class="nav-item">\n    <a class="nav-link" href="/">Home</a>\n  </li>\n</ul>\n```\n';
    const out = roundTrip(src);

    expect(out).toContain(`class="nav-item"`);
    expect(out).toContain(`class="nav-link"`);
    expect(out).not.toContain("className=");
    expectStable(src);
  });

  it("keeps ordered-list emphasis and numbering", () => {
    const out = roundTrip(`3. _Did you come here_\n`);

    expect(out).toContain(`3. *Did you come here*`);
    expectStable(`3. _Did you come here_\n`);
  });

  it("keeps tables, math, task lists, blockquotes, and code language", () => {
    const src = `> Quoted *prose*.\n\n- [x] Complete\n- [ ] Pending\n\n| Name | Value |\n| --- | --- |\n| Cost | $75 |\n\nInline $x^2$ and block math:\n\n$$\nx^2 + y^2\n$$\n\n\`\`\`typescript\nconst answer = 42;\n\`\`\``;
    const out = roundTrip(src);

    expect(out).toContain("> Quoted *prose*.");
    expect(out).toContain("- [x] Complete");
    expect(out).toContain("| Name | Value |");
    expect(out).toContain("$x^2$");
    expect(out).toContain("```typescript");
    expectStable(src);
  });

  it("preserves every JSX tab body through a rich-to-raw-to-rich cycle", () => {
    const src = `<Tabs client:load>

<Tab name="Tab 1">

### Did you come here for something in particular?

Did you come here for something in particular or just general Riker-bashing?

</Tab>

<Tab name="Tab 2">

### I wanna talk about the assassination attempt

Lorem ipsum dolor sit amet, consetetur sadipscing elitr.

Lorem ipsum dolor sit amet, consetetur sadipscing elitr.

</Tab>

<Tab name="Tab 3">

### We know you're dealing in stolen ore

Lorem ipsum dolor sit amet, consetetur sadipscing elitr.

Lorem ipsum dolor sit amet, consetetur sadipscing elitr.

</Tab>

</Tabs>`;
    const out = roundTrip(src);

    expect(out).toContain(
      "Did you come here for something in particular or just general Riker-bashing?",
    );
    expect(
      out.match(/Lorem ipsum dolor sit amet, consetetur sadipscing elitr\./g),
    ).toHaveLength(4);
    expectStable(src);
  });
});

describe("MDX comments", () => {
  it("keeps an inline comment between surrounding prose", () => {
    const src = `Talk about the assassination attempt on Lieutenant Worf. Could someone survive this? Second para with {/* inline note */} inside it.\n`;
    const out = roundTrip(src);

    expect(out).toContain(`{/* inline note */}`);
    expect(out).toContain("Second para with");
    expect(out).toContain("inside it.");
    expectStable(src);
  });

  it("keeps standalone, multiline, and repeated comments stable", () => {
    const src = `{/* standalone */}\n\nProse {/* one */} between {/* two */} comments.\n\n{/*\n  multiline note\n*/}\n`;
    const out = roundTrip(src);

    expect(out).toContain(`{/* standalone */}`);
    expect(out).toContain(`{/* one */}`);
    expect(out).toContain(`{/* two */}`);
    expect(out).toContain("  multiline note");
    expectStable(src);
  });
});

describe("editor mounting", () => {
  it("preserves mixed snippets through normalization on mount", () => {
    const src = `{{< notice "tip" >}}\nBody with <Badge dismissible /> and {/* note */}.\n{{< /notice >}}\n\n<Tabs>\n<Tab name="One">\nParagraph body.\n</Tab>\n</Tabs>`;
    const once = mountedRoundTrip(src);

    expect(once).toContain(`{{< notice "tip" >}}`);
    expect(once).toContain("<Badge dismissible/>");
    expect(once).toContain(`{/* note */}`);
    expect(once).toContain("Paragraph body.");
    expect(mountedRoundTrip(once)).toBe(once);
  });
});

describe("the reported document", () => {
  // Switching raw/rich used to add one <br /> per switch here.
  it("keeps notices and nested tabs stable", () => {
    expectStable(
      [
        `{{< notice "tip" >}}`,
        `This is a simple tip.`,
        `<br />`,
        `{{< /notice >}}`,
        ``,
        `{{< tabs >}}`,
        `{{< tab "Tab 1" >}}`,
        `#### Hey There, I am a tab`,
        `<br />`,
        `{{< /tab >}}`,
        ``,
        `{{< tab "Tab 2" >}}`,
        `#### Another tab`,
        ``,
        `Lorem ipsum dolor sit amet.`,
        `<br />`,
        `{{< /tab >}}`,
        `{{< /tabs >}}`,
      ].join("\n"),
    );
  });

  it("does not escape a br that follows a heading", () => {
    const out = roundTrip(
      `{{< tab "Tab 1" >}}\n#### Heading\n<br />\n{{< /tab >}}`,
    );
    expect(out).toContain("<br />");
    expect(out).not.toContain("\\<br />");
  });

  it("keeps an intentional hard break in a shortcode body", () => {
    // Plate represents a hard and a soft break identically in Slate, so the
    // two cannot be told apart on the way back out. Preserving the author's
    // hard break is the safer side of that trade: a soft break rendered as a
    // hard one is cosmetic, a lost line break is not.
    const out = roundTrip(
      `{{< notice >}}\nline one\\\nline two\n{{< /notice >}}`,
    );
    expect(out).toContain("line one\\\nline two");
    expect(brCount(out)).toBe(0);
  });

  it("does not invent a br for a body that has none", () => {
    const out = roundTrip(
      `{{< notice "info" >}}\nJust some text.\n{{< /notice >}}`,
    );
    expect(brCount(out)).toBe(0);
  });
});

describe("mixed content", () => {
  it("keeps shortcodes, jsx and html together stable", () => {
    expectStable(
      [
        `{{< notice "tip" >}}`,
        `A tip.`,
        `<br />`,
        `{{< /notice >}}`,
        ``,
        `<Badge />`,
        ``,
        `Plain text with <em>markup</em>.`,
      ].join("\n"),
    );
  });
});
