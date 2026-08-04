import type { LucideIcon } from "lucide-react";

// Cloud-only menu entries (billing, subscription overview). Empty in the
// open-source build — those pages don't exist here. The hosted cloud
// edition overrides this module (menu-cloud.cloud.ts) and resolves labels
// from its own cloud i18n files using the locale.

export type TCloudMenuItem = {
  name: string;
  tKey: string;
  href: string;
  icon: LucideIcon;
};

// inserted into the account dropdown, before "Preferences"
export const getCloudFooterAccountItems = (
  _locale?: string,
): TCloudMenuItem[] => [];

// inserted at the top of the user dashboard sidebar (overview)
export const getCloudDashboardPrimaryItems = (
  _locale?: string,
): TCloudMenuItem[] => [];

// appended to the user dashboard sidebar (billing)
export const getCloudDashboardSecondaryItems = (
  _locale?: string,
): TCloudMenuItem[] => [];

export type TCloudSearchItem = {
  id: string;
  label: string;
  href: string;
  keywords: string[];
};

export type TCloudSearchGroup = {
  groupLabel: string;
  items: TCloudSearchItem[];
};

// extra global-search groups (billing) — none in the open-source build
export const getCloudSearchGroups = (
  _locale?: string,
): TCloudSearchGroup[] => [];
