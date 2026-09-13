import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  getSafeInputCharLimit,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    code,
    filePath,
    language,
    framework,
    apiKey,
    provider,
    model,
    instruction,
  } = await req.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Code snippet is required" },
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

  const hasCustomInstruction = Boolean(
    instruction && typeof instruction === "string" && instruction.trim(),
  );

  const systemPrompt = `You are an expert technical code analyst for Sitepins CMS.
You explain web development code, templates, and configurations clearly and concisely.

Context:
- File path: ${filePath || "unknown"}
- Framework: ${framework || "static"}
- Language: ${language || "plaintext"}

Format your response in GitHub flavored markdown.${
    hasCustomInstruction
      ? `\n\nThe user's specific inquiry is: "${instruction.trim()}". Directly and thoroughly answer what they asked about this code, referencing specific lines and functions as needed.`
      : `
1. **Summary**: A concise 1-2 sentence overview of what this code does.
2. **Breakdown**: Explain the key components, template blocks, loops, conditions, or functions.
3. **Framework Notes**: If relevant (e.g. Hugo template blocks, Astro components, Next.js rendering, or Tailwind classes), mention best practices or important considerations.`
  }`;

  // Cap code input to prevent token exhaustion and rate limits
  const safeCharLimit = getSafeInputCharLimit(
    resolved.provider,
    resolved.modelName,
    50_000,
  );
  const safeCode = code.slice(0, safeCharLimit);

  const maxOutputTokens = getSafeMaxOutputTokens(
    resolved.provider,
    resolved.modelName,
    1500,
  );

  const userPrompt = `File: ${filePath || "code"}
${framework ? `Framework: ${framework}\n` : ""}${language ? `Language: ${language}\n` : ""}${
    hasCustomInstruction ? `User Question/Inquiry: ${instruction.trim()}\n` : ""
  }Code:
\`\`\`${language || ""}
${safeCode}
\`\`\``;

  try {
    const result = streamText({
      model: resolved.model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    return handleAiRouteError(error, "Failed to explain code");
  }
}
