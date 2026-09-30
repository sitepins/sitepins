"use client";

// Slash-menu entry shown in place of the AI group when AI isn't available.
// Never present here — AI always is.

export type LockedAiSlashItem = {
  focusEditor: false;
  value: string;
  label: string;
  labelText: string;
  keywords: string[];
  className: undefined;
  onSelect: () => void;
};

export function useLockedAiSlashItem(): LockedAiSlashItem | null {
  return null;
}
