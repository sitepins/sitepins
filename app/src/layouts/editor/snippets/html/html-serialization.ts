import type { MdHtml } from "@platejs/markdown";
import type {
  Handle,
  Options as ToMarkdownOptions,
} from "mdast-util-to-markdown";
import { KEY_HTML_BLOCK, KEY_HTML_INLINE } from "../snippet-keys";

// @platejs/markdown rewrites `class=`/`for=` to `className=`/`htmlFor=` across
// the whole document before parsing (so raw HTML can double as JSX). Plain
// HTML nodes bypass Plate's own JSX serializer, which is what normally
// reverses that rename, so undo it here to keep the source attribute names.
const revertJsxAttrRenames = (html: string) =>
  html
    .replace(/(\s)className=/g, "$1class=")
    .replace(/(\s)htmlFor=/g, "$1for=");

/**
 * Deserializes HTML mdast nodes to Slate nodes
 * Determines if HTML should be inline or block based on mdast context
 */
export const deserializeHtml = (mdastNode: MdHtml) => {
  const value = revertJsxAttrRenames(mdastNode.value || "");
  const data = mdastNode.data ?? {};
  const isInline = Boolean(data.isInlineHtml);
  const children = value ? [{ text: value }] : [{ text: "" }];

  // Check for sup/sub tags
  const supMatch = value.match(/^<sup>([\s\S]*)<\/sup>$/i);
  const subMatch = value.match(/^<sub>([\s\S]*)<\/sub>$/i);

  if (supMatch || subMatch) {
    return {
      text: supMatch ? supMatch[1] : subMatch![1],
      [supMatch ? "superscript" : "subscript"]: true,
    };
  }

  return {
    type: isInline ? KEY_HTML_INLINE : KEY_HTML_BLOCK,
    value,
    children,
  };
};

/**
 * Serializes HTML Slate nodes back to mdast
 * Extracts text content from children
 */
export const serializeHtml = (slateNode: {
  children?: { text?: string }[];
  value?: string;
}) => {
  const textContent = (slateNode.children || [])
    .map((child) => child.text || "")
    .join("");

  return {
    type: "html",
    value: textContent || slateNode.value || "",
  };
};

const PARAGRAPH_INTERRUPTING_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";

// CommonMark HTML block types 1-6; only these can start a block mid-paragraph.
const PARAGRAPH_INTERRUPTING_HTML = new RegExp(
  `^(?:<(?:script|pre|style|textarea)(?:\\s|>|$)|<!--|<\\?|<![A-Za-z]|<!\\[CDATA\\[|</?(?:${PARAGRAPH_INTERRUPTING_TAGS})(?:\\s|/?>|$))`,
  "i",
);

const MD_INLINE_HTML = "sitepinsInlineHtml";

// to-markdown swaps the eol before any `html` node for a space (a stray `\` after a hard break).
const serializeInlineHtml = (slateNode: {
  children?: { text?: string }[];
  value?: string;
}) => {
  const node = serializeHtml(slateNode);

  return PARAGRAPH_INTERRUPTING_HTML.test(node.value)
    ? node
    : { ...node, type: MD_INLINE_HTML };
};

const handleInlineHtml: Handle = Object.assign(
  (node: { value?: string }) => node.value || "",
  { peek: () => "<" },
);

// Cast because `Handlers` only lists the standard mdast node types.
export const inlineHtmlStringifyHandlers = {
  [MD_INLINE_HTML]: handleInlineHtml,
} as ToMarkdownOptions["handlers"];

/**
 * Markdown serialization rules for HTML snippet types
 */
export const htmlSerializationRules = {
  html: {
    deserialize: deserializeHtml,
  },
  [KEY_HTML_BLOCK]: {
    serialize: serializeHtml,
  },
  [KEY_HTML_INLINE]: {
    serialize: serializeInlineHtml,
  },
};
