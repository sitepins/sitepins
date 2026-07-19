"use client";

import { cn } from "@/lib/utils/cn";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  useSelected,
  withRef,
} from "platejs/react";
import { SnippetTheme } from "../common/base-block-node";
import {
  ContentEditableSpan,
  EditableTagLine,
} from "../common/editable-tag-line";
import { SnippetControls } from "../common/snippet-controls";

export const HtmlInlineElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children, element } = props as any;
    const editor = useEditorRef();
    const selected = useSelected();
    const focused = useFocused();

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
    const text = (textNode && "text" in textNode ? textNode.text : "") || "";
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
      <PlateElement
        ref={ref}
        className={cn(
          "relative inline-flex items-baseline gap-1.5 rounded-md border-2 transition-all",
          theme.border,
          theme.bg,
          "py-1 pr-10 pl-2.5 font-mono text-sm",
          selected && focused && "ring-2 ring-emerald-400 ring-offset-2",
          className,
        )}
        {...props}
      >
        <SnippetControls
          element={element}
          isBlock={false}
          className="top-1/2 right-1 -translate-y-1/2"
          code=""
        />
        {!isClosingTag && (
          <span
            contentEditable={false}
            className={cn(
              "self-center rounded-sm px-1 py-px text-[9px] font-bold tracking-wider text-white uppercase",
              theme.badge,
            )}
          >
            HTML
          </span>
        )}

        {/* Opening tag - non-editable */}
        <EditableTagLine
          text={openingTag}
          propName={isClosingTag ? "closing" : "inline"}
          theme={theme}
          onChange={(val) => updateInlineText(content)}
        />

        {/* Content between tags - editable */}
        {content && (
          <span contentEditable={false} className="inline-flex min-w-1.25">
            <ContentEditableSpan
              value={content}
              onChange={(val) => updateInlineText(val)}
              className={cn("outline-none", theme.text)}
            />
          </span>
        )}

        {/* Closing tag - non-editable */}
        {closingTag && (
          <span
            contentEditable={false}
            className={cn("inline-flex", theme.tagText)}
          >
            {closingTag}
          </span>
        )}

        <span className="hidden">{children}</span>
      </PlateElement>
    );
  },
);
