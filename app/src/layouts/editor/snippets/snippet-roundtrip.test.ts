import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor } from "platejs";
import { describe, expect, it } from "vitest";
import { BaseEditorKit } from "../plugins/editor-base-kit";
import { ShortcodeInlineKit, ShortcodeKit } from "./common/snippet-plugin";
import { HtmlBlockKit, HtmlInlineKit } from "./html/html-plugin";
import { JsxBlockKit, JsxInlineKit } from "./jsx/jsx-plugin";

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
  return api.markdown.serialize({ value: api.markdown.deserialize(markdown) });
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
