import { MarkdownPlugin } from "@platejs/markdown";
import { Value } from "platejs";
import { PlateEditor } from "platejs/react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Raw mode edits markdown while the hidden rich editor holds the
 * collaborative room. These keep the two in step a top-level block at a time,
 * so neither side rewrites blocks the other did not touch.
 */

type Block = Value[number];

const EMPTY_BODY: Value = [{ type: "p", children: [{ text: "" }] }];

const blockParser = unified().use(remarkParse).use(remarkGfm);

export const deserializeBody = (
  editor: PlateEditor,
  markdown: string,
): Value => {
  const nodes = editor
    .getApi(MarkdownPlugin)
    .markdown.deserialize(markdown, { withoutMdx: true });
  return nodes.length > 0 ? nodes : EMPTY_BODY;
};

export const serializeBody = (editor: PlateEditor, nodes: Value): string =>
  editor.getApi(MarkdownPlugin).markdown.serialize({
    value: nodes,
    preserveEmptyParagraphs: false,
  }) as string;

// Slate keeps untouched blocks as the same objects, so this stays warm.
const keyCache = new WeakMap<object, string>();

// Serialized form ignores node ids and Slate's normalization differences.
const blockKey = (editor: PlateEditor, node: Block): string => {
  const cached = keyCache.get(node);
  if (cached !== undefined) return cached;
  let key: string;
  try {
    key = serializeBody(editor, [node]);
  } catch {
    key = JSON.stringify(node);
  }
  keyCache.set(node, key);
  return key;
};

/** Per-block keys, without the empty paragraphs Plate keeps at the end. */
const blockKeys = (editor: PlateEditor, nodes: Value): string[] => {
  const keys = nodes.map((node) => blockKey(editor, node));
  while (keys.length > 0 && keys[keys.length - 1] === "") keys.pop();
  return keys;
};

export const editorBlockKeys = (editor: PlateEditor) =>
  blockKeys(editor, editor.children as Value);

const changedRange = (before: string[], after: string[]) => {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start++;
  }
  let tail = 0;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  return { start, oldEnd: before.length - tail, newEnd: after.length - tail };
};

type TextLeaf = { path: number[]; text: string };

// Structure, marks and props, without text or node ids. Keys are sorted:
// blocks coming back from Yjs list their props in a different order.
const shapeOf = (node: unknown): string => {
  if (Array.isArray(node)) return `[${node.map(shapeOf).join(",")}]`;
  if (node && typeof node === "object") {
    const entries = Object.entries(node)
      .filter(([key]) => key !== "text" && key !== "id")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, value]) => `${key}:${shapeOf(value)}`).join(",")}}`;
  }
  return JSON.stringify(node) ?? "undefined";
};

const textLeaves = (node: unknown, path: number[], out: TextLeaf[] = []) => {
  const element = node as { text?: unknown; children?: unknown[] };
  if (typeof element.text === "string") {
    out.push({ path, text: element.text });
  } else {
    element.children?.forEach((child, i) =>
      textLeaves(child, [...path, i], out),
    );
  }
  return out;
};

/**
 * Applies only the text changes when the block keeps its structure, so the
 * shared block is edited rather than replaced and collaborators' carets
 * anchored in it stay valid. Returns false when the structure differs.
 */
const editBlockInPlace = (
  editor: PlateEditor,
  index: number,
  next: Block,
): boolean => {
  const current = editor.children[index];
  if (shapeOf(current) !== shapeOf(next)) return false;
  const after = textLeaves(next, [index]);
  textLeaves(current, [index]).forEach((leaf, i) => {
    if (leaf.text === after[i].text) return;
    const { start, end, text } = minimalTextEdit(leaf.text, after[i].text);
    if (end > start) {
      editor.tf.delete({
        at: {
          anchor: { path: leaf.path, offset: start },
          focus: { path: leaf.path, offset: end },
        },
      });
    }
    if (text)
      editor.tf.insertText(text, { at: { path: leaf.path, offset: start } });
  });
  return true;
};

// Parsed block key → what the editor turns it into, for blocks Plate's
// normalization changes (e.g. it drops footnote references). Without this the
// same block would differ, and be replaced, on every raw keystroke.
const normalizedKeys = new WeakMap<PlateEditor, Map<string, string>>();

/** Brings the editor in line with `markdown`, replacing only blocks that differ. */
export function applyMarkdownToEditor(
  editor: PlateEditor,
  markdown: string,
): boolean {
  const next = deserializeBody(editor, markdown);
  const learned = normalizedKeys.get(editor) ?? new Map<string, string>();
  normalizedKeys.set(editor, learned);
  const parsedKeys = blockKeys(editor, next);
  const { start, oldEnd, newEnd } = changedRange(
    editorBlockKeys(editor),
    parsedKeys.map((key) => learned.get(key) ?? key),
  );
  if (start === oldEnd && start === newEnd) return false;

  editor.tf.withoutNormalizing(() => {
    if (oldEnd - start === newEnd - start) {
      for (let i = start; i < oldEnd; i++) {
        if (!editBlockInPlace(editor, i, next[i])) {
          editor.tf.removeNodes({ at: [i] });
          editor.tf.insertNodes(next[i], { at: [i] });
        }
      }
      return;
    }
    for (let i = oldEnd - 1; i >= start; i--) {
      editor.tf.removeNodes({ at: [i] });
    }
    next.slice(start, newEnd).forEach((node, i) => {
      editor.tf.insertNodes(node, { at: [start + i] });
    });
  });

  const applied = editorBlockKeys(editor);
  if (applied.length === parsedKeys.length) {
    for (let i = start; i < newEnd; i++) {
      if (applied[i] !== parsedKeys[i]) learned.set(parsedKeys[i], applied[i]);
    }
  }
  return true;
}

type Chunk = { start: number; end: number; nodes: number };

// Markdown keeps no empty paragraphs, so only these blocks map to source.
const significant = (keys: string[]) =>
  keys.flatMap((key, index) => (key === "" ? [] : [index]));

/** Top-level source blocks of `markdown` and how many editor blocks each makes. */
const splitChunks = (editor: PlateEditor, markdown: string): Chunk[] =>
  blockParser.parse(markdown).children.map((block) => {
    const start = block.position?.start.offset;
    const end = block.position?.end.offset;
    if (start === undefined || end === undefined) throw new Error("no offsets");
    const nodes = editor
      .getApi(MarkdownPlugin)
      .markdown.deserialize(markdown.slice(start, end), { withoutMdx: true });
    return { start, end, nodes: significant(blockKeys(editor, nodes)).length };
  });

/**
 * Applies the editor's change since `previousKeys` (its block keys when it
 * last matched `markdown`) to `markdown`, rewriting only the source blocks
 * that changed and keeping the author's formatting everywhere else.
 */
export function patchMarkdownFromEditor(
  editor: PlateEditor,
  markdown: string,
  previousKeys: string[],
): string {
  const children = editor.children as Value;
  const nextKeys = editorBlockKeys(editor);
  const before = significant(previousKeys).map((i) => previousKeys[i]);
  const afterIndex = significant(nextKeys);
  const after = afterIndex.map((i) => nextKeys[i]);
  const { start, oldEnd, newEnd } = changedRange(before, after);
  if (start === oldEnd && start === newEnd) return markdown;

  const everything = () =>
    serializeBody(editor, children.slice(0, nextKeys.length));
  // Editor blocks for significant positions [from, to), empty ones between included.
  const editorBlocks = (from: number, to: number): Value =>
    to > from ? children.slice(afterIndex[from], afterIndex[to - 1] + 1) : [];
  const blockText = (from: number, to: number) =>
    serializeBody(editor, editorBlocks(from, to)).replace(/\n+$/, "");

  let chunks: Chunk[];
  try {
    chunks = splitChunks(editor, markdown);
  } catch {
    return everything();
  }
  const chunkOf = chunks.flatMap((chunk, i) => Array(chunk.nodes).fill(i));
  if (chunks.length === 0 || chunkOf.length !== before.length) {
    return everything();
  }
  const firstNodeOf = (chunk: number) => chunkOf.indexOf(chunk);
  const shift = newEnd - oldEnd;

  // Pure insertion on a chunk boundary: splice new blocks in between.
  const insertAt = start < chunkOf.length ? chunkOf[start] : chunks.length;
  if (
    start === oldEnd &&
    (insertAt === chunks.length || firstNodeOf(insertAt) === start)
  ) {
    const text = blockText(start, newEnd);
    if (insertAt === chunks.length) {
      const end = chunks[chunks.length - 1].end;
      return `${markdown.slice(0, end)}\n\n${text}${markdown.slice(end)}`;
    }
    const at = chunks[insertAt].start;
    return `${markdown.slice(0, at)}${text}\n\n${markdown.slice(at)}`;
  }

  // Otherwise replace every chunk the change touches, whole.
  const first = chunkOf[Math.min(start, chunkOf.length - 1)];
  const last = oldEnd > start ? chunkOf[oldEnd - 1] : first;
  const fromNode = firstNodeOf(first);
  const toNode = firstNodeOf(last) + chunks[last].nodes + shift;

  let from = chunks[first].start;
  let to = chunks[last].end;
  if (toNode <= fromNode) {
    // Take the blank lines that separated the removed blocks with them.
    if (last + 1 < chunks.length) to = chunks[last + 1].start;
    else if (first > 0) from = chunks[first - 1].end;
  }
  const text = toNode > fromNode ? blockText(fromNode, toNode) : "";
  return `${markdown.slice(0, from)}${text}${markdown.slice(to)}`;
}

const CARET = "\uE000";

/**
 * The editor point for a caret at `offset` in `markdown` (which the editor
 * matches), so collaborators see where a raw-mode author is typing.
 */
export function editorPointAtMarkdownOffset(
  editor: PlateEditor,
  markdown: string,
  offset: number,
): { path: number[]; offset: number } | null {
  let chunks: Chunk[];
  try {
    chunks = splitChunks(editor, markdown);
  } catch {
    return null;
  }
  const blocks = significant(editorBlockKeys(editor));
  const total = chunks.reduce((sum, chunk) => sum + chunk.nodes, 0);
  if (chunks.length === 0 || total !== blocks.length) return null;

  let index = chunks.findIndex((chunk) => offset <= chunk.end);
  if (index === -1) index = chunks.length - 1;
  const chunk = chunks[index];
  if (chunk.nodes === 0) return null;
  const first = chunks.slice(0, index).reduce((sum, c) => sum + c.nodes, 0);

  const source = markdown.slice(chunk.start, chunk.end);
  const local = Math.min(Math.max(offset - chunk.start, 0), source.length);
  const parsed = editor
    .getApi(MarkdownPlugin)
    .markdown.deserialize(
      source.slice(0, local) + CARET + source.slice(local),
      { withoutMdx: true },
    );

  const marked = parsed
    .flatMap((node, i) => textLeaves(node, [i]))
    .find((leaf) => leaf.text.includes(CARET));
  if (marked) {
    const block = blocks[first + Math.min(marked.path[0], chunk.nodes - 1)];
    const path = [block, ...marked.path.slice(1)];
    const entry = editor.api.node(path);
    const text = (entry?.[0] as { text?: unknown } | undefined)?.text;
    if (typeof text === "string") {
      return {
        path,
        offset: Math.min(marked.text.indexOf(CARET), text.length),
      };
    }
  }
  // The caret sits inside markup the parser rejects; fall back to the block.
  return editor.api.end([blocks[first]]) ?? null;
}

type TextChange = { start: number; end: number; text: string };

/** The single edit that turns `before` into `after`. */
export const minimalTextEdit = (before: string, after: string): TextChange => {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let tail = 0;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  return {
    start,
    end: before.length - tail,
    text: after.slice(start, after.length - tail),
  };
};

/**
 * Three-way merge of an incoming text (`theirs`) into a local copy (`ours`)
 * that both started from `base`. Overlapping edits keep the local one, which
 * is about to be sent and will win in the room anyway.
 */
export function mergeText(base: string, ours: string, theirs: string): string {
  if (ours === base || ours === theirs) return theirs;
  if (theirs === base) return ours;
  const mine = minimalTextEdit(base, ours);
  const other = minimalTextEdit(base, theirs);
  // Two insertions at the same point have no order to preserve.
  const precedes = (a: TextChange, b: TextChange) =>
    a.end < b.start ||
    (a.end === b.start && !(a.start === a.end && b.start === b.end));
  if (precedes(other, mine)) {
    return (
      base.slice(0, other.start) +
      other.text +
      base.slice(other.end, mine.start) +
      mine.text +
      base.slice(mine.end)
    );
  }
  if (precedes(mine, other)) {
    return (
      base.slice(0, mine.start) +
      mine.text +
      base.slice(mine.end, other.start) +
      other.text +
      base.slice(other.end)
    );
  }
  return ours;
}
