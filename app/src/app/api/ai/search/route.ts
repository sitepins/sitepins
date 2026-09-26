import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  extractJsonFromText,
  getSafeInputCharLimit,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import {
  buildSearchAssistPrompt,
  sanitizeSearchAssistResult,
  TSearchIndexFile,
} from "@/lib/ai/search-assist";
import { getAuth } from "@/lib/auth/auth-server";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const MAX_INDEX_FILES = 5000;

/**
 * Picks the project files whose contents Copilot should read to answer a
 * question (see lib/ai/search-assist.ts).
 */
export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, files = [], apiKey, provider, model } = await req.json();

  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  if (!trimmedQuery) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const safeFiles: TSearchIndexFile[] = (Array.isArray(files) ? files : [])
    .filter(
      (f: Partial<TSearchIndexFile>) =>
        f && Number.isInteger(f.id) && typeof f.path === "string",
    )
    .slice(0, MAX_INDEX_FILES);
  if (safeFiles.length === 0) {
    return NextResponse.json({ fileIds: [] });
  }

  let resolved: ReturnType<typeof resolveLanguageModel>;
  try {
    resolved = resolveLanguageModel({ apiKey, model, provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Missing AI API key.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const { system, prompt } = buildSearchAssistPrompt({
    query: trimmedQuery.slice(0, 1000),
    files: safeFiles,
    today: new Date().toISOString().slice(0, 10),
    // Leave headroom for the instructions and the question.
    maxIndexChars: Math.max(
      2_000,
      getSafeInputCharLimit(resolved.provider, resolved.modelName, 60_000) -
        4_000,
    ),
  });

  try {
    const response = await generateText({
      model: resolved.model,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: getSafeMaxOutputTokens(
        resolved.provider,
        resolved.modelName,
        256,
      ),
    });

    let parsed: unknown = {};
    try {
      parsed = extractJsonFromText(response.text);
    } catch {
      // An unparseable answer is treated as "no files".
    }

    return NextResponse.json(
      sanitizeSearchAssistResult(parsed, {
        fileIds: new Set(safeFiles.map((f) => f.id)),
      }),
    );
  } catch (error) {
    return handleAiRouteError(error, "AI file lookup failed");
  }
}
