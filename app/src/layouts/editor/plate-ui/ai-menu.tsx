"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import {
  AIChatPlugin,
  AIPlugin,
  useEditorChat,
  useLastAssistantMessage,
} from "@platejs/ai/react";
import { getTransientCommentKey } from "@platejs/comment";
import { BlockSelectionPlugin, useIsSelecting } from "@platejs/selection/react";
import { getTransientSuggestionKey } from "@platejs/suggestion";
import { Command as CommandPrimitive } from "cmdk";
import {
  Album,
  BadgeHelp,
  BookOpenCheck,
  Check,
  CornerUpLeft,
  FeatherIcon,
  ListEnd,
  ListMinus,
  ListPlus,
  Loader2Icon,
  PauseIcon,
  PenLine,
  SmileIcon,
  Wand,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  isHotkey,
  KEYS,
  NodeApi,
  type NodeEntry,
  type SlateEditor,
  TextApi,
  type TNode,
} from "platejs";
import {
  type PlateEditor,
  useEditorPlugin,
  useEditorRef,
  useFocusedLast,
  useHotkeys,
  usePluginOption,
} from "platejs/react";
import * as React from "react";
import { commentPlugin } from "../plugins/comment-kit";
import { AIChatEditor } from "./ai-chat-editor";

export function AIMenu() {
  const tEditorAi = useTranslations("editor.ai");
  const { api, editor } = useEditorPlugin(AIChatPlugin);
  const mode = usePluginOption(AIChatPlugin, "mode");
  const toolName = usePluginOption(AIChatPlugin, "toolName");

  const streaming = usePluginOption(AIChatPlugin, "streaming");
  const isSelecting = useIsSelecting();
  const isFocusedLast = useFocusedLast();
  const openOption = usePluginOption(AIChatPlugin, "open");
  const open = openOption && isFocusedLast;
  const [value, setValue] = React.useState("");

  const [input, setInput] = React.useState("");

  const chat = usePluginOption(AIChatPlugin, "chat");

  const { messages, status } = chat;
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  // Track the last valid cursor position so we can survive slash-node destructive unmounts
  const lastKnownRect = React.useRef<DOMRect | null>(null);

  React.useEffect(() => {
    const updateLastKnownRect = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          lastKnownRect.current = rect;
        }
      }
    };

    document.addEventListener("selectionchange", updateLastKnownRect);
    return () => {
      document.removeEventListener("selectionchange", updateLastKnownRect);
    };
  }, []);

  const content = useLastAssistantMessage()?.parts.find(
    (part) => part.type === "text",
  )?.text;

  React.useEffect(() => {
    if (streaming) {
      const anchor = api.aiChat.node({ anchor: true });
      setTimeout(() => {
        const anchorDom = editor.api.toDOMNode(anchor![0])!;
        if (anchorDom) {
          setAnchorRect(anchorDom.getBoundingClientRect());
        }
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const setOpen = (open: boolean) => {
    if (open) {
      api.aiChat.show();
    } else {
      api.aiChat.hide();
    }
  };

  const show = (rect: DOMRect) => {
    setAnchorRect(rect);
    setOpen(true);
  };

  useEditorChat({
    onOpenBlockSelection: (blocks: NodeEntry[]) => {
      const domNode = editor.api.toDOMNode(blocks.at(-1)![0]);
      if (domNode) show(domNode.getBoundingClientRect());
    },
    onOpenChange: (open) => {
      if (!open) {
        setAnchorRect(null);
        setInput("");
      }
    },
    onOpenCursor: () => {
      setTimeout(() => {
        let rect: DOMRect | null = null;

        // Stage 1: Native selection range (exact cursor location restore point)
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const r = selection.getRangeAt(0).getBoundingClientRect();
          if (r.width > 0 || r.height > 0) rect = r;
        }

        // Stage 2: Fallback to the block node (will span 100% width)
        if (!rect) {
          const block = editor.api.block({ highest: true });
          if (block) {
            const blockNode = editor.api.toDOMNode(block[0]);
            if (blockNode) {
              const r = blockNode.getBoundingClientRect();
              if (r.width > 0 || r.height > 0) rect = r;
            }
          }
        }

        // Stage 3: The magic fallback. If DOM is mutating from a destroyed slash node,
        // use the precise cursor coordinates we tracked a millisecond before the click.
        if (!rect && lastKnownRect.current) {
          rect = lastKnownRect.current;
        }

        if (rect) {
          show(rect);
        }
      }, 0);
    },
    onOpenSelection: () => {
      setTimeout(() => {
        let rect: DOMRect | null = null;

        // Stage 1: Active selection rect (best for highlighted text)
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const r = selection.getRangeAt(0).getBoundingClientRect();
          if (r.width > 0 || r.height > 0) rect = r;
        }

        // Stage 2: Fallback to the last selected block
        if (!rect) {
          const blocks = editor.api.blocks();
          if (blocks && blocks.length > 0) {
            const blockNode = editor.api.toDOMNode(blocks.at(-1)![0]);
            if (blockNode) {
              const r = blockNode.getBoundingClientRect();
              if (r.width > 0 || r.height > 0) rect = r;
            }
          }
        }

        // Stage 3: Stale selection escape hatch
        if (!rect && lastKnownRect.current) {
          rect = lastKnownRect.current;
        }

        if (rect) {
          show(rect);
        }
      }, 0);
    },
  });

  useHotkeys("esc", () => {
    api.aiChat.stop();

    // remove when you implement the route /api/ai/command
    (chat as any)._abortFakeStream();
  });

  const isLoading = status === "streaming" || status === "submitted";

  React.useEffect(() => {
    if (toolName === "edit" && mode === "chat" && !isLoading) {
      let anchorNode = editor.api.node({
        at: [],
        reverse: true,
        match: (n) => !!n[KEYS.suggestion] && !!n[getTransientSuggestionKey()],
      });

      if (!anchorNode) {
        anchorNode = editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes({ selectionFallback: true, sort: true })
          .at(-1);
      }

      if (!anchorNode) return;

      const block = editor.api.block({ at: anchorNode[1] });
      if (block) {
        const domNode = editor.api.toDOMNode(block[0]);
        if (domNode) {
          setAnchorRect(domNode.getBoundingClientRect());
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (isLoading && mode === "insert") return null;

  if (toolName === "comment") return null;

  if (toolName === "edit" && mode === "chat" && isLoading) return null;

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverAnchor asChild>
        {anchorRect ? (
          <div
            style={{
              position: "fixed",
              top: anchorRect.top,
              left: anchorRect.left,
              width: anchorRect.width,
              height: anchorRect.height,
              pointerEvents: "none",
            }}
          />
        ) : (
          <div />
        )}
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="border-none bg-transparent p-0 shadow-none"
        onEscapeKeyDown={(e) => {
          e.preventDefault();

          api.aiChat.hide();
        }}
        side="bottom"
        style={{
          minWidth: "300px",
          width: "300px",
        }}
      >
        <Command
          className="border-border w-full rounded-lg border shadow-md"
          onValueChange={setValue}
          value={value}
        >
          {mode === "chat" &&
            isSelecting &&
            content &&
            toolName === "generate" && <AIChatEditor content={content} />}

          {isLoading ? (
            <div className="text-muted-foreground flex grow items-center gap-2 p-2 text-sm select-none">
              <Loader2Icon className="size-4 animate-spin" />
              {messages.length > 1
                ? tEditorAi("editing")
                : tEditorAi("thinking")}
            </div>
          ) : (
            <CommandPrimitive.Input
              autoFocus
              className={cn(
                "placeholder:text-muted-foreground dark:bg-input/30 flex h-9 w-full min-w-0 rounded border-transparent bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none md:text-sm",
                "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                "border-b-border border-b focus-visible:ring-transparent",
              )}
              data-plate-focus
              onKeyDown={(e) => {
                if (isHotkey("backspace")(e) && input.length === 0) {
                  e.preventDefault();
                  api.aiChat.hide();
                }
                if (isHotkey("enter")(e) && !e.shiftKey && !value) {
                  e.preventDefault();
                  void api.aiChat.submit(input, {
                    mode: isSelecting ? "chat" : "insert",
                    toolName: isSelecting ? "edit" : "generate",
                  });
                  setInput("");
                }
              }}
              onValueChange={setInput}
              placeholder={tEditorAi("placeholder")}
              value={input}
            />
          )}

          {!isLoading && (
            <CommandList>
              <AIMenuItems
                input={input}
                setInput={setInput}
                setValue={setValue}
              />
            </CommandList>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type EditorChatState =
  | "cursorCommand"
  | "cursorSuggestion"
  | "selectionCommand"
  | "selectionSuggestion";

const AICommentIcon = () => (
  <svg
    fill="none"
    height="24"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0 0h24v24H0z" fill="none" stroke="none" />
    <path d="M8 9h8" />
    <path d="M8 13h4.5" />
    <path d="M10 19l-1 -1h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5" />
    <path d="M17.8 20.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138z" />
  </svg>
);

export const AIMenuItems = ({
  input,
  setInput,
  setValue,
}: {
  input: string;
  setInput: (value: string) => void;
  setValue: (value: string) => void;
}) => {
  const tEditorAi = useTranslations("editor.ai");
  const editor = useEditorRef();
  const { messages } = usePluginOption(AIChatPlugin, "chat");
  const aiEditor = usePluginOption(AIChatPlugin, "aiEditor")!;
  const isSelecting = useIsSelecting();

  const aiChatItems = React.useMemo(
    () => ({
      accept: {
        icon: <Check />,
        label: tEditorAi("accept"),
        value: "accept",
        onSelect: ({
          aiEditor,
          editor,
        }: {
          aiEditor: SlateEditor;
          editor: PlateEditor;
        }) => {
          const { mode, toolName } = editor.getOptions(AIChatPlugin);

          if (mode === "chat" && toolName === "generate") {
            return editor
              .getTransforms(AIChatPlugin)
              .aiChat.replaceSelection(aiEditor);
          }

          editor.getTransforms(AIChatPlugin).aiChat.accept();
          editor.tf.focus({ edge: "end" });
        },
      },
      comment: {
        icon: <AICommentIcon />,
        label: tEditorAi("comment"),
        value: "comment",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          editor.getApi(AIChatPlugin).aiChat.submit(input, {
            mode: "insert",
            prompt:
              "Please comment on the following content and provide reasonable and meaningful feedback.",
            toolName: "comment",
          });
        },
      },
      continueWrite: {
        icon: <PenLine />,
        label: tEditorAi("continue_writing"),
        value: "continueWrite",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          const ancestorNode = editor.api.block({ highest: true });

          if (!ancestorNode) return;

          const isEmpty =
            NodeApi.string(ancestorNode[0] as TNode).trim().length === 0;

          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            mode: "insert",
            prompt: isEmpty
              ? "Start writing a new paragraph. ONLY ONE SENTENCE"
              : "Continue writing. ONLY ONE SENTENCE. DONT REPEAT THE TEXT.",
            toolName: "generate",
          });
        },
      },
      discard: {
        icon: <X />,
        label: tEditorAi("discard"),
        shortcut: "Escape",
        value: "discard",
        onSelect: ({ editor }: { editor: PlateEditor }) => {
          editor.getTransforms(AIPlugin).ai.undo();
          editor.getApi(AIChatPlugin).aiChat.hide();
        },
      },
      emojify: {
        icon: <SmileIcon />,
        label: tEditorAi("emojify"),
        value: "emojify",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Emojify",
            toolName: "edit",
          });
        },
      },
      explain: {
        icon: <BadgeHelp />,
        label: tEditorAi("explain"),
        value: "explain",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: {
              default: "Explain the document",
              selecting: "Explain",
            },
            toolName: "generate",
          });
        },
      },
      fixSpelling: {
        icon: <Check />,
        label: tEditorAi("fix_spelling"),
        value: "fix_spelling",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Fix spelling and grammar",
            toolName: "edit",
          });
        },
      },
      generateMarkdownSample: {
        icon: <BookOpenCheck />,
        label: tEditorAi("generate_markdown"),
        value: "generateMarkdownSample",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Generate a markdown sample",
            toolName: "generate",
          });
        },
      },
      generateMdxSample: {
        icon: <BookOpenCheck />,
        label: tEditorAi("generate_mdx"),
        value: "generateMdxSample",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Generate a mdx sample",
            toolName: "generate",
          });
        },
      },
      improveWriting: {
        icon: <Wand />,
        label: tEditorAi("improve_writing"),
        value: "improve_writing",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Improve the writing",
            toolName: "edit",
          });
        },
      },
      insertBelow: {
        icon: <ListEnd />,
        label: tEditorAi("insert_below"),
        value: "insert_below",
        onSelect: ({
          aiEditor,
          editor,
        }: {
          aiEditor: SlateEditor;
          editor: PlateEditor;
        }) => {
          /** Format: 'none' Fix insert table */
          void editor
            .getTransforms(AIChatPlugin)
            .aiChat.insertBelow(aiEditor, { format: "none" });
        },
      },
      makeLonger: {
        icon: <ListPlus />,
        label: tEditorAi("make_longer"),
        value: "make_longer",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Make longer",
            toolName: "edit",
          });
        },
      },
      makeShorter: {
        icon: <ListMinus />,
        label: tEditorAi("make_shorter"),
        value: "make_shorter",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Make shorter",
            toolName: "edit",
          });
        },
      },
      replace: {
        icon: <Check />,
        label: tEditorAi("replace_selection"),
        value: "replace",
        onSelect: ({
          aiEditor,
          editor,
        }: {
          aiEditor: SlateEditor;
          editor: PlateEditor;
        }) => {
          void editor
            .getTransforms(AIChatPlugin)
            .aiChat.replaceSelection(aiEditor);
        },
      },
      simplifyLanguage: {
        icon: <FeatherIcon />,
        label: tEditorAi("simplify_language"),
        value: "simplify_language",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            prompt: "Simplify the language",
            toolName: "edit",
          });
        },
      },
      summarize: {
        icon: <Album />,
        label: tEditorAi("summarize"),
        value: "summarize",
        onSelect: ({
          editor,
          input,
        }: {
          editor: PlateEditor;
          input: string;
        }) => {
          void editor.getApi(AIChatPlugin).aiChat.submit(input, {
            mode: "insert",
            prompt: {
              default: "Summarize the document",
              selecting: "Summarize",
            },
            toolName: "generate",
          });
        },
      },
      tryAgain: {
        icon: <CornerUpLeft />,
        label: tEditorAi("try_again"),
        value: "try_again",
        onSelect: ({ editor }: { editor: PlateEditor }) => {
          void editor.getApi(AIChatPlugin).aiChat.reload();
        },
      },
    }),
    [tEditorAi],
  );

  const menuState = React.useMemo(() => {
    if (messages && messages.length > 0) {
      return isSelecting ? "selectionSuggestion" : "cursorSuggestion";
    }

    return isSelecting ? "selectionCommand" : "cursorCommand";
  }, [isSelecting, messages]);

  const menuGroups = React.useMemo(() => {
    const stateItems: Record<
      EditorChatState,
      {
        items: any[];
        heading?: string;
      }[]
    > = {
      cursorCommand: [
        {
          items: [
            aiChatItems.continueWrite,
            aiChatItems.summarize,
            aiChatItems.explain,
          ],
        },
      ],
      cursorSuggestion: [
        {
          items: [
            aiChatItems.accept,
            aiChatItems.discard,
            aiChatItems.tryAgain,
          ],
        },
      ],
      selectionCommand: [
        {
          items: [
            aiChatItems.improveWriting,
            aiChatItems.emojify,
            aiChatItems.makeLonger,
            aiChatItems.makeShorter,
            aiChatItems.fixSpelling,
            aiChatItems.simplifyLanguage,
          ],
        },
      ],
      selectionSuggestion: [
        {
          items: [
            aiChatItems.accept,
            aiChatItems.discard,
            aiChatItems.insertBelow,
            aiChatItems.tryAgain,
          ],
        },
      ],
    };

    return stateItems[menuState];
  }, [menuState, aiChatItems]);

  React.useEffect(() => {
    if (menuGroups.length > 0 && menuGroups[0].items.length > 0) {
      setValue(menuGroups[0].items[0].value);
    }
  }, [menuGroups, setValue]);

  return (
    <>
      {menuGroups.map((group, index) => (
        <CommandGroup heading={group.heading} key={index}>
          {group.items.map((menuItem) => (
            <CommandItem
              className="[&_svg]:text-muted-foreground"
              key={menuItem.value}
              onSelect={() => {
                menuItem.onSelect?.({
                  aiEditor,
                  editor,
                  input,
                });
                setInput("");
              }}
              value={menuItem.value}
            >
              {menuItem.icon}
              <span>{menuItem.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
};

export function AILoadingBar() {
  const tEditorAi = useTranslations("editor.ai");
  const editor = useEditorRef();

  const toolName = usePluginOption(AIChatPlugin, "toolName");
  const chat = usePluginOption(AIChatPlugin, "chat");
  const mode = usePluginOption(AIChatPlugin, "mode");

  const { status } = chat;

  const { api } = useEditorPlugin(AIChatPlugin);

  const isLoading = status === "streaming" || status === "submitted";

  const handleComments = (type: "accept" | "reject") => {
    if (type === "accept") {
      editor.tf.unsetNodes([getTransientCommentKey()], {
        at: [],
        match: (n) => TextApi.isText(n) && !!n[KEYS.comment],
      });
    }

    if (type === "reject") {
      editor
        .getTransforms(commentPlugin)
        .comment.unsetMark({ transient: true });
    }

    api.aiChat.hide();
  };

  useHotkeys("esc", () => {
    api.aiChat.stop();
  });

  if (
    isLoading &&
    (mode === "insert" ||
      toolName === "comment" ||
      (toolName === "edit" && mode === "chat"))
  ) {
    return (
      <div
        className={cn(
          "border-border bg-muted text-muted-foreground absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border px-3 py-1.5 text-sm shadow-md transition-all duration-300",
        )}
      >
        <span className="border-muted-foreground h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
        <span>
          {status === "submitted"
            ? tEditorAi("thinking")
            : tEditorAi("writing")}
        </span>
        <Button
          className="flex items-center gap-1 text-xs"
          onClick={() => api.aiChat.stop()}
          size="sm"
          variant="ghost"
        >
          <PauseIcon className="h-4 w-4" />
          {tEditorAi("stop")}
          <kbd className="bg-border text-muted-foreground ml-1 rounded px-1 font-mono text-[10px] shadow-sm">
            Esc
          </kbd>
        </Button>
      </div>
    );
  }

  if (toolName === "comment" && status === "ready") {
    return (
      <div
        className={cn(
          "border-border/50 bg-popover text-muted-foreground absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-0 rounded-xl border p-1 text-sm shadow-xl backdrop-blur-sm",
          "p-3",
        )}
      >
        {/* Header with controls */}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Button
              disabled={isLoading}
              onClick={() => handleComments("accept")}
              size="sm"
            >
              {tEditorAi("accept")}
            </Button>

            <Button
              disabled={isLoading}
              onClick={() => handleComments("reject")}
              size="sm"
            >
              {tEditorAi("reject")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
