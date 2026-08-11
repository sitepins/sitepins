import type { TElement } from "platejs";
import { KEY_MDX_COMMENT, KEY_MDX_COMMENT_INLINE } from "../snippet-keys";

/** The Slate element the comment plugins render. */
export interface MdxCommentSlateElement extends TElement {
  type: typeof KEY_MDX_COMMENT | typeof KEY_MDX_COMMENT_INLINE;
  /** Raw source including both delimiters. */
  value: string;
}

/** The mdast comment node as it reaches the deserializer. */
type MdxCommentMdastNode = { value?: string };

/**
 * The raw text lives on the element, not in `children`.
 *
 * Slate normalises the text of a node it owns — collapsing the newlines and
 * leading spaces of a multi-line comment — so the children are a single empty
 * text node kept only to satisfy the void-element contract.
 *
 * Block and inline get their own rule rather than one rule branching on a
 * property of the mdast node: Plate keys deserialization off the node type and
 * does not carry extra properties across, so a flag read here is always
 * undefined. Mistyping a block comment as inline is not cosmetic — Slate
 * deletes inline elements that sit at the root.
 */
const deserializeAs =
  (type: MdxCommentSlateElement["type"]) =>
  (mdastNode: MdxCommentMdastNode): MdxCommentSlateElement => ({
    type,
    value: mdastNode.value || "",
    children: [{ text: "" }],
  });

const serializeAs =
  (type: "mdx_comment" | "mdx_comment_inline") =>
  (slateNode: MdxCommentSlateElement) => ({
    type,
    value: slateNode.value || "",
  });

export const mdxCommentSerializationRules = {
  [KEY_MDX_COMMENT]: {
    deserialize: deserializeAs(KEY_MDX_COMMENT),
    serialize: serializeAs("mdx_comment"),
  },
  [KEY_MDX_COMMENT_INLINE]: {
    deserialize: deserializeAs(KEY_MDX_COMMENT_INLINE),
    serialize: serializeAs("mdx_comment_inline"),
  },
};
