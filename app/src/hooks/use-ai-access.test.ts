import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateAiAccess,
  isAiAutocompleteEnabled,
  isAiCommitEnabled,
  isAiSearchEnabled,
  isAiSeoEnabled,
  isCodeAiEnabled,
  isEditorAiEnabled,
  subscribeAiSettings,
} from "./use-ai-access";

describe("evaluateAiAccess", () => {
  it("blocks and calls onOpenUpsell when plan does not permit AI", () => {
    const onOpenUpsell = vi.fn();
    const onOpenSettings = vi.fn();

    const allowed = evaluateAiAccess({
      canAccessAi: false,
      hasModel: true,
      onOpenUpsell,
      onOpenSettings,
    });

    expect(allowed).toBe(false);
    expect(onOpenUpsell).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("blocks and calls onOpenSettings when plan permits AI but model is not configured", () => {
    const onOpenUpsell = vi.fn();
    const onOpenSettings = vi.fn();

    const allowed = evaluateAiAccess({
      canAccessAi: true,
      hasModel: false,
      onOpenUpsell,
      onOpenSettings,
    });

    expect(allowed).toBe(false);
    expect(onOpenUpsell).not.toHaveBeenCalled();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("allows access when plan permits AI and model is configured", () => {
    const onOpenUpsell = vi.fn();
    const onOpenSettings = vi.fn();

    const allowed = evaluateAiAccess({
      canAccessAi: true,
      hasModel: true,
      onOpenUpsell,
      onOpenSettings,
    });

    expect(allowed).toBe(true);
    expect(onOpenUpsell).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});

describe("AI feature toggles", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    };

    const listeners = new Map<string, Set<() => void>>();
    const addEventListener = vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    });
    const removeEventListener = vi.fn((event: string, cb: () => void) => {
      listeners.get(event)?.delete(cb);
    });
    const dispatchEvent = (event: string) => {
      listeners.get(event)?.forEach((cb) => cb());
    };

    const g = globalThis as unknown as {
      window: unknown;
      localStorage?: unknown;
      dispatchEvent?: (event: string) => void;
    };
    g.window = {
      localStorage: mockLocalStorage,
      addEventListener,
      removeEventListener,
      dispatchEvent,
    };
    g.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    const g = globalThis as unknown as {
      window: unknown;
      localStorage?: unknown;
    };
    g.window = originalWindow;
    delete g.localStorage;
  });

  it("defaults autocomplete to true when unconfigured", () => {
    expect(isAiAutocompleteEnabled()).toBe(true);
  });

  it("returns false for autocomplete when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-autocomplete", "false");
    expect(isAiAutocompleteEnabled()).toBe(false);
  });

  it("returns true for autocomplete when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-autocomplete", "true");
    expect(isAiAutocompleteEnabled()).toBe(true);
  });

  it("defaults editorAi to true when unconfigured", () => {
    expect(isEditorAiEnabled()).toBe(true);
  });

  it("returns false for editorAi when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-editor", "false");
    expect(isEditorAiEnabled()).toBe(false);
  });

  it("returns true for editorAi when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-editor", "true");
    expect(isEditorAiEnabled()).toBe(true);
  });

  it("defaults codeAi to true when unconfigured", () => {
    expect(isCodeAiEnabled()).toBe(true);
  });

  it("returns false for codeAi when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-code", "false");
    expect(isCodeAiEnabled()).toBe(false);
  });

  it("returns true for codeAi when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-code", "true");
    expect(isCodeAiEnabled()).toBe(true);
  });

  it("defaults commitAi to true when unconfigured", () => {
    expect(isAiCommitEnabled()).toBe(true);
  });

  it("returns false for commitAi when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-commit", "false");
    expect(isAiCommitEnabled()).toBe(false);
  });

  it("returns true for commitAi when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-commit", "true");
    expect(isAiCommitEnabled()).toBe(true);
  });

  it("defaults seoAi to true when unconfigured", () => {
    expect(isAiSeoEnabled()).toBe(true);
  });

  it("returns false for seoAi when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-seo", "false");
    expect(isAiSeoEnabled()).toBe(false);
  });

  it("returns true for seoAi when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-seo", "true");
    expect(isAiSeoEnabled()).toBe(true);
  });

  it("defaults searchAi to true when unconfigured", () => {
    expect(isAiSearchEnabled()).toBe(true);
  });

  it("returns false for searchAi when set to 'false'", () => {
    localStorage.setItem("sitepins-ai-search", "false");
    expect(isAiSearchEnabled()).toBe(false);
  });

  it("returns true for searchAi when set to 'true'", () => {
    localStorage.setItem("sitepins-ai-search", "true");
    expect(isAiSearchEnabled()).toBe(true);
  });

  it("subscribes to storage and sitepins:ai-settings-changed events", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeAiSettings(callback);

    const win = globalThis.window as unknown as {
      dispatchEvent: (event: string) => void;
    };
    win.dispatchEvent("storage");
    expect(callback).toHaveBeenCalledTimes(1);

    win.dispatchEvent("sitepins:ai-settings-changed");
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
    win.dispatchEvent("storage");
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
