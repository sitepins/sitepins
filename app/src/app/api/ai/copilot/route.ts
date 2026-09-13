import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import { resolveLanguageModel } from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // This route can fall back to the server's own AI_API_KEY, so an
  // unauthenticated caller could spend the deployment's AI budget.
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    apiKey: key,
    model,
    provider,
    prompt,
    instructions,
  } = await req.json();

  if (!prompt || prompt.length > 1000) {
    return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
  }

  let resolved: ReturnType<typeof resolveLanguageModel>;
  try {
    resolved = resolveLanguageModel({
      apiKey: key,
      model,
      provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Missing AI API key.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const result = await generateText({
      abortSignal: req.signal,
      maxOutputTokens: 50,
      model: resolved.model,
      prompt,
      instructions,
      temperature: 0.7,
    });

    return NextResponse.json({ ...result, text: result.text });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(null, { status: 408 });
    }
    return handleAiRouteError(error, "Failed to process AI request");
  }
}
