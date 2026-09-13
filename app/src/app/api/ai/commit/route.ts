import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  extractJsonFromText,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { computeUnifiedDiff } from "@/lib/utils/diff";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    apiKey,
    provider,
    model,
    filePath,
    originalContent,
    content,
    diffContext,
  } = await req.json();

  if (!filePath && !content && !originalContent) {
    return NextResponse.json(
      { error: "Content or file path is required" },
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

  const fileName = filePath ? filePath.split("/").pop() || "file" : "file";
  const { diff, addedLines, deletedLines, isNewFile } = computeUnifiedDiff(
    originalContent || "",
    content || "",
    fileName,
  );

  const systemPrompt = `You are an expert Git commit assistant for Sitepins, a Git-based headless CMS.
Analyze the provided Git diff (or file content) to generate an accurate, semantic conventional commit message and a brief bulleted description.

CRITICAL INSTRUCTIONS:
1. Base your response STRICTLY ON THE DIFF (what was added, removed, or modified).
2. DO NOT claim that a document or blog was created if it is an existing file being updated.
   - If a section, paragraph, or lines were removed (lines marked with '-'), describe the removal or reduction (e.g. "refactor(blog): remove application build guide section", "docs(post): remove outdated steps", "refactor: trim section on ...").
   - If lines were modified or added to an existing file, describe the specific changes (e.g. "docs(blog): update introduction", "feat(post): add FAQ section").
   - ONLY use "feat: add [title]" if isNewFile is true (the entire file is created from scratch).
3. Conventional commit format for "message":
   - Format: <type>(<scope>): <short description>
   - Common types: feat, fix, docs, refactor, chore, style.
   - Max 72 characters.
4. "description": 2 to 4 concise bullet points starting with "- " describing the specific modifications shown in the diff.

Return ONLY a valid JSON object matching this exact TypeScript structure:
{
  "message": string,
  "description": string
}`;

  const userPrompt = `File Path: ${filePath || "unknown"}
Status: ${isNewFile ? "Brand new file created" : "Existing file edited"}
Lines Added: ${addedLines}
Lines Deleted: ${deletedLines}

${diffContext ? `Context:\n${diffContext}\n` : ""}
${
  diff
    ? `Git Diff:\n\`\`\`diff\n${diff.slice(0, 4500)}\n\`\`\``
    : `Current Content Sample:\n\`\`\`\n${(content || "").slice(0, 3000)}\n\`\`\``
}

Generate the conventional commit message and description accurately reflecting the diff.`;

  try {
    const result = await generateText({
      abortSignal: req.signal,
      model: resolved.model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 256,
    });

    let parsed: { message?: string; description?: string } = {};
    try {
      parsed = extractJsonFromText<{ message?: string; description?: string }>(
        result.text,
      );
    } catch {
      // Fall back gracefully below
    }

    return NextResponse.json({
      message:
        parsed.message ||
        (filePath
          ? `docs: update ${filePath.split("/").pop()}`
          : "docs: update content"),
      description: parsed.description || "",
    });
  } catch (error) {
    // For commit messages, provide a reasonable fallback even on error
    const isParseError = error instanceof SyntaxError;
    if (isParseError) {
      const fallbackMessage = filePath
        ? `docs: update ${filePath.split("/").pop()}`
        : "docs: update content";
      return NextResponse.json({
        message: fallbackMessage,
        description: "- Updated content and metadata in CMS editor",
      });
    }
    return handleAiRouteError(error, "Failed to generate commit message");
  }
}
