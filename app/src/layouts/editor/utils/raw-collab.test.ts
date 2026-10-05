import { EditorKit } from "@/editor/plugins/editor-kit";
import { createPlateEditor, PlateEditor } from "platejs/react";
import { describe, expect, it } from "vitest";
import {
  applyMarkdownToEditor,
  deserializeBody,
  editorBlockKeys,
  editorPointAtMarkdownOffset,
  mergeText,
  patchMarkdownFromEditor,
} from "./raw-collab";

const DOC = `# Title

Intro with **bold**, *em*, \`code\` and a [link](https://example.com).

- one
- two
  - nested

1. first
2. second

> quoted

\`\`\`js
const a = 1;

const b = 2;
\`\`\`

| a | b |
| - | - |
| 1 | 2 |

![alt](/images/a.png)

---

Closing paragraph.`;

const editorWith = (markdown: string) => {
  const editor = createPlateEditor({ plugins: EditorKit }) as PlateEditor;
  editor.tf.setValue(deserializeBody(editor, markdown));
  return editor;
};

const blockIndexContaining = (editor: PlateEditor, text: string) =>
  editor.children.findIndex((node) =>
    editor.api.string(node as never).includes(text),
  );

describe("applyMarkdownToEditor", () => {
  it("is a no-op when the editor already matches", () => {
    const editor = editorWith(DOC);
    expect(applyMarkdownToEditor(editor, DOC)).toBe(false);
  });

  it("replaces only the block that changed", () => {
    const editor = editorWith(DOC);
    const before = [...editor.children];
    const target = blockIndexContaining(editor, "Closing paragraph");

    const changed = applyMarkdownToEditor(
      editor,
      DOC.replace("Closing paragraph.", "Closing paragraph, edited raw."),
    );

    expect(changed).toBe(true);
    expect(editor.api.string(editor.children[target] as never)).toBe(
      "Closing paragraph, edited raw.",
    );
    editor.children.forEach((node, i) => {
      if (i !== target) expect(node).toBe(before[i]);
    });
  });

  it("handles inserted and removed blocks", () => {
    const editor = editorWith(DOC);
    applyMarkdownToEditor(editor, DOC.replace("> quoted\n\n", ""));
    expect(blockIndexContaining(editor, "quoted")).toBe(-1);

    applyMarkdownToEditor(editor, `${DOC}\n\nAppended block.`);
    expect(applyMarkdownToEditor(editor, `${DOC}\n\nAppended block.`)).toBe(
      false,
    );
    expect(blockIndexContaining(editor, "quoted")).toBeGreaterThan(-1);
    expect(blockIndexContaining(editor, "Appended block.")).toBeGreaterThan(-1);
  });
});

describe("applyMarkdownToEditor edits text in place", () => {
  const recordOps = (editor: PlateEditor) => {
    type Applier = { apply: (op: { type: string }) => void };
    const target = editor as unknown as Applier;
    const ops: string[] = [];
    const apply = target.apply.bind(editor);
    target.apply = (op) => {
      if (op.type !== "set_selection") ops.push(op.type);
      apply(op);
    };
    return ops;
  };

  it("uses text operations when only the text of a block changed", () => {
    const editor = editorWith(DOC);
    const ops = recordOps(editor);

    applyMarkdownToEditor(
      editor,
      DOC.replace("Closing paragraph.", "Closing paragraph, typed in raw."),
    );

    expect(ops.length).toBeGreaterThan(0);
    expect(
      ops.every((op) => op === "insert_text" || op === "remove_text"),
    ).toBe(true);
  });

  it("replaces the block when its structure changes", () => {
    const editor = editorWith(DOC);
    const ops = recordOps(editor);

    applyMarkdownToEditor(
      editor,
      DOC.replace("Closing paragraph.", "Closing **paragraph**."),
    );

    expect(ops).toContain("remove_node");
    expect(ops).toContain("insert_node");
  });
});

describe("editorPointAtMarkdownOffset", () => {
  const RAW = "# Title\n\nSome **bold** text.\n\n- one\n- two\n\nLast.";
  const at = (needle: string, delta = 0) => RAW.indexOf(needle) + delta;

  it.each([
    ["heading", at("Title", 2), [0, 0], 2],
    ["paragraph start", at("Some"), [1, 0], 0],
    ["inside bold", at("bold", 2), [1, 1], 2],
    ["after bold", at(" text"), [1, 2], 0],
    ["second list item", at("two", 1), [3, 0], 1],
    ["last paragraph end", RAW.length, [4, 0], 5],
  ])("maps a caret in the %s", (_name, offset, path, pointOffset) => {
    const editor = editorWith(RAW);
    expect(editorPointAtMarkdownOffset(editor, RAW, offset)).toEqual({
      path,
      offset: pointOffset,
    });
  });

  it("lands on a nearby block for a caret between blocks", () => {
    const editor = editorWith(RAW);
    const point = editorPointAtMarkdownOffset(editor, RAW, at("Some") - 1);
    expect(point?.path[0]).toBe(1);
  });
});

describe("patchMarkdownFromEditor", () => {
  // Formatting the serializer would rewrite, plus a half-typed bold.
  const RAW = `# Title

Some __strong__ text and * a star.

* starred bullet
* another

Typing **unfinish

Last paragraph.`;

  /** An editor in sync with `markdown`, and its keys at that point. */
  const synced = (markdown: string) => {
    const editor = editorWith(markdown);
    return { editor, keys: editorBlockKeys(editor) };
  };

  it("leaves the markdown alone when nothing changed", () => {
    const { editor, keys } = synced(RAW);
    expect(patchMarkdownFromEditor(editor, RAW, keys)).toBe(RAW);
  });

  it("rewrites only the block a collaborator edited", () => {
    const { editor, keys } = synced(RAW);
    const target = blockIndexContaining(editor, "Last paragraph");
    editor.tf.insertText(" Edited remotely.", {
      at: editor.api.end([target])!,
    });

    expect(patchMarkdownFromEditor(editor, RAW, keys)).toBe(
      RAW.replace("Last paragraph.", "Last paragraph. Edited remotely."),
    );
  });

  it("splices in a block a collaborator inserted", () => {
    const { editor, keys } = synced(RAW);
    const at = blockIndexContaining(editor, "Typing");
    editor.tf.insertNodes(
      { type: "p", children: [{ text: "Inserted remotely." }] },
      { at: [at] },
    );

    expect(patchMarkdownFromEditor(editor, RAW, keys)).toBe(
      RAW.replace(
        "Typing **unfinish",
        "Inserted remotely.\n\nTyping **unfinish",
      ),
    );
  });

  it("drops a block a collaborator removed, with its blank line", () => {
    const { editor, keys } = synced(RAW);
    editor.tf.removeNodes({ at: [blockIndexContaining(editor, "Last")] });

    expect(patchMarkdownFromEditor(editor, RAW, keys)).toBe(
      RAW.replace("\n\nLast paragraph.", ""),
    );
  });

  it("re-serializes a list as a whole when one item changes", () => {
    const { editor, keys } = synced(RAW);
    const item = blockIndexContaining(editor, "another");
    editor.tf.insertText(" item", { at: editor.api.end([item])! });

    const patched = patchMarkdownFromEditor(editor, RAW, keys);

    expect(patched).toContain("Some __strong__ text and * a star.");
    expect(patched).toContain("Typing **unfinish");
    expect(patched).toMatch(/- starred bullet\n- another item/);
  });

  it("keeps syntax the rich editor cannot represent when other blocks change", () => {
    const raw =
      "See [docs][1] and a note[^1].\n\nMiddle.\n\n[1]: https://example.com\n\n[^1]: The note.";
    const { editor, keys } = synced(raw);
    editor.tf.insertText(" Edited.", {
      at: editor.api.end([blockIndexContaining(editor, "Middle")])!,
    });

    expect(patchMarkdownFromEditor(editor, raw, keys)).toBe(
      raw.replace("Middle.", "Middle. Edited."),
    );
  });
});

it("ignores empty paragraphs a collaborator adds or removes", () => {
  const raw = "One.\n\nTwo.";
  const editor = editorWith(raw);
  const keys = editorBlockKeys(editor);
  editor.tf.insertNodes({ type: "p", children: [{ text: "" }] }, { at: [1] });
  expect(patchMarkdownFromEditor(editor, raw, keys)).toBe(raw);

  const withEmpty = editorBlockKeys(editor);
  editor.tf.insertText(" Edited.", { at: editor.api.end([2])! });
  expect(patchMarkdownFromEditor(editor, raw, withEmpty)).toBe(
    "One.\n\nTwo. Edited.",
  );
});

describe("mergeText", () => {
  const base = "alpha\nbeta\ngamma";

  it("applies a remote edit when there is nothing local", () => {
    expect(mergeText(base, base, "alpha\nBETA\ngamma")).toBe(
      "alpha\nBETA\ngamma",
    );
  });

  it("keeps unsent local typing alongside a remote edit elsewhere", () => {
    expect(
      mergeText(base, "alpha typed\nbeta\ngamma", "alpha\nbeta\ngamma!"),
    ).toBe("alpha typed\nbeta\ngamma!");
    expect(
      mergeText(base, "alpha\nbeta\ngamma typed", "ALPHA\nbeta\ngamma"),
    ).toBe("ALPHA\nbeta\ngamma typed");
  });

  it("keeps the local edit when both touched the same spot", () => {
    expect(
      mergeText(base, "alpha\nbeta mine\ngamma", "alpha\nbeta theirs\ngamma"),
    ).toBe("alpha\nbeta mine\ngamma");
  });
});

const SAMPLES: Record<string, string> = {
  html: `<div class="note">\n  <p>Hello</p>\n</div>\n\nAfter.`,
  inlineHtml: `Text with <span style="color:red">red</span> word.`,
  hugo: `{{< youtube id="abc" >}}\n\nAfter shortcode.`,
  hugoPaired: `{{< notice "tip" >}}\nInner text\n{{< /notice >}}\n\nAfter.`,
  jsx: `<Callout type="info">\n  Inside callout\n</Callout>\n\nAfter jsx.`,
  jsxSelfClosing: `<Youtube id="abc" />\n\nAfter.`,
  math: `$$\nE = mc^2\n$$\n\nAfter math.`,
  breaks: `Line one  \nLine two\n\nNext.`,
  taskList: `- [ ] todo\n- [x] done`,
  footnote: `Text[^1].\n\n[^1]: The note.`,
  refLink: `See [docs][1].\n\n[1]: https://example.com`,
  emptyParagraphs: `First\n\n\n\nSecond`,
  mdxComment: `{/* hidden */}\n\nVisible.`,
};

describe("syntax the editor round-trips", () => {
  it.each(Object.entries(SAMPLES))("leaves %s untouched", (_name, md) => {
    // Applied from scratch, as raw typing would, so normalization is learned.
    const editor = editorWith("");
    applyMarkdownToEditor(editor, md);
    const keys = editorBlockKeys(editor);
    const reapplied = applyMarkdownToEditor(editor, md);
    const patched = patchMarkdownFromEditor(editor, md, keys);
    expect(reapplied).toBe(false);
    expect(patched).toBe(md);
  });
});
