import { MdxSnippet } from "@/editor/utils/plate-types";
import { MarkdownPlugin } from "@platejs/markdown";
import type { PlateEditor } from "platejs/react";
import { KEY_JSX_BLOCK } from "../jsx/jsx-plugin";
import { KEY_SHORTCODE } from "./snippet-plugin";

export const insertSnippet = (editor: PlateEditor, snippet: MdxSnippet) => {
  if (!snippet.code) return;

  const nodes = editor
    .getApi(MarkdownPlugin)
    .markdown.deserialize(snippet.code);

  const firstNode = nodes[0] as any;
  const isSingleBlock = nodes.length === 1 && firstNode;
  const isParagraph = isSingleBlock && firstNode.type === "p";
  const _isBlockShortcode = isSingleBlock && firstNode.type === KEY_SHORTCODE;
  const _isBlockJsx = isSingleBlock && firstNode.type === KEY_JSX_BLOCK;

  // If the snippet is a single paragraph, insert its children to keep it inline
  if (isParagraph) {
    editor.tf.insertNodes(firstNode.children, { select: true });
  } else {
    // For block components (like Accordion or Tab), we ALWAYS insert them as blocks.
    // Plate's insertNodes will automatically split the paragraph or replace it if empty.
    editor.tf.insertNodes(nodes, { select: true });
  }
};
