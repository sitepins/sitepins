import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor } from "platejs";
import { describe, expect, it } from "vitest";
import { BaseEditorKit } from "../plugins/editor-base-kit";
import { ShortcodeInlineKit, ShortcodeKit } from "./common/snippet-plugin";
import { HtmlBlockKit, HtmlInlineKit } from "./html/html-plugin";
import { JsxBlockKit, JsxInlineKit } from "./jsx/jsx-plugin";

// Same kit construction as snippet-roundtrip.test.ts — MarkdownKit (with
// stringify fidelity options) lives in BaseEditorKit.
const Kit = [
  ...BaseEditorKit,
  ShortcodeKit,
  ShortcodeInlineKit,
  HtmlBlockKit,
  HtmlInlineKit,
  JsxBlockKit,
  JsxInlineKit,
];

const fixture = `Some prose with _asterisk emphasis_ and a [link](/somewhere).

- Dash bullet one
- Dash bullet two

| Type    | Amount                                  |
| ------- | --------------------------------------- |
| Primary | A maximum of $75,000.00<br/>plus extras |
`;

function roundTripBody(body: string): string {
  const editor = createSlateEditor({ plugins: Kit, value: [] });
  const api = editor.getApi(MarkdownPlugin);
  return api.markdown.serialize({
    value: api.markdown.deserialize(body),
  });
}

describe("markdown stringify fidelity", () => {
  it("preserves asterisk emphasis, dash bullets, unpadded tables, and bare $", () => {
    const out = roundTripBody(fixture);

    expect(out).toContain("*asterisk emphasis*");
    expect(out).not.toContain("_asterisk emphasis_");

    expect(out).toContain("- Dash bullet one");
    expect(out).toContain("- Dash bullet two");
    expect(out).not.toMatch(/^\* Dash bullet/m);

    // Header cells keep single-space padding; columns are not realigned.
    expect(out).toContain("| Type | Amount |");
    expect(out).toContain("| Primary |");
    expect(out).not.toMatch(/\| Type\s{2,}\|/);
    expect(out).not.toMatch(/\| -{4,}/);

    expect(out).toContain("$75,000.00");
    expect(out).not.toContain("\\$75,000.00");
  });

  it("keeps a one-word body edit from rewriting emphasis, tables, or $", () => {
    const editor = createSlateEditor({ plugins: Kit, value: [] });
    const api = editor.getApi(MarkdownPlugin);
    const value = api.markdown.deserialize(fixture);

    // Simulate a one-word edit in the first paragraph ("prose" → "PROSE").
    const firstParagraph = value[0] as {
      children?: Array<{ text?: string }>;
    };
    for (const child of firstParagraph.children ?? []) {
      if (typeof child.text === "string" && child.text.includes("prose")) {
        child.text = child.text.replace("prose", "PROSE");
        break;
      }
    }

    const out = api.markdown.serialize({ value });

    expect(out).toContain("Some PROSE with *asterisk emphasis*");
    expect(out).toContain("- Dash bullet one");
    expect(out).toContain("| Type | Amount |");
    expect(out).toContain("| Primary |");
    expect(out).not.toMatch(/\| Type\s{2,}\|/);
    expect(out).toContain("$75,000.00");
    expect(out).not.toContain("\\$");
    expect(out).not.toContain("_asterisk emphasis_");
  });
});
