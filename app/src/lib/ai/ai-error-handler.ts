import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

type AiErrorResponse = {
  error: string;
  code?: string;
};

/**
 * Extracts a user-friendly error message and appropriate HTTP status code
 * from AI SDK errors (AI_RetryError, AI_APICallError) and generic errors.
 *
 * Usage in route handlers:
 *   } catch (error) {
 *     return handleAiRouteError(error);
 *   }
 */
export function handleAiRouteError(
  error: unknown,
  fallbackMessage = "Failed to process AI request",
): NextResponse<AiErrorResponse> {
  // Extract the most useful error from the chain
  const root = extractRootCause(error);

  const statusCode = getStatusCode(root);
  const message = getUserFacingMessage(root, statusCode, fallbackMessage);
  const code = getErrorCode(root);

  logger.error("AI route error", {
    message,
    statusCode,
    code,
    originalError: root instanceof Error ? root.message : String(root),
  });

  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status: statusCode },
  );
}

/**
 * Walks the AI SDK error chain to find the innermost actionable error.
 * AI_RetryError wraps multiple AI_APICallError instances; we want the last one.
 */
function extractRootCause(error: unknown): unknown {
  if (!error || typeof error !== "object") return error;

  const err = error as Record<string, unknown>;

  // AI_RetryError has a `lastError` property
  if (err.name === "AI_RetryError" && err.lastError) {
    return err.lastError;
  }

  return error;
}

function getStatusCode(error: unknown): number {
  if (!error || typeof error !== "object") return 500;

  const err = error as Record<string, unknown>;

  // AI_APICallError has a `statusCode` property
  if (typeof err.statusCode === "number") {
    // Map provider status codes to appropriate proxy codes
    if (err.statusCode === 429) return 429;
    if (err.statusCode === 413) return 413;
    if (err.statusCode === 401 || err.statusCode === 403) return 401;
    if (err.statusCode === 400) return 400;
  }

  // AbortError (client disconnected)
  if (err.name === "AbortError") return 408;

  return 500;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  // Try to parse the responseBody for provider-specific error codes
  if (typeof err.responseBody === "string") {
    try {
      const body = JSON.parse(err.responseBody);
      if (body?.error?.code) return body.error.code as string;
      if (body?.error?.type) return body.error.type as string;
    } catch {
      // Not JSON, skip
    }
  }

  return undefined;
}

function getUserFacingMessage(
  error: unknown,
  statusCode: number,
  fallbackMessage: string,
): string {
  if (!error || typeof error !== "object") return fallbackMessage;

  const err = error as Record<string, unknown>;
  const rawBody = typeof err.responseBody === "string" ? err.responseBody : "";
  const errMessage = err instanceof Error ? err.message : "";
  const combined = `${rawBody} ${errMessage}`.toLowerCase();

  // Rate limit exceeded or Payload Too Large (token limits, TPM, ITPM, OTPM, payload limits)
  if (statusCode === 413 || statusCode === 429) {
    if (
      combined.includes("itpm") ||
      combined.includes("input token") ||
      combined.includes("input tokens per minute")
    ) {
      return "The content exceeds this model's input token limit. Try selecting a smaller code snippet or choose a model with a higher token limit in AI Agent settings.";
    }
    if (
      combined.includes("otpm") ||
      combined.includes("output token") ||
      combined.includes("output tokens per minute")
    ) {
      return "The response exceeded this model's output token limit. Try requesting a shorter change or select a model with higher output limits in AI Agent settings.";
    }
    if (
      statusCode === 413 ||
      combined.includes("payload too large") ||
      combined.includes("request too large")
    ) {
      return "The request exceeds this model's size limit. Try selecting a specific code block to edit or switch to a model with a larger context window in AI Agent settings.";
    }
    return "AI provider rate limit exceeded. Please wait a moment and try again, or switch models in AI Agent settings.";
  }

  // Auth errors
  if (statusCode === 401 || statusCode === 403) {
    return "Invalid or expired API key. Please check your AI Agent settings.";
  }

  // Bad request (model not found, unsupported model, context length exceeded, etc.)
  if (statusCode === 400) {
    if (
      combined.includes("model") &&
      (combined.includes("not found") ||
        combined.includes("does not exist") ||
        combined.includes("access"))
    ) {
      return "The selected model is not available or not supported by your configured provider. Please check your AI Agent settings.";
    }
    if (
      combined.includes("maximum context length") ||
      combined.includes("context_length_exceeded")
    ) {
      return "The content exceeds the model's maximum context length. Please select a smaller snippet or switch to a model with a larger context window.";
    }
    return "Invalid AI request. Please check your prompt and try again.";
  }

  // Client disconnected
  if (statusCode === 408) {
    return "Request was cancelled.";
  }

  // Service unavailable or gateway errors
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }

  // Generic error with a message
  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallbackMessage;
}
