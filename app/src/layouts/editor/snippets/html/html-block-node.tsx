"use client";

import { cn } from "@/lib/utils/cn";
import { Eye, EyeOff } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useState } from "react";
import { BaseSnippetBlock, SnippetTheme } from "../common/base-block-node";
import {
  ContentEditableSpan,
  EditableTagLine,
} from "../common/editable-tag-line";

// Parse a single attribute value from an HTML tag string.
// Matches:  attr="value"  attr='value'  attr=value
function parseAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}=["']?([^"'\\s>]+)["']?`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

// Convert a dimension string ("400", "100%", "400px") to a CSS value,
// capping numeric values at maxPx.
function toCssDim(raw: string | null, maxPx: number, fallback: string): string {
  if (!raw) return fallback;
  if (raw.endsWith("%")) return "100%";
  const num = parseInt(raw, 10);
  if (!isNaN(num)) return `${Math.min(num, maxPx)}px`;
  return fallback;
}

export const HtmlBlockElement = ({
  className,
  theme: _theme,
  ...props
}: React.ComponentProps<typeof BaseSnippetBlock>) => {
  const { element, children } = props;
  const editor = useEditorRef();
  const [showPreview, setShowPreview] = useState(false);

  const theme: SnippetTheme = {
    type: "HTML",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    badge: "bg-emerald-500",
    tagText: "text-emerald-700 dark:text-emerald-400",
  };

  // Get text content
  const textNode = element.children?.[0];
  const text =
    ((textNode && "text" in textNode ? textNode.text : "") as string) || "";

  // Split: <StartTag> Body </EndTag>
  const match = text.match(
    /^(<[a-zA-Z0-9-]+[^>]*>)(\n?)([\s\S]*?)(\n?)(<\/[a-zA-Z0-9-]+>\s*)$/,
  );

  const startTag = match ? match[1] : "";
  const leadingNewline = match ? match[2] : "";
  const body = match ? match[3] : text;
  const trailingNewline = match ? match[4] : "";
  const endTag = match ? match[5] : "";

  // Detect iframe
  const trimmedText = text.trim();
  const isIframe = /^<iframe[\s>]/i.test(trimmedText);

  // Parse iframe attributes from the opening tag (or the full self-closing tag)
  const iframeTagSource = startTag || trimmedText;
  const iframeSrc = parseAttr(iframeTagSource, "src");
  const iframeRawWidth = parseAttr(iframeTagSource, "width");
  const iframeRawHeight = parseAttr(iframeTagSource, "height");

  // CSS dims — width: respect original but clamp %, height: cap at 480px
  const iframeWidth = toCssDim(iframeRawWidth, 99999, "100%");
  const iframeHeight = toCssDim(iframeRawHeight, 480, "320px");

  const updateText = (
    newText: string,
    updatedStartTag?: string,
    updatedEndTag?: string,
  ) => {
    const path = editor.api.findPath(element);
    if (!path) return;

    const currentStartTag =
      updatedStartTag !== undefined ? updatedStartTag : startTag;
    const currentEndTag = updatedEndTag !== undefined ? updatedEndTag : endTag;

    const sep1 = leadingNewline || (currentStartTag && newText ? "\n" : "");
    const sep2 = trailingNewline || (currentEndTag && newText ? "\n" : "");
    const fullText = currentStartTag + sep1 + newText + sep2 + currentEndTag;

    const range = editor.api.range(path);
    editor.tf.insertText(fullText, { at: range });
  };

  const headerContent = startTag ? (
    <EditableTagLine
      text={startTag}
      propName="opening"
      theme={theme}
      onChange={(val) => updateText(body, val, endTag)}
    />
  ) : null;

  const footerContent = endTag ? (
    <div
      contentEditable={false}
      className="mt-2 font-mono text-sm font-semibold select-none"
    >
      <span className={theme.tagText}>{endTag}</span>
    </div>
  ) : null;

  // Eye toggle — rendered inside the SnippetControls button group (same row as + and trash)
  // Only shown when the block is an iframe.
  const eyeToggle = isIframe ? (
    <button
      type="button"
      contentEditable={false}
      aria-label={showPreview ? "Hide preview" : "Show preview"}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setShowPreview((v) => !v);
      }}
      className={cn(
        "rounded-sm p-1 transition-colors",
        showPreview
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "text-primary hover:bg-primary/20 rounded-sm",
      )}
    >
      {showPreview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  ) : null;

  // Preview panel — renders a real <iframe> using the parsed src / width / height
  const iframePreview =
    isIframe && showPreview ? (
      <div
        contentEditable={false}
        className="mt-3 w-full overflow-hidden rounded-md border border-emerald-200 dark:border-emerald-800"
      >
        {/* Preview header bar */}
        <div className="flex items-center gap-1.5 border-b border-emerald-200 bg-emerald-100/60 px-2 py-1 dark:border-emerald-800 dark:bg-emerald-950/40">
          <Eye className="size-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
            Preview
          </span>
          {(iframeRawWidth || iframeRawHeight) && (
            <span className="ml-1 text-[10px] text-emerald-500">
              {iframeRawWidth && `w: ${iframeRawWidth}`}
              {iframeRawWidth && iframeRawHeight && " · "}
              {iframeRawHeight && `h: ${iframeRawHeight}`}
            </span>
          )}
        </div>

        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            style={{
              width: iframeWidth,
              height: iframeHeight,
              maxWidth: "100%",
              maxHeight: "480px",
              display: "block",
              border: "none",
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            loading="lazy"
            title="iframe preview"
          />
        ) : (
          <div className="px-4 py-6 text-center text-xs text-emerald-600 dark:text-emerald-400">
            No <code>src</code> attribute found in this iframe.
          </div>
        )}
      </div>
    ) : null;

  return (
    <BaseSnippetBlock
      theme={theme}
      label="BLOCK"
      className={className}
      headerContent={headerContent}
      snippetExtraControls={eyeToggle}
      footerContent={
        <>
          {footerContent}
          {iframePreview}
        </>
      }
      {...props}
    >
      {/* Hide raw children; render our editable body span instead */}
      <span className="hidden">{children}</span>

      <div
        className={cn("font-mono whitespace-pre-wrap", theme.text)}
        contentEditable={false}
      >
        <ContentEditableSpan
          value={body}
          onChange={(val) => updateText(val)}
          className="block min-h-[1.5em] outline-none"
        />
      </div>
    </BaseSnippetBlock>
  );
};
