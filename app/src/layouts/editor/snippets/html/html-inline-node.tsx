"use client";

import { PlateElement, useEditorRef, withRef } from "platejs/react";
import { SnippetTheme } from "../common/base-block-node";
import {
  BaseInlineSnippet,
  InlineBody,
  InlineClosingTag,
} from "../common/base-inline-node";
import {
  ContentEditableSpan,
  EditableTagLine,
} from "../common/editable-tag-line";

export const HtmlInlineElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children, element } = props;
    const editor = useEditorRef();

    const theme: SnippetTheme = {
      type: "HTML",
      bg: "bg-emerald-50/80 dark:bg-emerald-950/20",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-800 dark:text-emerald-200",
      badge: "bg-emerald-500",
      tagText: "text-emerald-700 dark:text-emerald-400",
    };

    // Get the text content
    const textNode = element.children?.[0];
    const rawText = textNode && "text" in textNode ? textNode.text : "";
    const text = typeof rawText === "string" ? rawText : "";
    const isClosingTag = String(text).trim().startsWith("</");

    // Parse the HTML to extract opening tag, content, and closing tag
    // Match: <tag ...> content </tag>
    const fullMatch =
      !isClosingTag &&
      text.match(/^(<[a-zA-Z0-9-]+[^>]*>)([\s\S]*?)(<\/[a-zA-Z0-9-]+>)$/);

    let openingTag = "";
    let content = "";
    let closingTag = "";

    if (fullMatch) {
      // Has opening tag, content, and closing tag
      openingTag = fullMatch[1];
      content = fullMatch[2];
      closingTag = fullMatch[3];
    } else if (!isClosingTag) {
      // Try to match just opening tag without closing (self-contained or no closing)
      const openMatch = text.match(/^(<[a-zA-Z0-9-]+[^>]*>)([\s\S]*)$/);
      if (openMatch) {
        openingTag = openMatch[1];
        content = openMatch[2];
        closingTag = "";
      } else {
        // Fallback: treat entire text as opening tag
        openingTag = text;
        content = "";
        closingTag = "";
      }
    } else {
      // It's a closing tag
      openingTag = text;
      content = "";
      closingTag = "";
    }

    const updateInlineText = (newContent: string) => {
      const path = editor.api.findPath(element);
      if (!path) return;

      // Reconstruct full HTML with new content
      const newText = openingTag + newContent + closingTag;

      // Replace content using insertText over the entire range
      const range = editor.api.range(path);
      editor.tf.insertText(newText, { at: range });
    };

    return (
      <BaseInlineSnippet
        ref={ref}
        theme={theme}
        hideBadge={isClosingTag}
        className={className}
        {...props}
        head={
          <EditableTagLine
            text={openingTag}
            propName={isClosingTag ? "closing" : "inline"}
            inline
            theme={theme}
            onChange={(_val) => updateInlineText(content)}
          />
        }
      >
        {/* Content between tags - editable */}
        {content && (
          <span contentEditable={false}>
            <InlineBody theme={theme}>
              <ContentEditableSpan
                value={content}
                onChange={(val) => updateInlineText(val)}
                className="inline outline-none"
              />
            </InlineBody>
          </span>
        )}

        {closingTag && (
          <InlineClosingTag theme={theme}>{closingTag}</InlineClosingTag>
        )}

        <span className="hidden">{children}</span>
      </BaseInlineSnippet>
    );
  },
);
