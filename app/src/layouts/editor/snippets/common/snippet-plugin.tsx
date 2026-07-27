"use client";

import { createPlatePlugin, PlateElement } from "platejs/react";
import { ComponentProps } from "react";
import { HugoBlockElement } from "../hugo/hugo-block-node";
import { HugoInlineElement } from "../hugo/hugo-inline-node";
import { DEFAULT_SNIPPET_THEME } from "./base-block-node";

export const KEY_SHORTCODE = "shortcode";
export const KEY_SHORTCODE_INLINE = "shortcode_inline";

// Wrapper component that routes to block or inline based on isBlock property
const SnippetElement = (props: ComponentProps<typeof PlateElement>) => {
  const { element } = props as any;
  const isBlock = Boolean(
    element?.isBlock && (element?.opening || element?.closing),
  );

  if (!isBlock) {
    return <HugoInlineElement {...props} />;
  }

  return <HugoBlockElement {...props} theme={DEFAULT_SNIPPET_THEME} />;
};

export const ShortcodeKit = createPlatePlugin({
  key: KEY_SHORTCODE,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: SnippetElement,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key !== "Enter" || !editor.selection) return false;

      // Try to get the parent node using a more direct approach
      try {
        const parentEntry = editor.api.parent(editor.selection);
        if (!parentEntry) {
          return false;
        }

        const [parentNode, parentPath] = parentEntry as any;

        // Check if we're in a shortcode
        if (
          parentNode.type === KEY_SHORTCODE ||
          parentNode.type === KEY_SHORTCODE_INLINE
        ) {
          const isBlock = Boolean(parentNode.isBlock);

          if (!isBlock) {
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

            // Clean up trailing newlines after the event cycle completes
            setTimeout(() => {
              const textChild = parentNode.children?.[0];
              if (
                textChild?.text &&
                typeof textChild.text === "string" &&
                textChild.text.includes("\n")
              ) {
                const trimmedText = textChild.text.replace(/\n+/g, "");
                editor.tf.setNodes(
                  { text: trimmedText },
                  { at: [...parentPath, 0] },
                );
              }
            }, 0);

            return true; // Prevent default behavior
          }
        }
      } catch (e) {
        return false;
      }

      return false;
    },
  },
});

export const ShortcodeInlineKit = createPlatePlugin({
  key: KEY_SHORTCODE_INLINE,
  node: {
    isElement: true,
    isInline: true,
    isVoid: false,
    component: SnippetElement,
  },
});
