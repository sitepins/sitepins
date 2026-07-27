"use client";

import { createPlatePlugin } from "platejs/react";
import { HtmlBlockElement } from "./html-block-node";
import { HtmlInlineElement } from "./html-inline-node";

export const KEY_HTML_BLOCK = "html_block";
export const KEY_HTML_INLINE = "html_inline";

export const HtmlBlockKit = createPlatePlugin({
  key: KEY_HTML_BLOCK,
  node: {
    isElement: true,
    isInline: false,
    component: HtmlBlockElement,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key !== "Enter" || event.shiftKey) return false;

      const isInHtmlBlock = editor.api.some({
        match: { type: editor.getType(KEY_HTML_BLOCK) },
      });

      if (!isInHtmlBlock) return false;

      event.preventDefault();
      (editor as any).tf.insertText("\n");

      return true;
    },
  },
});

export const HtmlInlineKit = createPlatePlugin({
  key: KEY_HTML_INLINE,
  node: {
    isElement: true,
    isInline: true,
    component: HtmlInlineElement,
  },
});
