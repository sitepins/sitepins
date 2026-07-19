"use client";

// Generic "upgrade your plan" call-to-action. Never rendered in the
// open-source build — there are no plans to upgrade to. The hosted cloud
// edition overrides this module (upgrade-cta.cloud.tsx) with a button
// linking to the billing page.

export interface UpgradeCtaProps {
  labelKey: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "xs" | "icon";
}

export function UpgradeCta(_props: UpgradeCtaProps) {
  return null;
}
