"use client";

import { useEditorRef } from "platejs/react";
import { ComponentProps, useEffect } from "react";
import { toast } from "sonner";
import { BaseSnippetBlock, SnippetTheme } from "../common/base-block-node";
import { EditableTagLine } from "../common/editable-tag-line";
import { parseJsxString } from "./jsx-parser";

const getJsxShortcodeTheme = (): SnippetTheme => {
  return {
    type: "JSX",
    bg: "bg-blue-50/80 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    badge: "bg-blue-500",
    tagText: "text-blue-600 dark:text-blue-400",
  };
};

export const JsxBlockElement = ({
  className,
  theme: _theme,
  ...props
}: ComponentProps<typeof BaseSnippetBlock>) => {
  const { children, element } = props;
  const { name } = element as any;
  const content = (element as any).content as string;
  const editor = useEditorRef();
  const theme = getJsxShortcodeTheme();

  const isSelfClosing = element?.isSelfClosing as boolean;

  // For self-closing elements, use the content directly since children no longer contain the JSX string
  useEffect(() => {
    if (!isSelfClosing || !content) return;

    // Parse the JSX string to extract name and attributes
    const parsed = parseJsxString(content);

    // Check if name or attributes have changed
    const currentName = (element as any).name;
    const currentAttributes = (element as any).attributes || {};

    const nameChanged = parsed.name && parsed.name !== currentName;
    const attributesChanged =
      JSON.stringify(parsed.attributes) !== JSON.stringify(currentAttributes);

    if (nameChanged || attributesChanged) {
      // Update the element with new name and attributes
      try {
        const path = editor.api.findPath(element as any);
        if (path) {
          editor.tf.setNodes(
            {
              name: parsed.name || currentName,
              attributes: parsed.attributes,
            },
            { at: path },
          );
        }
      } catch (e) {
        // Element might not be in the editor tree yet
        toast.warning("Could not update JSX element attributes:");
      }
    }
  }, [content, element, isSelfClosing, editor]);

  if (isSelfClosing) {
    const { children: _children, ...restProps } = props;
    return (
      <BaseSnippetBlock
        theme={theme}
        label="CODE"
        className={className}
        contentClassName="border-none pl-0"
        {...restProps}
      >
        <div className="pl-0">
          <EditableTagLine
            text={content || `<${name} />`}
            propName="opening"
            theme={theme}
            onChange={(val) => {
              const parsed = parseJsxString(val);
              const path = editor.api.findPath(element);
              if (path) {
                editor.tf.setNodes(
                  {
                    name: parsed.name || name,
                    attributes: parsed.attributes,
                    content: val,
                  },
                  { at: path },
                );
              }
            }}
          />
        </div>
      </BaseSnippetBlock>
    );
  }

  return (
    <BaseSnippetBlock
      theme={theme}
      label="BLOCK"
      className={className}
      {...props}
      headerContent={
        <EditableTagLine
          text={content || `<${name}>`}
          propName="opening"
          theme={theme}
          onChange={(val) => {
            const parsed = parseJsxString(val);
            const path = editor.api.findPath(element);
            if (path) {
              editor.tf.setNodes(
                {
                  name: parsed.name || name,
                  attributes: parsed.attributes,
                  content: val,
                },
                { at: path },
              );
            }
          }}
        />
      }
      footerContent={
        !isSelfClosing && (
          <div className="mt-2">
            <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
              &lt;/{name || "Component"}&gt;
            </span>
          </div>
        )
      }
    >
      {!isSelfClosing && (
        <div className="jsx-block-content w-full">{children}</div>
      )}
    </BaseSnippetBlock>
  );
};
