"use client";

import { CopilotPlugin } from "@platejs/ai/react";
import { serializeMd, stripMarkdown } from "@platejs/markdown";
import type { TElement } from "platejs";
import { GhostText } from "../plate-ui/ghost-text";
import { MarkdownKit } from "./markdown-kit";

export function getAICredential():
  | { provider: string; model: string; apiKey: string; autocomplete: boolean }
  | undefined {
  if (typeof window !== "object") return undefined;
  try {
    const provider = localStorage.getItem("sitepins-ai-provider");
    const model = localStorage.getItem("sitepins-ai-model");
    const apiKey = localStorage.getItem("sitepins-ai-apiKey");
    const autocomplete = localStorage.getItem("sitepins-copilot") === "true";

    if (
      typeof provider !== "string" ||
      typeof model !== "string" ||
      typeof apiKey !== "string"
    ) {
      throw new Error("Invalid AI Credential");
    }
    return {
      provider,
      model,
      apiKey,
      autocomplete,
    };
  } catch {}
  return undefined;
}

export const CopilotKit = [
  ...MarkdownKit,
  CopilotPlugin.configure(({ api }) => {
    const aiCredential = getAICredential();

    return {
      options: {
        completeOptions: {
          api: "/api/ai/copilot",
          body: {
            instructions: systemInstruction,
            apiKey: aiCredential?.apiKey,
            model: aiCredential?.model,
            provider: aiCredential?.provider,
          },
          onError: (error) => {
            console.error("Invalid Copilot Response", error);
          },
          onFinish: (_, completion) => {
            if (completion === "0") return;
            api.copilot.setBlockSuggestion({
              text: stripMarkdown(completion),
            });
          },
        },
        debounceDelay: 500,
        renderGhostText: GhostText,
        getPrompt: ({ editor }) => {
          const aiCredential = getAICredential();
          if (!aiCredential || !aiCredential.autocomplete) return "";

          const contextEntry = editor.api.block({ highest: true });

          if (!contextEntry) return "";

          const prompt = serializeMd(editor, {
            value: [contextEntry[0] as TElement],
          });

          return `Continue the text up to the next punctuation mark:
  """
  ${prompt}
  """`;
        },

        // which element will be triggered
        // triggerQuery: ({ editor }) => {
        //   // Only trigger in paragraph blocks
        //   const block = editor.api.block();
        //   if (!block || block[0].type !== "p") return false;

        //   // Standard checks
        //   // editor.selection &&
        //   //        !editor.api.isExpanded() &&
        //   //        editor.api.isAtEnd();
        //   return true;
        // },

        // when it trigger automatically
        // autoTriggerQuery: ({ editor }) => {
        //   // Custom conditions for auto-triggering
        //   const block = editor.api.block();
        //   if (!block) return false;

        //   const text = editor.api.string(block[0]);

        //   // Trigger after question words
        //   return /\b(what|how|why|when|where)\s*$/i.test(text);
        // },
      },
      shortcuts: {
        accept: {
          keys: "tab",
        },
        acceptNextWord: {
          keys: "mod+right",
        },
        reject: {
          keys: "escape",
        },
        triggerSuggestion: {
          keys: "ctrl+space",
        },
      },
    };
  }),
];

const systemInstruction = `
You are an advanced AI writing assistant, similar to VSCode Copilot but for general text. Your task is to predict and generate the next part of the text based on the given context.

  Rules:
  - Continue the text naturally up to the next punctuation mark (., ,, ;, :, ?, or !).
  - Maintain style and tone. Don't repeat given text.
  - For unclear context, provide the most likely continuation.
  - Handle code snippets, lists, or structured text if needed.
  - Don't include """ in your response.
  - CRITICAL: Always end with a punctuation mark.
  - CRITICAL: Avoid starting a new block. Do not use block formatting like >, #, 1., 2., -, etc. The suggestion should continue in the same block as the context.
  - CRITICAL SPACING RULES: You must analyze the trailing character of the context to determine leading whitespace:
    * Context ends with a space: Do NOT add a leading space.
    * Context ends with an incomplete word: Do NOT add a leading space (e.g., "proje" -> "ct is successful.").
    * Context ends with a complete word or punctuation: You MUST start your response with exactly one space to prevent word merging (e.g., "The project" -> " is successful.").
  - If no context is provided or you can't generate a continuation, return "0" without explanation.
`;
