"use client";

import { useEditorRef, withRef } from "platejs/react";
import { BaseSnippetBlock, SnippetTheme } from "../common/base-block-node";
import { EditableTagLine } from "../common/editable-tag-line";

// Hugo-specific theme colors
const getHugoShortcodeTheme = (): SnippetTheme => {
  return {
    type: "Hugo",
    bg: "bg-purple-50/80 dark:bg-purple-950/20",
    border: "border-purple-200 dark:border-purple-800",
    text: "text-purple-800 dark:text-purple-200",
    badge: "bg-purple-500",
    tagText: "text-purple-600 dark:text-purple-400",
  };
};

export const HugoBlockElement = withRef<typeof BaseSnippetBlock>(
  ({ className, theme: _theme, ...props }, ref) => {
    const { children, element } = props as any;
    const editor = useEditorRef();
    const opening = element?.opening as string | undefined;
    const closing = element?.closing as string | undefined;
    const theme = getHugoShortcodeTheme();

    const updateNode = (updates: Partial<typeof element>) => {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.setNodes(updates, { at: path });
      }
    };

    return (
      <BaseSnippetBlock
        ref={ref}
        theme={theme}
        label="BLOCK"
        hideContent={!closing}
        className={className}
        {...props}
        headerContent={
          opening ? (
            <EditableTagLine
              text={opening}
              propName="opening"
              theme={theme}
              onChange={(val) => updateNode({ opening: val })}
            />
          ) : null
        }
        footerContent={
          closing ? (
            <div className="mt-3">
              <EditableTagLine
                text={closing}
                propName="closing"
                theme={theme}
                onChange={(val) => updateNode({ closing: val })}
              />
            </div>
          ) : null
        }
      >
        {children}
      </BaseSnippetBlock>
    );
  },
);
