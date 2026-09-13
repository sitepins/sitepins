"use client";

import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { openAiUpsellDialog } from "@/hooks/use-upgrade-dialog";
import { useSyncExternalStore } from "react";

/**
 * Check if Copilot (autocomplete) feature is enabled.
 * Default state is ON (true).
 */
export function isAiAutocompleteEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-autocomplete") !== "false";
  } catch {
    return true;
  }
}

/**
 * Check if Editor AI feature (writing commands in rich text editor) is enabled.
 * Default state is ON (true).
 */
export function isEditorAiEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-editor") !== "false";
  } catch {
    return true;
  }
}

/**
 * Check if Code Editor AI feature (inline copilot, explain, bug fix in code editor) is enabled.
 * Default state is ON (true).
 */
export function isCodeAiEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-code") !== "false";
  } catch {
    return true;
  }
}

/**
 * Check if Git Commit Generator feature is enabled.
 * Default state is ON (true).
 */
export function isAiCommitEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-commit") !== "false";
  } catch {
    return true;
  }
}

/**
 * Check if SEO & Metadata Assistant feature is enabled.
 * Default state is ON (true).
 */
export function isAiSeoEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-seo") !== "false";
  } catch {
    return true;
  }
}

/**
 * Check if Search AI Copilot feature is enabled.
 * Default state is ON (true).
 */
export function isAiSearchEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("sitepins-ai-search") !== "false";
  } catch {
    return true;
  }
}

/**
 * Shared subscriber for localStorage changes and custom sitepins:ai-settings-changed events.
 */
export function subscribeAiSettings(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", callback);
  window.addEventListener("sitepins:ai-settings-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sitepins:ai-settings-changed", callback);
  };
}

/**
 * React hook subscribing to Rich Text Editor AI enabled state.
 * Default state is ON (true).
 */
export function useIsEditorAiEnabled(): boolean {
  return useSyncExternalStore(
    subscribeAiSettings,
    isEditorAiEnabled,
    () => true,
  );
}

/**
 * React hook subscribing to Code Editor AI enabled state.
 * Default state is ON (true).
 */
export function useIsCodeAiEnabled(): boolean {
  return useSyncExternalStore(subscribeAiSettings, isCodeAiEnabled, () => true);
}

/**
 * React hook subscribing to Git Commit Generator enabled state.
 * Default state is ON (true).
 */
export function useIsAiCommitEnabled(): boolean {
  return useSyncExternalStore(
    subscribeAiSettings,
    isAiCommitEnabled,
    () => true,
  );
}

/**
 * React hook subscribing to SEO & Metadata Assistant enabled state.
 * Default state is ON (true).
 */
export function useIsAiSeoEnabled(): boolean {
  return useSyncExternalStore(subscribeAiSettings, isAiSeoEnabled, () => true);
}

/**
 * React hook subscribing to Copilot (autocomplete) enabled state.
 * Default state is ON (true).
 */
export function useIsAiAutocompleteEnabled(): boolean {
  return useSyncExternalStore(
    subscribeAiSettings,
    isAiAutocompleteEnabled,
    () => true,
  );
}

/**
 * React hook subscribing to Search AI Copilot enabled state.
 * Default state is ON (true).
 */
export function useIsAiSearchEnabled(): boolean {
  return useSyncExternalStore(
    subscribeAiSettings,
    isAiSearchEnabled,
    () => true,
  );
}

/**
 * Pure evaluation function for AI access rules:
 * 1. Plan gating: verifies the user's plan permits AI features.
 *    If blocked, opens the upsell dialog.
 * 2. Model setup gating: verifies the user has selected an AI model in localStorage.
 *    If not configured, opens /dashboard/ai-agent in a new tab.
 */
export function evaluateAiAccess({
  canAccessAi,
  hasModel,
  onOpenUpsell = openAiUpsellDialog,
  onOpenSettings = () => {
    if (typeof window !== "undefined") {
      window.open("/dashboard/ai-agent", "_blank");
    }
  },
}: {
  canAccessAi: boolean;
  hasModel: boolean;
  onOpenUpsell?: () => void;
  onOpenSettings?: () => void;
}): boolean {
  if (!canAccessAi) {
    onOpenUpsell();
    return false;
  }

  if (!hasModel) {
    onOpenSettings();
    return false;
  }

  return true;
}

/**
 * Standardized AI gating hook matching the Plate editor AI rules:
 * - Always visible in the UI across all plans.
 * - Gated on trigger: Plan -> Model Config -> Action.
 */
export function useAiAccess() {
  const { canAccessProFeatures: canAccessAi } = useOwnerPlan();

  const getHasConfiguredModel = () =>
    typeof window !== "undefined"
      ? Boolean(
          localStorage.getItem("sitepins-ai-model") &&
          localStorage.getItem("sitepins-ai-apiKey"),
        )
      : false;

  const isEditorAi = useIsEditorAiEnabled();
  const isCodeAi = useIsCodeAiEnabled();
  const isAiCommit = useIsAiCommitEnabled();
  const isAiSeo = useIsAiSeoEnabled();
  const isAutocomplete = useIsAiAutocompleteEnabled();
  const isSearchAi = useIsAiSearchEnabled();

  const checkAiAccess = (): boolean => {
    return evaluateAiAccess({
      canAccessAi,
      hasModel: getHasConfiguredModel(),
    });
  };

  return {
    canAccessAi,
    /** Live check — reads localStorage on each call */
    hasConfiguredModel: getHasConfiguredModel(),
    checkAiAccess,
    isEditorAiEnabled: isEditorAi,
    isCodeAiEnabled: isCodeAi,
    isAiCommitEnabled: isAiCommit,
    isAiSeoEnabled: isAiSeo,
    isAutocompleteEnabled: isAutocomplete,
    isSearchAiEnabled: isSearchAi,
  };
}
