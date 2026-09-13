import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

export type TAiProviderType =
  "groq" | "openrouter" | "openai" | "gemini" | "anthropic" | "xai";

export const PROVIDER_DEFAULT_MODELS: Record<TAiProviderType, string> = {
  groq: "openai/gpt-oss-120b",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-4-5",
  xai: "grok-4-1-fast-non-reasoning",
};

export const SUPPORTED_AI_PROVIDERS: readonly TAiProviderType[] = [
  "groq",
  "openrouter",
  "openai",
  "gemini",
  "anthropic",
  "xai",
] as const;

/**
 * Returns safe maximum output tokens considering provider and model constraints.
 * On Groq's free tier, Qwen models enforce a strict 1,000 Output Tokens Per Minute (OTPM) limit.
 */
export function getSafeMaxOutputTokens(
  _provider: string,
  _modelName: string,
  requested = 4096,
): number {
  return requested;
}

/**
 * Returns safe maximum input character limit to prevent token exhaustion or ITPM rate limit errors.
 * On Groq's free tier, Qwen models enforce a strict 7,000 Input Tokens Per Minute (ITPM) limit.
 */
export function getSafeInputCharLimit(
  provider: string,
  modelName: string,
  defaultLimit = 80_000,
): number {
  if (provider === "groq" && modelName.toLowerCase().includes("qwen")) {
    return Math.min(defaultLimit, 8_000); // ~3,200 tokens in code, safely within 7,000 ITPM
  }
  return defaultLimit;
}

/**
 * Resolves configured API key for a given provider or falls back to server env variables.
 */
export function getProviderApiKey(
  provider: TAiProviderType,
  clientApiKey?: string,
): string | undefined {
  if (clientApiKey && clientApiKey.trim()) {
    return clientApiKey.trim();
  }

  const key = process.env.AI_API_KEY?.trim();

  if (
    key &&
    !key.startsWith("sk-proj-xxx") &&
    !key.includes("your_") &&
    !key.includes("placeholder")
  ) {
    return key;
  }

  return undefined;
}

/**
 * Identifies the default provider from server environment variables or fallbacks.
 */
export function getDefaultProvider(): TAiProviderType {
  const envProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (
    envProvider &&
    (SUPPORTED_AI_PROVIDERS as readonly string[]).includes(envProvider)
  ) {
    return envProvider as TAiProviderType;
  }

  const fallbackKey = process.env.AI_API_KEY?.trim();
  if (fallbackKey) {
    if (fallbackKey.startsWith("gsk_")) return "groq";
    if (fallbackKey.startsWith("sk-or-")) return "openrouter";
    if (fallbackKey.startsWith("AIza") || fallbackKey.startsWith("AQ."))
      return "gemini";
    if (fallbackKey.startsWith("sk-ant-")) return "anthropic";
    if (fallbackKey.startsWith("xai-")) return "xai";
    if (fallbackKey.startsWith("sk-")) return "openai";
  }

  return "groq";
}

/**
 * Checks whether any API key is available (client-supplied or server-configured).
 */
export function hasAvailableApiKey(
  provider?: string,
  clientApiKey?: string,
): boolean {
  const raw = provider?.trim().toLowerCase();
  const p =
    raw && (SUPPORTED_AI_PROVIDERS as readonly string[]).includes(raw)
      ? (raw as TAiProviderType)
      : getDefaultProvider();
  return Boolean(getProviderApiKey(p, clientApiKey));
}

/**
 * Resolves a LanguageModel instance with proper provider, endpoint, model, and headers.
 */
export function resolveLanguageModel(options?: {
  provider?: string;
  model?: string;
  apiKey?: string;
}): {
  model: LanguageModel;
  provider: TAiProviderType;
  modelName: string;
} {
  const raw = options?.provider?.trim().toLowerCase();
  const provider =
    raw && (SUPPORTED_AI_PROVIDERS as readonly string[]).includes(raw)
      ? (raw as TAiProviderType)
      : getDefaultProvider();
  const apiKey = getProviderApiKey(provider, options?.apiKey);

  if (!apiKey) {
    throw new Error(
      `API key for provider "${provider}" is not configured. Please add an API key in your AI Agent settings or set AI_API_KEY in the environment.`,
    );
  }

  let modelName = options?.model?.trim() || process.env.AI_MODEL?.trim();
  if (!modelName) {
    modelName =
      PROVIDER_DEFAULT_MODELS[provider] || PROVIDER_DEFAULT_MODELS.groq;
  }

  // Normalize vendor prefix for Groq models if missing
  if (provider === "groq") {
    if (modelName === "qwen3.8-27b") modelName = "qwen/qwen3.8-27b";
    else if (modelName === "qwen3.6-27b") modelName = "qwen/qwen3.6-27b";
    else if (
      modelName === "qwen3-32b" ||
      modelName === "gemma2-9b-it" ||
      modelName === "llama-3.3-70b-versatile" ||
      modelName === "llama-3.1-8b-instant"
    ) {
      modelName = PROVIDER_DEFAULT_MODELS.groq;
    }
  }

  let modelInstance: LanguageModel;

  switch (provider) {
    case "groq": {
      const groqProvider = createOpenAI({
        apiKey,
        baseURL: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1",
      });
      modelInstance = groqProvider.chat(modelName);
      break;
    }
    case "openrouter": {
      const openRouterProvider = createOpenAI({
        apiKey,
        baseURL: process.env.AI_BASE_URL || "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_BRAND_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            "https://sitepins.com",
          "X-Title":
            process.env.NEXT_PUBLIC_BRAND_NAME || "Sitepins Headless CMS",
        },
      });
      modelInstance = openRouterProvider.chat(modelName);
      break;
    }
    case "gemini": {
      const googleProvider = createGoogle({ apiKey });
      modelInstance = googleProvider(modelName);
      break;
    }
    case "anthropic": {
      const anthropicProvider = createAnthropic({ apiKey });
      modelInstance = anthropicProvider(modelName);
      break;
    }
    case "xai": {
      const xaiProvider = createXai({ apiKey });
      modelInstance = xaiProvider(modelName);
      break;
    }
    case "openai":
    default: {
      const openaiProvider = createOpenAI({
        apiKey,
        baseURL: process.env.AI_BASE_URL,
      });
      modelInstance = openaiProvider(modelName);
      break;
    }
  }

  return {
    model: modelInstance,
    provider,
    modelName,
  };
}

function escapeControlCharsInJsonStrings(jsonStr: string): string {
  let inString = false;
  let isEscaped = false;
  let result = "";

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (inString) {
      if (char === "\\") {
        isEscaped = !isEscaped;
        result += char;
      } else if (char === '"' && !isEscaped) {
        inString = false;
        result += char;
      } else {
        isEscaped = false;
        if (char === "\n") {
          result += "\\n";
        } else if (char === "\r") {
          result += "\\r";
        } else if (char === "\t") {
          result += "\\t";
        } else if (char.charCodeAt(0) < 32) {
          result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        } else {
          result += char;
        }
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }

  return result;
}

function tryParseCandidate<T>(candidate: string): T | null {
  try {
    return JSON.parse(candidate) as T;
  } catch {}

  try {
    const noTrailing = candidate.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(noTrailing) as T;
  } catch {}

  try {
    const escaped = escapeControlCharsInJsonStrings(candidate);
    return JSON.parse(escaped) as T;
  } catch {}

  try {
    const escaped = escapeControlCharsInJsonStrings(candidate);
    const noTrailing = escaped.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(noTrailing) as T;
  } catch {}

  return null;
}

/**
 * Robustly extracts and parses a JSON object from an LLM response string.
 * Handles markdown fences, nested code blocks, unescaped newlines in strings,
 * <think> tags, conversational text, and trailing commas.
 */
export function extractJsonFromText<T = Record<string, unknown>>(
  text: string,
): T {
  let cleaned = (text || "").trim();

  // Strip <think>...</think> tags from reasoning models
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip outermost markdown code fences if wrapped around the entire response
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
  }

  // 1. Direct parse attempt
  const direct = tryParseCandidate<T>(cleaned);
  if (direct !== null) return direct;

  // 2. Outermost curly braces { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const braceCandidate = cleaned.slice(firstBrace, lastBrace + 1);
    const parsedBrace = tryParseCandidate<T>(braceCandidate);
    if (parsedBrace !== null) return parsedBrace;
  }

  // 3. Outermost square brackets [ ... ]
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const bracketCandidate = cleaned.slice(firstBracket, lastBracket + 1);
    const parsedBracket = tryParseCandidate<T>(bracketCandidate);
    if (parsedBracket !== null) return parsedBracket;
  }

  // 4. Any markdown code block inside the text
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    const blockContent = match[1].trim();
    const parsedBlock = tryParseCandidate<T>(blockContent);
    if (parsedBlock !== null) return parsedBlock;
  }

  throw new SyntaxError(
    `Could not extract valid JSON from AI response: ${cleaned.slice(0, 100)}`,
  );
}
