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

export interface InlineHtmlParts {
  isClosingTag: boolean;
  openingTag: string;
  content: string;
  closingTag: string;
}

export function splitInlineHtml(text: string): InlineHtmlParts {
  if (text.trim().startsWith("</")) {
    return {
      isClosingTag: true,
      openingTag: text,
      content: "",
      closingTag: "",
    };
  }
  const full = text.match(
    /^(<[a-zA-Z0-9-]+[^>]*>)([\s\S]*?)(<\/[a-zA-Z0-9-]+>)$/,
  );
  if (full) {
    return {
      isClosingTag: false,
      openingTag: full[1],
      content: full[2],
      closingTag: full[3],
    };
  }
  const open = text.match(/^(<[a-zA-Z0-9-]+[^>]*>)([\s\S]*)$/);
  return {
    isClosingTag: false,
    openingTag: open ? open[1] : text,
    content: open ? open[2] : "",
    closingTag: "",
  };
}

export function joinInlineHtml(
  parts: InlineHtmlParts,
  changes: Partial<Pick<InlineHtmlParts, "openingTag" | "content">> = {},
): string {
  const { openingTag, content, closingTag } = { ...parts, ...changes };
  return openingTag + content + closingTag;
}

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
    const { isClosingTag, openingTag, content, closingTag } =
      splitInlineHtml(text);

    const updateInlineText = (
      parts: Partial<Pick<InlineHtmlParts, "openingTag" | "content">>,
    ) => {
      const path = editor.api.findPath(element);
      if (!path) return;
      const range = editor.api.range(path);
      editor.tf.insertText(joinInlineHtml(splitInlineHtml(text), parts), {
        at: range,
      });
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
            onChange={(val) => updateInlineText({ openingTag: val })}
          />
        }
      >
        {/* Content between tags - editable */}
        {content && (
          <span contentEditable={false}>
            <InlineBody theme={theme}>
              <ContentEditableSpan
                value={content}
                onChange={(val) => updateInlineText({ content: val })}
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
