"use client";

import { createPlatePlugin } from "platejs/react";
import { JsxBlockElement } from "./jsx-block-node";
import { JsxInlineElement } from "./jsx-inline-node";

export const KEY_JSX_BLOCK = "jsx_block";
export const KEY_JSX_INLINE = "jsx_inline";

export const JsxBlockKit = createPlatePlugin({
  key: KEY_JSX_BLOCK,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    isContainer: false,
    component: JsxBlockElement,
  },
  rules: {
    break: {
      default: "exit",
      empty: "deleteExit",
      emptyLineEnd: "deleteExit",
    },
    delete: {
      start: "default",
    },
  },
});

export const JsxInlineKit = createPlatePlugin({
  key: KEY_JSX_INLINE,
  node: {
    isElement: true,
    isInline: true,
    isVoid: false,
    component: JsxInlineElement,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key !== "Enter" || !editor.selection) return false;

      // Try to get the parent node using a more direct approach
      try {
        const parentEntry = editor.api.parent(editor.selection);
        if (!parentEntry) return false;

        const [parentNode, parentPath] = parentEntry;

        // Check if we're in a JSX inline element
        if (parentNode.type === KEY_JSX_INLINE) {
          event.preventDefault();
          event.stopPropagation();

          // Insert a new paragraph after the inline snippet
          const nextPath = [
            ...parentPath.slice(0, -1),
            parentPath[parentPath.length - 1] + 1,
          ];
          editor.tf.insertNodes(
            {
              type: "p",
              children: [{ text: "" }],
            },
            { at: nextPath, select: true },
          );

          return true; // Prevent default behavior
        }
      } catch (e) {
        return false;
      }

      return false;
    },
  },
});
