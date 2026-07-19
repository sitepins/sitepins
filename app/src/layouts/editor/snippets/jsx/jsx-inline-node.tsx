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
import { EditableTagLine } from "../common/editable-tag-line";
import { SnippetControls } from "../common/snippet-controls";
import { parseJsxString } from "./jsx-parser";

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
    const { children, element } = props as any;
    const editor = useEditorRef();
    const selected = useSelected();
    const focused = useFocused();
    const theme = getJsxTheme();

    const { name, isSelfClosing, attributes } = element as any;
    const content = element.content || `<${name}>`;

    // For non-self-closing, we need to show: <Tag> content </Tag>
    // For self-closing: <Tag />
    const openingTag = content;
    const closingTag = isSelfClosing ? "" : `</${name}>`;

    // Get inner content from children (if not self-closing)
    const innerContent =
      !isSelfClosing && element.children?.length > 0
        ? element.children
            .map((c: any) => c.text || "")
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

    const updateInnerContent = (newContent: string) => {
      const path = editor.api.findPath(element);
      if (!path) return;

      // Update the text child
      editor.tf.insertText(newContent, {
        at: [...path, 0],
      });
    };

    return (
      <PlateElement
        ref={ref}
        className={cn(
          "relative my-1.5 flex w-full flex-col rounded-md border transition-all",
          theme.border,
          theme.bg,
          "font-mono text-sm",
          selected && focused && "ring-2 ring-blue-400 ring-offset-2",
          className,
        )}
        {...props}
      >
        <SnippetControls
          element={element}
          isBlock={false}
          className="top-1/2 right-0.5 -translate-y-1/2"
          code=""
        />

        {/* Header: Badge + Opening Tag */}
        <div
          contentEditable={false}
          className="flex items-start gap-2 px-2.5 pt-2 pr-8 select-none"
        >
          <span
            className={cn(
              "mt-0.5 rounded-sm px-1 py-px text-[8px] font-bold tracking-wider text-white uppercase",
              theme.badge,
            )}
          >
            JSX
          </span>
          <EditableTagLine
            text={openingTag}
            propName="inline"
            theme={theme}
            onChange={updateOpeningTag}
            className="flex-1"
          />
        </div>

        {/* Content Body */}
        <div
          className={cn(
            "px-4 py-2 font-sans whitespace-pre-wrap outline-none",
            theme.text,
          )}
        >
          {children}
        </div>

        {/* Footer: Closing Tag */}
        {closingTag && (
          <div
            contentEditable={false}
            className="flex justify-end px-2.5 pb-2 select-none"
          >
            <span className={theme.tagText}>{closingTag}</span>
          </div>
        )}
      </PlateElement>
    );
  },
);
