import { BaseEditorKit } from "@/editor/plugins/editor-base-kit";
import { ChatMessage } from "@/hooks/use-ai-command";
import { markdownJoinerTransform } from "@/lib/utils/markdown-joiner-transform";
import { AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import {
  createGoogle,
  GoogleProvider,
} from "@ai-sdk/google";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { createXai, XaiProvider } from "@ai-sdk/xai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  LanguageModel,
  Output,
  streamText,
  tool,
  UIMessageStreamWriter,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import { createSlateEditor, nanoid, SlateEditor } from "platejs";
import { z } from "zod/v4";
import { getCommentPrompt, getEditPrompt, getGeneratePrompt } from "./prompts";

export async function POST(req: NextRequest) {
  const {
    apiKey,
    ctx,
    messages: messagesRaw = [],
    model,
    provider,
  } = await req.json();

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing AI Gateway API key." },
      { status: 401 },
    );
  }

  const isSelecting = editor.api.isExpanded();

  let aiProvider:
    | GoogleProvider
    | AnthropicProvider
    | OpenAIProvider
    | XaiProvider;

  switch (provider) {
    case "grok":
      aiProvider = createXai({ apiKey });
      break;
    case "gemini":
      aiProvider = createGoogle({ apiKey });
      break;
    case "anthropic":
      aiProvider = createAnthropic({ apiKey });
      break;
    case "openai":
    default:
      aiProvider = createOpenAI({ apiKey });
      break;
  }

  try {
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam || "generate";

        const stream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: aiProvider(model),
          // Not used
          prompt: "",
          tools: {
            comment: getCommentTool(editor, {
              messagesRaw,
              model: aiProvider(model),
              writer,
            }),
          },
          prepareStep: async (step) => {
            if (toolName === "comment") {
              return {
                ...step,
                toolChoice: { toolName: "comment", type: "tool" },
              };
            }

            if (toolName === "edit") {
              const editPrompt = getEditPrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              return {
                ...step,
                activeTools: [],
                messages: [
                  {
                    content: editPrompt,
                    role: "user",
                  },
                ],
              };
            }

            if (toolName === "generate") {
              const generatePrompt = getGeneratePrompt(editor, {
                messages: messagesRaw,
              });

              return {
                ...step,
                activeTools: [],
                messages: [
                  {
                    content: generatePrompt,
                    role: "user",
                  },
                ],
                model: aiProvider(model),
              };
            }
          },
        });

        writer.merge(stream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to process AI request" },
      { status: 500 },
    );
  }
}

const getCommentTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  },
) =>
  tool({
    description: "Comment on the content",
    inputSchema: z.object({}),
    execute: async () => {
      const commentSchema = z
        .object({
          blockId: z
            .string()
            .describe(
              "The id of the starting block. If the comment spans multiple blocks, use the id of the first block.",
            ),
          comment: z
            .string()
            .describe("A brief comment or explanation for this fragment."),
          content: z
            .string()
            .describe(
              String.raw`The original document fragment to be commented on.It can be the entire block, a small part within a block, or span multiple blocks. If spanning multiple blocks, separate them with two \n\n.`,
            ),
        })
        .describe("A single comment");

      const commentStream = streamText({
        model,
        output: Output.array({
          element: commentSchema,
          description:
            "A list of inline comments for highlighted editor content.",
        }),
        prompt: getCommentPrompt(editor, {
          messages: messagesRaw,
        }),
      });

      let emittedCount = 0; // partialOutputStream repeats the full array, so send only new items

      for await (const partialComments of commentStream.partialOutputStream) {
        if (!partialComments || partialComments.length === 0) continue;

        const pendingComments = partialComments.slice(emittedCount);
        emittedCount = partialComments.length;

        for (const comment of pendingComments) {
          if (!comment) continue;
          const commentDataId = nanoid();

          writer.write({
            id: commentDataId,
            data: {
              comment,
              status: "streaming",
            },
            type: "data-comment",
          });
        }
      }

      writer.write({
        id: nanoid(),
        data: {
          comment: null,
          status: "finished",
        },
        type: "data-comment",
      });
    },
  });
