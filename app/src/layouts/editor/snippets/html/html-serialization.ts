import { KEY_HTML_BLOCK, KEY_HTML_INLINE } from "./html-plugin";

/**
 * Deserializes HTML mdast nodes to Slate nodes
 * Determines if HTML should be inline or block based on mdast context
 */
export const deserializeHtml = (mdastNode: any) => {
  const value = mdastNode.value || "";
  const data = (mdastNode.data || {}) as { isInlineHtml?: boolean };
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
    serialize: serializeHtml,
  },
};
