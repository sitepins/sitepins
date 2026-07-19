"use client";

import { useAiCommand } from "@/hooks/use-ai-command";
import { withAIBatch } from "@platejs/ai";
import {
  AIChatPlugin,
  AIPlugin,
  applyAISuggestions,
  streamInsertChunk,
  useChatChunk,
} from "@platejs/ai/react";
import { getPluginType, KEYS, PathApi } from "platejs";
import { usePluginOption } from "platejs/react";
import { AILoadingBar, AIMenu } from "../plate-ui/ai-menu";
import { AIAnchorElement, AILeaf } from "../plate-ui/ai-node";
import { CursorOverlayKit } from "./cursor-overlay-kit";
import { MarkdownKit } from "./markdown-kit";

export const aiChatPlugin = AIChatPlugin.extend({
  options: {
    chatOptions: {
      api: "/api/ai/command",
      body: {},
    },
  },
  render: {
    afterContainer: AILoadingBar,
    afterEditable: AIMenu,
    node: AIAnchorElement,
  },
  shortcuts: { show: { keys: "mod+j" } },
  useHooks: ({ editor, getOption }) => {
    useAiCommand();

    const mode = usePluginOption(AIChatPlugin, "mode");
    const toolName = usePluginOption(AIChatPlugin, "toolName");
    useChatChunk({
      onChunk: ({ chunk, isFirst, nodes, text: content }) => {
        if (isFirst && mode === "insert") {
          editor.tf.withoutSaving(() => {
            editor.tf.insertNodes(
              {
                children: [{ text: "" }],
                type: getPluginType(editor, KEYS.aiChat),
              },
              {
                at: PathApi.next(editor.selection!.focus.path.slice(0, 1)),
              },
            );
          });
          editor.setOption(AIChatPlugin, "streaming", true);
        }

        if (mode === "insert" && nodes.length > 0) {
          withAIBatch(
            editor,
            () => {
              if (!getOption("streaming")) return;
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

        if (toolName === "edit" && mode === "chat") {
          withAIBatch(
            editor,
            () => {
              try {
                applyAISuggestions(editor, content);
              } catch {}
            },
            {
              split: isFirst,
            },
          );
        }
      },
      onFinish: () => {
        editor.getApi(AIChatPlugin).aiChat.stop();
      },
    });
  },
});

export const AIKit = [
  ...CursorOverlayKit,
  ...MarkdownKit,
  AIPlugin.withComponent(AILeaf),
  aiChatPlugin,
];
