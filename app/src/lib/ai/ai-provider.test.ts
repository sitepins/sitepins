import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDefaultProvider,
  getProviderApiKey,
  getSafeInputCharLimit,
  getSafeMaxOutputTokens,
  hasAvailableApiKey,
  PROVIDER_DEFAULT_MODELS,
  resolveLanguageModel,
  SUPPORTED_AI_PROVIDERS,
} from "./ai-provider";

describe("ai-provider service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("SUPPORTED_AI_PROVIDERS", () => {
    it("contains the expected 6 core providers", () => {
      expect(SUPPORTED_AI_PROVIDERS).toEqual([
        "groq",
        "openrouter",
        "openai",
        "gemini",
        "anthropic",
        "xai",
      ]);
    });
  });

  describe("getDefaultProvider", () => {
    it("honors AI_PROVIDER environment variable", () => {
      process.env.AI_PROVIDER = "openrouter";
      expect(getDefaultProvider()).toBe("openrouter");
    });

    it("auto-detects provider from AI_API_KEY prefix", () => {
      process.env.AI_API_KEY = "gsk_test_groq_prefix";
      expect(getDefaultProvider()).toBe("groq");

      process.env.AI_API_KEY = "sk-or-v1-openrouter_prefix";
      expect(getDefaultProvider()).toBe("openrouter");

      process.env.AI_API_KEY = "sk-ant-anthropic_prefix";
      expect(getDefaultProvider()).toBe("anthropic");

      process.env.AI_API_KEY = "AIza_google_prefix";
      expect(getDefaultProvider()).toBe("gemini");

      process.env.AI_API_KEY = "xai-test_prefix";
      expect(getDefaultProvider()).toBe("xai");

      process.env.AI_API_KEY = "sk-openai_prefix";
      expect(getDefaultProvider()).toBe("openai");
    });

    it("defaults to groq when no keys are configured", () => {
      expect(getDefaultProvider()).toBe("groq");
    });
  });

  describe("getProviderApiKey", () => {
    it("prefers client-supplied API key", () => {
      process.env.AI_API_KEY = "server_groq_key";
      const key = getProviderApiKey("groq", "client_custom_key");
      expect(key).toBe("client_custom_key");
    });

    it("falls back to server-configured AI_API_KEY", () => {
      process.env.AI_API_KEY = "server_unified_key";
      const key = getProviderApiKey("openrouter");
      expect(key).toBe("server_unified_key");
    });

    it("ignores placeholder keys", () => {
      process.env.AI_API_KEY = "your_groq_api_key";
      const key = getProviderApiKey("groq");
      expect(key).toBeUndefined();
    });
  });

  describe("hasAvailableApiKey", () => {
    it("returns true if client key or server key exists", () => {
      expect(hasAvailableApiKey("groq")).toBe(false);
      process.env.AI_API_KEY = "gsk_12345";
      expect(hasAvailableApiKey("groq")).toBe(true);
    });
  });

  describe("resolveLanguageModel", () => {
    it("throws a descriptive error when no API key is available", () => {
      expect(() => resolveLanguageModel({ provider: "groq" })).toThrow(
        /API key for provider "groq" is not configured/,
      );
    });

    it("resolves Groq language model instance when key is provided", () => {
      const resolved = resolveLanguageModel({
        provider: "groq",
        apiKey: "gsk_dummy_test_key_for_resolution",
      });
      expect(resolved.provider).toBe("groq");
      expect(resolved.modelName).toBe(PROVIDER_DEFAULT_MODELS.groq);
      expect(resolved.model).toBeDefined();
    });

    it("normalizes Groq model names missing vendor prefix", () => {
      const resolved = resolveLanguageModel({
        provider: "groq",
        apiKey: "gsk_dummy_test_key_for_resolution",
        model: "qwen3.8-27b",
      });
      expect(resolved.modelName).toBe("qwen/qwen3.8-27b");

      const resolved2 = resolveLanguageModel({
        provider: "groq",
        apiKey: "gsk_dummy_test_key_for_resolution",
        model: "qwen3.6-27b",
      });
      expect(resolved2.modelName).toBe("qwen/qwen3.6-27b");
    });

    it("resolves OpenRouter language model instance when key is provided", () => {
      const resolved = resolveLanguageModel({
        provider: "openrouter",
        apiKey: "sk-or-v1-dummy_test_key",
        model: "google/gemini-2.0-flash-exp:free",
      });
      expect(resolved.provider).toBe("openrouter");
    });
  });

  describe("getSafeMaxOutputTokens", () => {
    it("returns requested output tokens without artificial truncation", () => {
      expect(getSafeMaxOutputTokens("groq", "qwen/qwen3.8-27b", 4096)).toBe(
        4096,
      );
      expect(getSafeMaxOutputTokens("groq", "qwen/qwen3.6-27b", 2048)).toBe(
        2048,
      );
      expect(getSafeMaxOutputTokens("groq", "openai/gpt-oss-120b", 4096)).toBe(
        4096,
      );
      expect(
        getSafeMaxOutputTokens("openrouter", "qwen/qwen-2.5-coder", 4096),
      ).toBe(4096);
    });
  });

  describe("getSafeInputCharLimit", () => {
    it("caps input characters for Groq Qwen models to prevent 7,000 ITPM limit failure", () => {
      expect(getSafeInputCharLimit("groq", "qwen/qwen3.8-27b", 80_000)).toBe(
        8_000,
      );
    });

    it("leaves input limit at default for other models", () => {
      expect(getSafeInputCharLimit("groq", "openai/gpt-oss-120b", 80_000)).toBe(
        80_000,
      );
    });
  });
});
