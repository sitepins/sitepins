import type {
  DeserializeMdOptions,
  MdDecoration,
  MdRootContent,
  SerializeMdOptions,
} from "@platejs/markdown";
import {
  convertNodesDeserialize,
  convertNodesSerialize,
} from "@platejs/markdown";
import type { Descendant, TElement, TText } from "platejs";
import { KEY_SHORTCODE, KEY_SHORTCODE_INLINE } from "../snippet-keys";
import type { ShortcodeMeta } from "../snippet-mdast";
import {
  deserializeJsxFromShortcode,
  isJsxComponent,
  type JsxSlateElement,
} from "../jsx/jsx-serialization";

/** The Slate element the shortcode plugins render. */
export interface ShortcodeSlateElement extends TElement {
  type: typeof KEY_SHORTCODE | typeof KEY_SHORTCODE_INLINE;
  opening: string;
  closing: string;
  isBlock: boolean;
}

/** The mdast `shortcode` node as it reaches the deserializer. */
type ShortcodeMdastNode = {
  content?: string;
  data?: { shortcode?: ShortcodeMeta };
  children?: MdRootContent[];
};

/**
 * Drops the newline that separates a block body from its closing tag.
 *
 * It is structure, not content. Left in the last text node, Plate's paragraph
 * rule sees a trailing line break and rewrites it into a literal `<br />`, so
 * every raw/rich switch grows another one.
 */
const trimBodyTrailingNewline = (children: Descendant[]): Descendant[] => {
  const last = children.at(-1);
  if (!last) return children;

  if ("text" in last && typeof last.text === "string") {
    const text = last.text.replace(/\n+$/, "");
    if (text === last.text) return children;
    return [...children.slice(0, -1), { ...last, text }];
  }

  const nested = (last as TElement).children;
  if (!Array.isArray(nested)) return children;

  return [
    ...children.slice(0, -1),
    { ...last, children: trimBodyTrailingNewline(nested as Descendant[]) },
  ];
};

/**
 * Deserializes Hugo shortcode mdast nodes to Slate nodes
 *
 * NOTE: This also handles JSX component detection because when JSX is serialized
 * back to mdast (via jsx-serialization.ts), it creates a "shortcode" type node
 * with isJsxComponent: true flag. So we need to check this flag and route to JSX types.
 */
export const deserializeShortcode = (
  mdastNode: ShortcodeMdastNode,
  deco: MdDecoration,
  options: DeserializeMdOptions,
): ShortcodeSlateElement | JsxSlateElement => {
  // Check if this is a JSX component that was previously serialized
  // (JSX serialization creates "shortcode" type nodes with isJsxComponent flag)
  if (isJsxComponent(mdastNode)) {
    return deserializeJsxFromShortcode(mdastNode, deco, options);
  }

  // Handle regular Hugo shortcodes
  const shortcodeMeta: Partial<ShortcodeMeta> = mdastNode.data?.shortcode ?? {};

  const opening =
    shortcodeMeta.startContent ||
    shortcodeMeta.start ||
    mdastNode.content ||
    "";
  const closing = shortcodeMeta.closingContent || "";
  const isBlock = Boolean(shortcodeMeta.isBlock || closing);

  // Deserialize children for block shortcodes
  const children = isBlock
    ? mdastNode.children && mdastNode.children.length > 0
      ? trimBodyTrailingNewline(
          convertNodesDeserialize(mdastNode.children, deco, options),
        )
      : [{ text: "" }]
    : [{ text: mdastNode.content || "" }];

  return {
    type: isBlock ? KEY_SHORTCODE : KEY_SHORTCODE_INLINE,
    opening,
    closing,
    isBlock,
    children,
  };
};

const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * Plate marks an empty paragraph text node with a zero-width space so the
 * paragraph survives a round trip. Left inside a shortcode body it re-parses
 * as a text node that absorbs the newline before the closing tag; Plate then
 * rewrites that trailing line break into a literal `<br />`, so every raw/rich
 * switch adds another one.
 */
const stripZeroWidth = (nodes: MdRootContent[]): MdRootContent[] => {
  const out: MdRootContent[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const value = node.value.replace(ZERO_WIDTH_REGEX, "");
      // Drop nodes that held nothing but the marker.
      if (!value && node.value) continue;
      out.push({ ...node, value });
      continue;
    }

    const children = (node as { children?: MdRootContent[] }).children;
    if (!Array.isArray(children)) {
      out.push(node);
      continue;
    }
    // The rebuilt node keeps its own type; only the children were filtered.
    out.push({ ...node, children: stripZeroWidth(children) } as MdRootContent);
  }

  return out;
};

/**
 * Serializes Hugo shortcode Slate nodes back to mdast
 */
export const serializeShortcode = (
  slateNode: ShortcodeSlateElement,
  options: SerializeMdOptions,
) => {
  const isBlock = Boolean(slateNode.isBlock);
  const fallbackText = (slateNode.children || [])
    .map((child: Descendant) => (child as TText).text || "")
    .join("");
  const opening = isBlock
    ? slateNode.opening || ""
    : fallbackText || slateNode.opening || "";
  const closing = isBlock ? slateNode.closing || "" : "";

  const slateChildren: Descendant[] =
    slateNode.children && slateNode.children.length > 0
      ? slateNode.children
      : [{ text: "" }];

  const children = isBlock
    ? stripZeroWidth(
        convertNodesSerialize(slateChildren, options) as MdRootContent[],
      )
    : [];

  return {
    type: "shortcode",
    content: opening,
    children,
    data: {
      shortcode: {
        startContent: opening,
        closingContent: closing,
        isBlock,
      },
    },
  };
};

/**
 * Markdown serialization rules for Hugo shortcode types
 */
export const hugoSerializationRules = {
  [KEY_SHORTCODE]: {
    deserialize: deserializeShortcode,
    serialize: serializeShortcode,
  },
  [KEY_SHORTCODE_INLINE]: {
    deserialize: deserializeShortcode,
    serialize: serializeShortcode,
  },
};
