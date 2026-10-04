import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import { resolveLanguageModel } from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apiKey, provider, model } = await req.json();

  // No env fallback: the test must validate the key the user typed.
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  let resolved: ReturnType<typeof resolveLanguageModel>;
  try {
    resolved = resolveLanguageModel({ apiKey, model, provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Missing AI API key.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await generateText({
      abortSignal: req.signal,
      model: resolved.model,
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 32,
      maxRetries: 0,
    });
    return NextResponse.json({
      ok: true,
      provider: resolved.provider,
      model: resolved.modelName,
    });
  } catch (error) {
    return handleAiRouteError(error, "Failed to reach the AI provider");
  }
}
