"use client";

import { PlateElement, useEditorRef, withRef } from "platejs/react";
import { SnippetTheme } from "../common/base-block-node";
import {
  BaseInlineSnippet,
  InlineBody,
  InlineClosingTag,
} from "../common/base-inline-node";
import { EditableTagLine } from "../common/editable-tag-line";
import { parseJsxString } from "./jsx-parser";
import type { TText } from "platejs";
import type { JsxSlateElement } from "./jsx-serialization";

// JSX-specific theme colors
const getJsxTheme = (): SnippetTheme => {
  return {
    type: "JSX",
    bg: "bg-blue-50/80 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    badge: "bg-blue-500",
    tagText: "text-blue-600 dark:text-blue-400",
  };
};

export const JsxInlineElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children } = props;
    const element = props.element as JsxSlateElement;
    const editor = useEditorRef();
    const theme = getJsxTheme();

    const { name, isSelfClosing } = element;
    const content = element.content || `<${name}>`;

    // For non-self-closing, we need to show: <Tag> content </Tag>
    // For self-closing: <Tag />
    const openingTag = content;
    const closingTag = isSelfClosing ? "" : `</${name}>`;

    // Get inner content from children (if not self-closing)
    const _innerContent =
      !isSelfClosing && element.children?.length > 0
        ? element.children
            .map((c) => (c as TText).text || "")
            .join("")
            .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
        : "";

    const updateOpeningTag = (newTagText: string) => {
      const path = editor.api.findPath(element);
      if (!path) return;

      const parsed = parseJsxString(newTagText);
      const isNewSelfClosing = newTagText.trim().endsWith("/>");

      editor.tf.setNodes(
        {
          name: parsed.name || name,
          attributes: parsed.attributes,
          content: newTagText,
          isSelfClosing: isNewSelfClosing,
        },
        { at: path },
      );
    };

    const _updateInnerContent = (newContent: string) => {
      const path = editor.api.findPath(element);
      if (!path) return;

      // Update the text child
      editor.tf.insertText(newContent, {
        at: [...path, 0],
      });
    };

    return (
      <BaseInlineSnippet
        ref={ref}
        theme={theme}
        className={className}
        {...props}
        head={
          <EditableTagLine
            text={openingTag}
            propName="inline"
            theme={theme}
            onChange={updateOpeningTag}
          />
        }
      >
        <InlineBody theme={theme}>{children}</InlineBody>
        {closingTag && (
          <InlineClosingTag theme={theme}>{closingTag}</InlineClosingTag>
        )}
      </BaseInlineSnippet>
    );
  },
);
