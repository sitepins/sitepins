import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor } from "platejs";
import { describe, expect, it } from "vitest";
import { BaseEditorKit } from "../plugins/editor-base-kit";
import { ShortcodeInlineKit, ShortcodeKit } from "./common/snippet-plugin";
import { HtmlBlockKit, HtmlInlineKit } from "./html/html-plugin";
import { JsxBlockKit, JsxInlineKit } from "./jsx/jsx-plugin";
import {
  MdxCommentInlineKit,
  MdxCommentKit,
} from "./mdx-comment/mdx-comment-plugin";

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
 * Deserializing and re-serializing in one breath skips Slate entirely, and
 * Slate is what the editor actually holds the document in. It drops an inline
 * element that lands at the root, so a comment can survive this round trip and
 * still vanish the moment the rich editor opens — the value has to go through
 * `setValue` for the test to mean anything.
 */
function roundTrip(markdown: string): string {
  const editor = createSlateEditor({ plugins: Kit, value: [] });
  const api = editor.getApi(MarkdownPlugin);

  editor.tf.setValue(api.markdown.deserialize(markdown));

  return api.markdown.serialize({ value: editor.children });
}

// An escaped comment is not a comment: MDX renders the backslashed form as
// visible text, so a save that escapes one leaks an internal note onto the page.
describe("mdx comments survive a round trip", () => {
  it("keeps a standalone comment byte-intact", () => {
    const source = `{/* INTERNAL NOTE: must survive byte-intact. */}\n\nSome prose with *asterisk emphasis* and a [link](/somewhere).\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps an inline comment byte-intact", () => {
    const source = `Text with {/* a note */} inline here.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("preserves indentation inside a multi-line comment", () => {
    const source = `{/*\n  indented note\n    deeper still\n*/}\n\nProse after.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("does not treat markdown inside a comment as markdown", () => {
    const source = `{/* note with *emphasis* and _underscores_ and a | pipe */}\n\nProse.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps braces inside a comment", () => {
    const source = `{/* note with {curly} inside */}\n\nProse.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps two comments apart instead of pairing them into a block", () => {
    // `{/* /notice */}` reads as a closing tag to delimiter-based matching,
    // which would swallow the prose between the two into one node.
    const source = `{/* notice */}\n\nMiddle prose.\n\n{/* /notice */}\n\nTail prose.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("leaves a comment next to a hugo shortcode alone", () => {
    const source = `{{< notice "tip" >}}\nBody.\n{{< /notice >}}\n\n{/* note */}\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps an empty comment", () => {
    const source = `{/**/}\n\nProse.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("is idempotent across repeated saves", () => {
    const source = `{/* one */}\n\nProse with {/* two */} inline.\n\n{/* three */}\n`;
    const once = roundTrip(source);

    expect(roundTrip(once)).toBe(once);
  });

  it("keeps two comments in one paragraph from multiplying", () => {
    // The asterisk closing the first and the one opening the second pair into
    // an emphasis spanning the prose between them. Anything that walks that
    // tree reaches each comment by more than one path, and the copies compound
    // on every save — 2, 4, 10, 28 — until the file is only comments.
    const source = `word {/* A */} mid {/* B */} tail.\n`;
    let current = source;

    for (let i = 0; i < 5; i++) current = roundTrip(current);

    expect(current).toBe(source);
  });

  it("does not invent emphasis between two comments", () => {
    const source = `word {/* A */} mid {/* B */} tail.\n`;

    expect(roundTrip(source)).not.toContain("*mid*");
  });

  it("keeps the spaces on either side of a comment", () => {
    const source = `one {/* A */} two {/* B */} three.\n`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps the line break that follows a comment", () => {
    // Dropping it would run the two lines together into one word. The editor
    // rewrites any soft break as a hard one, so the baseline is what a line
    // break without a comment on it becomes.
    const baseline = roundTrip(`word one\nnext word here.\n`);

    expect(roundTrip(`word {/* note */}\nnext word here.\n`)).toBe(
      baseline.replace("word one", "word {/* note */}"),
    );
  });

  it("does not capture an unterminated comment opener", () => {
    // Not a comment, so it keeps whatever treatment markdown already gave it.
    const source = `{/* never closed\n\nProse.\n`;

    expect(roundTrip(source)).not.toContain("mdx_comment");
  });

  it("leaves comment syntax inside a fenced code block untouched", () => {
    const source = `\`\`\`jsx\n{/* not a real comment, just sample code */}\n\`\`\`\n`;

    expect(roundTrip(source)).toBe(source);
  });
});
