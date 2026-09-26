"use client";

// Extension point for the global search (⌘K). Inert in this build; an
// overlay can replace the module (search-extensions.cloud.ts) the same way
// menu-cloud.ts is replaced.

/** Replaces a palette command (by id) with a different label and link. */
export type TSearchExtensionOverride = { label: string; href: string };

export type TSearchAnalyticsEvent = "search_copilot_ask";

export type TSearchAnalyticsProps = Record<string, string | number | boolean>;

export type TSearchExtensions = {
  overrides: Record<string, TSearchExtensionOverride>;
  /** Plain-text facts about the user's account for Copilot's prompt. */
  accountContext?: string;
  /** Extra Copilot empty-state suggestions. */
  suggestions: string[];
  /** Usage events: counts and flags only, never query text or contents. */
  track: (event: TSearchAnalyticsEvent, props?: TSearchAnalyticsProps) => void;
};

const NO_EXTENSIONS: TSearchExtensions = {
  overrides: {},
  accountContext: undefined,
  suggestions: [],
  track: () => {},
};

/**
 * @param enabled whether the palette is open; implementations should skip
 * network work while it is closed.
 */
export function useSearchExtensions(_options: {
  enabled: boolean;
}): TSearchExtensions {
  return NO_EXTENSIONS;
}
