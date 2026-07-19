"use client";

import { Separator } from "@/components/ui/separator";
import { useDebouncedCallback } from "@/hooks/use-debounce-callback";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils/cn";
import { configureMonacoLoader } from "@/lib/utils/monaco";
import { initializeShiki } from "@/lib/utils/shiki";
import {
  setCursorOffset,
  setRawMode,
  updateConfig,
} from "@/redux/features/config/slice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { Expand, Maximize } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { RichTextType } from "./utils/plate-types";

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
  const { cursorOffset, isRawMode, fullscreen } = useAppSelector(
    (state) => state.config,
  );
  const editorRef = useRef<any>(null);
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
  }, 500);

  return (
    <div className="relative flex h-fit flex-col rounded">
      <div className="scrollbar-hide bg-background/95 supports-backdrop-blur:bg-background/60 border-border @container/toolbar sticky top-0 left-0 z-50 flex min-h-10 w-full max-w-full items-stretch justify-between overflow-x-auto rounded-t-lg border border-b p-1 backdrop-blur-sm">
        <div className="ml-auto flex items-stretch self-stretch">
          <button
            className={cn(
              "hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-checked:bg-primary aria-checked:text-primary-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              "h-8 min-w-8 bg-transparent px-1.5",
            )}
            onClick={() => dispatch(setRawMode(false))}
          >
            {tEditorRaw("view_in_rich_text")}
          </button>

          {!isMobile && (
            <>
              <Separator
                className="mx-2 -my-1 w-px shrink-0"
                orientation="vertical"
              />
              <button
                title={
                  fullscreen
                    ? tEditorRaw("exit_fullscreen")
                    : tEditorRaw("fullscreen")
                }
                data-testid="fullscreen-button"
                className={cn(
                  "hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-checked:bg-primary aria-checked:text-primary-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                  "h-8 min-w-8 bg-transparent px-1.5",
                )}
                onClick={() => {
                  dispatch(
                    updateConfig({
                      fullscreen: !fullscreen,
                    }),
                  );
                }}
              >
                {!fullscreen ? (
                  <Expand className="size-4" />
                ) : (
                  <Maximize className="size-4" />
                )}
              </button>
            </>
          )}
        </div>
      </div>
      <div
        className={`border-border relative rounded-t-none border border-t-0 p-4 lg:p-6 ${isMobile ? "h-[calc(100vh-215px)]" : "h-[calc(100vh-152px)]"}`}
      >
        <MonacoEditor
          key="raw-editor"
          path="raw-editor.md"
          height="100%"
          width="100%"
          language="markdown"
          theme={resolvedTheme === "light" ? "light-plus" : "dark-plus"}
          value={markdownContent || ""}
          beforeMount={(monaco) =>
            initializeShiki(
              monaco,
              resolvedTheme === "light" ? "light-plus" : "dark-plus",
            )
          }
          onMount={(editor) => {
            editorRef.current = editor;

            // Track cursor position changes
            editor.onDidChangeCursorPosition((e: any) => {
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
              verticalScrollbarSize: isSmallMobile ? 0 : 14,
              horizontalScrollbarSize: isSmallMobile ? 0 : 14,
              vertical: isSmallMobile ? "hidden" : "auto",
              horizontal: isSmallMobile ? "hidden" : "auto",
            },
            placeholder: tEditorRaw("placeholder"),
          }}
        />
      </div>
    </div>
  );
};
