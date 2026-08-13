"use client";

import { aiChatPlugin } from "@/editor/plugins/ai-kit";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react";
import { AIChatPlugin } from "@platejs/ai/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEditorRef, usePluginOption } from "platejs/react";
import * as React from "react";

export type TToolName = "comment" | "edit" | "generate";

export type TComment = {
  comment: {
    blockId: string;
    comment: string;
    content: string;
  } | null;
  status: "finished" | "streaming";
};

export type TMessageDataPart = {
  toolName: TToolName;
  comment?: TComment;
};

export type TChat = UseChatHelpers<TChatMessage>;

export type TChatMessage = UIMessage<Record<string, never>, TMessageDataPart>;

export const useAiCommand = () => {
  const editor = useEditorRef();
  const options = usePluginOption(aiChatPlugin, "chatOptions");

  const baseChat = useBaseChat<TChatMessage>({
    id: "editor",
    transport: new DefaultChatTransport({
      api: options.api || "/api/ai/command",
      body: {
        ...(getAICredential() || {}),
      },
    }),
    onData(data) {
      if (data.type === "data-toolName") {
        editor.setOption(AIChatPlugin, "toolName", data.data);
      }
      if (
        data.type === "data-comment" &&
        data.data &&
        data.data.status === "finished"
      ) {
        editor.getApi(BlockSelectionPlugin).blockSelection.deselect();
        return;
      }
    },
    ...options,
  });

  const chat = {
    ...baseChat,
  };

  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.setOption(AIChatPlugin, "chat", chat as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.messages, chat.error]);

  return chat;
};
