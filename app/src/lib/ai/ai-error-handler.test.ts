import { describe, expect, it } from "vitest";
import { handleAiRouteError } from "./ai-error-handler";

describe("handleAiRouteError", () => {
  it("handles 401 unauthorized errors with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 401,
      message: "Unauthorized",
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe(
      "Invalid or expired API key. Please check your AI Agent settings.",
    );
  });

  it("handles 413 ITPM input token rate limits with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 413,
      responseBody: JSON.stringify({
        error: {
          message:
            "Request too large on input tokens per minute (ITPM): Limit 7000, Requested 7293",
          type: "tokens",
          code: "rate_limit_exceeded",
        },
      }),
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe(
      "The content exceeds this model's input token limit. Try selecting a smaller code snippet or choose a model with a higher token limit in AI Agent settings.",
    );
    expect(body.code).toBe("rate_limit_exceeded");
    // Ensure no provider-specific terms like Groq or specific model names are present
    expect(body.error).not.toMatch(/groq/i);
    expect(body.error).not.toMatch(/llama/i);
  });

  it("handles 429 OTPM output token rate limits with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          message: "Exceeded rate limit for output tokens per minute (OTPM)",
        },
      }),
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(
      "The response exceeded this model's output token limit. Try requesting a shorter change or select a model with higher output limits in AI Agent settings.",
    );
    expect(body.error).not.toMatch(/groq/i);
  });

  it("handles generic 413 payload too large with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 413,
      message: "Payload Too Large",
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe(
      "The request exceeds this model's size limit. Try selecting a specific code block to edit or switch to a model with a larger context window in AI Agent settings.",
    );
    expect(body.error).not.toMatch(/groq/i);
  });

  it("handles generic 429 rate limit with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 429,
      message: "Too Many Requests",
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(
      "AI provider rate limit exceeded. Please wait a moment and try again, or switch models in AI Agent settings.",
    );
    expect(body.error).not.toMatch(/groq/i);
  });

  it("handles 400 model not found errors with provider-agnostic guidance", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message:
            "The model `custom-llm` does not exist or you do not have access to it.",
          code: "model_not_found",
        },
      }),
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe(
      "The selected model is not available or not supported by your configured provider. Please check your AI Agent settings.",
    );
    expect(body.code).toBe("model_not_found");
  });

  it("handles 400 context length exceeded errors", async () => {
    const error = {
      name: "AI_APICallError",
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message:
            "This model's maximum context length is 8192 tokens. However, your messages resulted in 9100 tokens.",
        },
      }),
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe(
      "The content exceeds the model's maximum context length. Please select a smaller snippet or switch to a model with a larger context window.",
    );
  });

  it("handles AbortError as 408", async () => {
    const error = {
      name: "AbortError",
      message: "The user aborted a request.",
    };
    const response = handleAiRouteError(error);
    expect(response.status).toBe(408);
    const body = await response.json();
    expect(body.error).toBe("Request was cancelled.");
  });

  it("unwraps AI_RetryError to extract the root cause", async () => {
    const rootError = {
      name: "AI_APICallError",
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" },
      }),
    };
    const retryError = {
      name: "AI_RetryError",
      lastError: rootError,
      errors: [rootError],
    };
    const response = handleAiRouteError(retryError);
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(
      "AI provider rate limit exceeded. Please wait a moment and try again, or switch models in AI Agent settings.",
    );
    expect(body.code).toBe("rate_limit_exceeded");
  });
});
