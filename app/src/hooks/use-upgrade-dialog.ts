"use client";

import * as React from "react";

type Listener = (state: boolean) => void;

let dialogState = false;
const listeners = new Set<Listener>();

function setDialogState(value: boolean | ((prev: boolean) => boolean)) {
  const nextState =
    typeof value === "function"
      ? (value as (prev: boolean) => boolean)(dialogState)
      : value;

  if (nextState === dialogState) return;

  dialogState = nextState;
  listeners.forEach((listener) => listener(dialogState));
}

export function openAiUpsellDialog() {
  setDialogState(true);
}

export function closeAiUpsellDialog() {
  setDialogState(false);
}

export function useUpgradeDialogState() {
  const [open, setOpen] = React.useState(dialogState);

  React.useEffect(() => {
    const listener: Listener = (state) => setOpen(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    open,
    setOpen: setDialogState,
  } as const;
}
