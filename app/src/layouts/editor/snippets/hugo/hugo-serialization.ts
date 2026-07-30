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
      ? convertNodesDeserialize(mdastNode.children, deco, options)
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

  const children = isBlock ? convertNodesSerialize(slateChildren, options) : [];

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
