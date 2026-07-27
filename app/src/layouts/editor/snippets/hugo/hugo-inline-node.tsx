"use client";

import { cn } from "@/lib/utils/cn";
import { PlateElement, useEditorRef, withRef } from "platejs/react";
import { BaseInlineSnippet } from "../common/base-inline-node";
import { EditableTagLine } from "../common/editable-tag-line";

// Hugo-specific theme colors
const getHugoShortcodeTheme = () => {
  return {
    type: "Hugo",
    bg: "bg-purple-50/80 dark:bg-purple-950/20",
    border: "border-purple-200 dark:border-purple-800",
    text: "text-purple-800 dark:text-purple-200",
    badge: "bg-purple-500 text-white",
    tagText: "text-purple-600 dark:text-purple-400",
  };
};

export const HugoInlineElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children, element } = props as any;
    const editor = useEditorRef();
    const theme = getHugoShortcodeTheme();

    const updateInlineText = (text: string) => {
      const path = editor.api.findPath(element);
      if (path) {
        // Replace the content of the inline shortcode
        const range = editor.api.range(path);
        editor.tf.insertText(text, { at: range });
      }
    };

    const text = (
      element.children?.map((c: any) => c.text).join("") || ""
    ).replace(/\n/g, "");

    return (
      <BaseInlineSnippet
        ref={ref}
        theme={theme}
        className={cn("ring-purple-400", className)}
        label="CODE"
        {...props}
      >
        <EditableTagLine
          text={text}
          propName="inline"
          theme={theme}
          onChange={updateInlineText}
        />
        {/* Hide actual children but keep them for Slate data model stability */}
        <span className="hidden">{children}</span>
      </BaseInlineSnippet>
    );
  },
);
