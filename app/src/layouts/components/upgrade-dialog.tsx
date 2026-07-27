"use client";

// Upgrade prompts don't exist in the open-source build — every feature is
// unlocked. The hosted cloud edition overrides this module
// (upgrade-dialog.cloud.tsx) with the real dialog.

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // key inside the cloud edition's "upsell" translation namespace
  contextKey?: string;
}

export function UpgradeDialog(_props: UpgradeDialogProps) {
  return null;
}
