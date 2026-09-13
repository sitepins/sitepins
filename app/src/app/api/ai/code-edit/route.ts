import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  getSafeInputCharLimit,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { logger } from "@/lib/logger";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    instruction,
    selectedCode,
    fullContent,
    filePath,
    language,
    framework,
    apiKey,
    provider,
    model,
  } = await req.json();

  if (!instruction || typeof instruction !== "string") {
    return NextResponse.json(
      { error: "Instruction is required" },
      { status: 400 },
    );
  }

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

  const hasSelection = Boolean(selectedCode && selectedCode.trim());

  // Cap input size to prevent token exhaustion and rate limits (e.g. Groq 7,000 ITPM on Qwen)
  const safeCharLimit = getSafeInputCharLimit(
    resolved.provider,
    resolved.modelName,
    80_000,
  );
  const safeFullContent = (fullContent || "").slice(0, safeCharLimit);
  const safeSelectedCode = (selectedCode || "").slice(0, safeCharLimit);

  // Safe output tokens: allow sufficient completion tokens so complete files/functions are not truncated.
  const maxOutputTokens = getSafeMaxOutputTokens(
    resolved.provider,
    resolved.modelName,
    hasSelection ? 4096 : 8192,
  );

  const systemPrompt = `You are an expert AI code copilot embedded inside the Sitepins code editor.
You specialize in modern web development, template engines, and static site generators (including Hugo templates, Go html/template syntax, Astro components, Next.js / React JSX/TSX, HTML5, CSS/Tailwind, and Markdown/MDX).

Task context:
- File path: ${filePath || "unknown"}
- Framework: ${framework || "static"}
- Language: ${language || "plaintext"}

RULES:
1. Output ONLY the raw replacement code that implements the user's instructions.
2. DO NOT wrap the output in markdown code blocks or backticks (do NOT output \`\`\` or \`\`\`html). Output strictly the code characters.
3. DO NOT include any conversational responses, greetings, notes, or explanations.
4. ${hasSelection ? "Replace ONLY the selected code snippet. Ensure the replacement fits cleanly into the surrounding code." : "Provide the complete modified file content."}
5. Maintain consistent indentation, syntax conventions, and code formatting.
6. Keep the response concise — output only the changed code, not the entire file when editing a selection.`;

  const userPrompt = `File: ${filePath || "code"}
${framework ? `Framework: ${framework}\n` : ""}${language ? `Language: ${language}\n` : ""}
${hasSelection ? `Selected Code to modify:\n\`\`\`\n${safeSelectedCode}\n\`\`\`\n\n` : `Full File Content:\n\`\`\`\n${safeFullContent}\n\`\`\`\n\n`}Instruction: ${instruction}`;

  try {
    const result = streamText({
      model: resolved.model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2,
      maxOutputTokens,
      onError: ({ error }) => {
        logger.error("AI code-edit stream error", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    return handleAiRouteError(error, "Failed to execute AI code edit");
  }
}
