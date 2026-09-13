import { BaseEditorKit } from "@/editor/plugins/editor-base-kit";
import { TChatMessage } from "@/hooks/use-ai-command";
import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { markdownJoinerTransform } from "@/lib/utils/markdown-joiner-transform";
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
  // Editor-only surface — don't let anonymous callers relay through it.
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let resolved: ReturnType<typeof resolveLanguageModel>;
  try {
    resolved = resolveLanguageModel({
      apiKey,
      model,
      provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Missing AI API key.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const isSelecting = editor.api.isExpanded();

  try {
    const stream = createUIMessageStream<TChatMessage>({
      execute: async ({ writer }) => {
        const toolName = toolNameParam || "generate";

        const stream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: resolved.model,
          maxOutputTokens: getSafeMaxOutputTokens(
            resolved.provider,
            resolved.modelName,
            2048,
          ),
          // Not used
          prompt: "",
          tools: {
            comment: getCommentTool(editor, {
              messagesRaw,
              model: resolved.model,
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
                model: resolved.model,
              };
            }
          },
        });

        writer.merge(stream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    return handleAiRouteError(error, "AI command request failed");
  }
}

const getCommentTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: TChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<TChatMessage>;
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
