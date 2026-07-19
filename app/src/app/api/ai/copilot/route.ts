import { AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import {
  createGoogle,
  GoogleProvider,
} from "@ai-sdk/google";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { createXai, XaiProvider } from "@ai-sdk/xai";
import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const {
    apiKey: key,
    model = "gpt-4o-mini",
    provider = "openai",
    prompt,
    instructions,
  } = await req.json();

  if (!prompt || prompt.length > 1000) {
    return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
  }

  const apiKey = key || process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ai gateway API key." },
      { status: 401 },
    );
  }

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
    const result = await generateText({
      abortSignal: req.signal,
      maxOutputTokens: 50,
      model: aiProvider(model),
      prompt,
      instructions,
      temperature: 0.7,
    });

    return NextResponse.json({ ...result, text: result.text });
  } catch (error) {
    console.log({ error });
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(null, { status: 408 });
    }

    return NextResponse.json(
      { error: "Failed to process AI request" },
      { status: 500 },
    );
  }
}
