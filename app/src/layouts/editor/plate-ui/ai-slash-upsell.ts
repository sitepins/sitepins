"use client";

// The "upgrade to unlock AI" entry shown in the editor's slash menu when a
// user can't access AI features. Never present in the open-source build —
// AI is fully available there. The hosted cloud edition overrides this
// module (ai-slash-upsell.cloud.ts) with the real, translated item.

export type AiSlashUpsellItem = {
  focusEditor: false;
  value: string;
  label: string;
  labelText: string;
  keywords: string[];
  className: undefined;
  onSelect: () => void;
};

export function useAiSlashUpsellItem(): AiSlashUpsellItem | null {
  return null;
}
