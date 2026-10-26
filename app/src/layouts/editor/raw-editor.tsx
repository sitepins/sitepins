"use client";

import { useDebouncedCallback } from "@/hooks/use-debounce-callback";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils/cn";
import { configureMonacoLoader } from "@/lib/utils/monaco";
import { initializeShiki } from "@/lib/utils/shiki";
import { setCursorOffset, setRawMode } from "@/redux/features/config/slice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import type { OnMount } from "@monaco-editor/react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { ExpandToolbarButton } from "./plate-ui/expand-editor-button";
import { Toolbar, ToolbarButton, ToolbarGroup } from "./plate-ui/toolbar";
import { RichTextType } from "./utils/plate-types";
import { mergeText, minimalTextEdit } from "./utils/raw-collab";

// Configure Monaco AMD loader to a compatible CDN version
configureMonacoLoader();

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: function Loading() {
    const tEditorRaw = useTranslations("editor.raw");
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {tEditorRaw("loading")}
      </div>
    );
  },
});

export const RawEditor = ({
  isMobile,
  markdownContent,
  onUpdateMarkdown,
}: RichTextType) => {
  const tEditorRaw = useTranslations("editor.raw");
  const { resolvedTheme } = useTheme();
  const dispatch = useAppDispatch();
  const { cursorOffset, isRawMode } = useAppSelector((state) => state.config);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const isSmallMobile = useMediaQuery("(max-width: 768px)");

  // Sync cursor from Redux to Monaco when switching mode
  useEffect(() => {
    if (isRawMode && editorRef.current && cursorOffset !== undefined) {
      const model = editorRef.current.getModel();
      if (model) {
        const position = model.getPositionAt(cursorOffset);
        editorRef.current.setPosition(position);
        setTimeout(() => {
          editorRef.current?.revealPositionInCenter(position);
          editorRef.current?.focus();
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRawMode]);

  const onDebounceUpdate = useDebouncedCallback((content: string) => {
    onUpdateMarkdown(content);
  }, 250);

  // The markdown both sides last agreed on; anything typed since is unsent.
  const baseRef = useRef(markdownContent);
  const applyingRef = useRef(false);

  // Collaborators' edits arrive as new markdown. Merge them into the editor
  // with a minimal edit so the cursor, undo stack and unsent typing survive.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const base = baseRef.current;
    baseRef.current = markdownContent;
    if (!editor || !model) return;

    const ours = model.getValue();
    const merged = mergeText(base, ours, markdownContent);
    if (merged === ours) return;

    const edit = minimalTextEdit(ours, merged);
    const from = model.getPositionAt(edit.start);
    const to = model.getPositionAt(edit.end);
    applyingRef.current = true;
    try {
      editor.executeEdits("collaborator", [
        {
          range: {
            startLineNumber: from.lineNumber,
            startColumn: from.column,
            endLineNumber: to.lineNumber,
            endColumn: to.column,
          },
          text: edit.text,
        },
      ]);
    } finally {
      applyingRef.current = false;
    }
    if (merged !== markdownContent) onDebounceUpdate(merged);
  }, [markdownContent, onDebounceUpdate]);

  return (
    <div
      className={`raw-markdown-editor [&_.monaco-editor-background]:bg-background! [&_.monaco-editor_.margin]:bg-background! [&_.monaco-editor_.overflow-guard]:bg-background! [&_.monaco-editor]:bg-background! relative flex h-full flex-col rounded ${isMobile ? "" : "pt-4 lg:pt-6"}`}
    >
      <Toolbar
        className={cn(
          "scrollbar-hide bg-background border-border before:bg-background @container/toolbar sticky inset-s-0 top-0 z-50 flex min-h-10 w-auto justify-between overflow-x-auto rounded-lg border p-0 before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 lg:before:-top-6 lg:before:h-6",
          isMobile ? "" : "mx-4 lg:mx-6",
        )}
      >
        <div className="mx-1.5 ms-auto flex min-h-10">
          <ToolbarGroup noSeparator={isMobile} className="py-0">
            <ToolbarButton
              tooltip={tEditorRaw("view_in_rich_text")}
              data-testid="rich-text-button"
              className="h-8 min-w-8 bg-transparent px-1.5"
              onClick={() => {
                // Send the last keystrokes before the rich editor takes over.
                const latest = editorRef.current?.getModel()?.getValue();
                if (latest !== undefined) onUpdateMarkdown(latest);
                dispatch(setRawMode(false));
              }}
            >
              {tEditorRaw("view_in_rich_text")}
            </ToolbarButton>
          </ToolbarGroup>

          {!isMobile && (
            <ToolbarGroup noSeparator>
              <ExpandToolbarButton />
            </ToolbarGroup>
          )}
        </div>
      </Toolbar>
      <div
        dir="ltr"
        className={`relative min-h-0 flex-1 px-0 pt-4 text-left ${isMobile ? "" : "lg:pt-6"}`}
      >
        <MonacoEditor
          key="raw-editor"
          path="raw-editor.md"
          height="100%"
          width="100%"
          language="markdown"
          theme={resolvedTheme === "light" ? "light-plus" : "dark-plus"}
          defaultValue={markdownContent || ""}
          beforeMount={(monaco) =>
            initializeShiki(
              monaco,
              resolvedTheme === "light" ? "light-plus" : "dark-plus",
            )
          }
          onMount={(editor) => {
            editorRef.current = editor;

            // Monaco caches models by path, so a remount can show stale text.
            const model = editor.getModel();
            if (model && model.getValue() !== baseRef.current) {
              model.setValue(baseRef.current);
            }

            // Track cursor position changes
            editor.onDidChangeCursorPosition((e) => {
              const model = editor.getModel();
              if (model) {
                const offset = model.getOffsetAt(e.position);
                dispatch(setCursorOffset(offset));
              }
            });

            // Initial position and focus if we are in raw mode
            if (cursorOffset !== undefined) {
              const model = editor.getModel();
              if (model) {
                const position = model.getPositionAt(cursorOffset);
                editor.setPosition(position);
                // Use a small timeout to ensure editor is fully ready to receive focus and reveal position
                setTimeout(() => {
                  editor.revealPositionInCenter(position);
                  editor.focus();
                }, 100);
              }
            }
          }}
          onChange={(next: string | undefined) => {
            if (applyingRef.current) return;
            onDebounceUpdate(next ?? "");
          }}
          options={{
            scrollBeyondLastLine: false,
            wordWrap: "on",
            minimap: { enabled: false },
            tabSize: 2,
            insertSpaces: true,
            automaticLayout: true,
            renderWhitespace: "none",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
            fontSize: 14,
            lineHeight: 22,
            padding: { top: 16, bottom: 16 },
            glyphMargin: false,
            folding: !isSmallMobile,
            lineNumbers: isSmallMobile ? "off" : "on",
            scrollbar: {
              verticalScrollbarSize: 0,
              horizontalScrollbarSize: 0,
              vertical: "hidden",
              horizontal: "hidden",
            },
            placeholder: tEditorRaw("placeholder"),
          }}
        />
      </div>
    </div>
  );
};
