"use client";

import { useAiCommand } from "@/hooks/use-ai-command";
import { logger } from "@/lib/logger";
import { withAIBatch } from "@platejs/ai";
import {
  AIChatPlugin,
  AIPlugin,
  applyAISuggestions,
  streamInsertChunk,
  useChatChunk,
} from "@platejs/ai/react";
import { getPluginType, KEYS, PathApi } from "platejs";
import * as React from "react";
import { AILoadingBar, AIMenu } from "../plate-ui/ai-menu";
import { AIAnchorElement, AILeaf } from "../plate-ui/ai-node";
import { MarkdownKit } from "./markdown-kit";

export const aiChatPlugin = AIChatPlugin.extend({
  options: {
    chatOptions: {
      api: "/api/ai/command",
      body: {},
    },
    // Disable the built-in "press space on an empty line" trigger —
    // the menu should only open via the "/" slash command.
    trigger: [],
  },
  render: {
    afterContainer: AILoadingBar,
    afterEditable: AIMenu,
    node: AIAnchorElement,
  },
  shortcuts: { show: { keys: "mod+j" } },
  useHooks: ({ editor, getOption }) => {
    useAiCommand();

    const contentRef = React.useRef("");

    useChatChunk({
      onChunk: ({ chunk, isFirst, nodes, text: content }) => {
        contentRef.current = content;

        const currentMode =
          editor.getOption(AIChatPlugin, "mode") ?? getOption("mode");

        if (isFirst) {
          if (currentMode === "insert") {
            try {
              const existingAnchor = editor
                .getApi(AIChatPlugin)
                .aiChat.node({ anchor: true });

              if (!existingAnchor) {
                const selection =
                  editor.selection ??
                  editor.getOption(AIChatPlugin, "chatSelection");
                const blockPath = selection?.focus?.path?.slice(0, 1) ?? [
                  Math.max(0, editor.children.length - 1),
                ];

                editor.tf.withoutSaving(() => {
                  editor.tf.insertNodes(
                    {
                      children: [{ text: "" }],
                      type: getPluginType(editor, KEYS.aiChat),
                    },
                    {
                      at: PathApi.next(blockPath),
                    },
                  );
                });
              }
            } catch (err) {
              logger.warn("Failed to insert AI anchor node", err);
            }
          }
          editor.setOption(AIChatPlugin, "streaming", true);
        }

        if (currentMode === "insert" && nodes.length > 0) {
          withAIBatch(
            editor,
            () => {
              if (!editor.getOption(AIChatPlugin, "streaming")) return;
              editor.tf.withScrolling(() => {
                streamInsertChunk(editor, chunk, {
                  textProps: {
                    [getPluginType(editor, KEYS.ai)]: true,
                  },
                });
              });
            },
            { split: isFirst },
          );
        }
      },
      onFinish: ({ content }) => {
        const finalContent = content || contentRef.current;
        const currentMode = editor.getOption(AIChatPlugin, "mode");
        const currentToolName = editor.getOption(AIChatPlugin, "toolName");

        if (
          currentToolName === "edit" &&
          currentMode === "chat" &&
          finalContent
        ) {
          withAIBatch(
            editor,
            () => {
              try {
                applyAISuggestions(editor, finalContent);
              } catch (err) {
                logger.error("Failed to apply AI suggestions", err);
              }
            },
            { split: true },
          );
        }

        contentRef.current = "";
        editor.getApi(AIChatPlugin).aiChat.stop();
      },
    });
  },
});

export const AIKit = [
  ...MarkdownKit,
  AIPlugin.withComponent(AILeaf),
  aiChatPlugin,
];
