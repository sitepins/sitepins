"use client";

import { createPlatePlugin } from "platejs/react";
import {
  MdxCommentBlockElement,
  MdxCommentInlineElement,
} from "./mdx-comment-node";

export { KEY_MDX_COMMENT, KEY_MDX_COMMENT_INLINE } from "../snippet-keys";
import { KEY_MDX_COMMENT, KEY_MDX_COMMENT_INLINE } from "../snippet-keys";

/**
 * Void, because the raw source lives on the element rather than in `children`.
 * Editing a comment in rich mode would have to round-trip through Slate text,
 * which normalises exactly the whitespace the node exists to preserve; the raw
 * editor stays the place to change one.
 */
export const MdxCommentKit = createPlatePlugin({
  key: KEY_MDX_COMMENT,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: MdxCommentBlockElement,
  },
});

export const MdxCommentInlineKit = createPlatePlugin({
  key: KEY_MDX_COMMENT_INLINE,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: MdxCommentInlineElement,
  },
});
