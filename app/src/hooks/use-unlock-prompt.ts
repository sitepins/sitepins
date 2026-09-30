"use client";

import * as React from "react";

// App-wide request to explain why a feature is locked, keyed by what it
// would unlock (e.g. "preview", "site_limit"). Nothing listens here, so
// requests are no-ops; other builds may mount a listener.

type Listener = (contextKey: string | null) => void;

let activeContextKey: string | null = null;
const listeners = new Set<Listener>();

function setActiveContextKey(next: string | null) {
  if (next === activeContextKey) return;
  activeContextKey = next;
  listeners.forEach((listener) => listener(activeContextKey));
}

export function openUnlockPrompt(contextKey: string) {
  setActiveContextKey(contextKey);
}

export function closeUnlockPrompt() {
  setActiveContextKey(null);
}

export function useUnlockPromptState() {
  const [contextKey, setContextKey] = React.useState(activeContextKey);

  React.useEffect(() => {
    listeners.add(setContextKey);
    return () => {
      listeners.delete(setContextKey);
    };
  }, []);

  return { contextKey, close: closeUnlockPrompt } as const;
}
