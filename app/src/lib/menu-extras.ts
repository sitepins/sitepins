import type { LucideIcon } from "lucide-react";

// Extra menu entries. Empty — the pages they would link to don't exist
// here. Other builds may swap this module for their own.

export type TExtraMenuItem = {
  name: string;
  tKey: string;
  href: string;
  icon: LucideIcon;
};

// inserted into the account dropdown, before "Preferences"
export const getExtraFooterAccountItems = (
  _locale?: string,
): TExtraMenuItem[] => [];

// inserted at the top of the user dashboard sidebar
export const getExtraDashboardPrimaryItems = (
  _locale?: string,
): TExtraMenuItem[] => [];

// appended to the user dashboard sidebar
export const getExtraDashboardSecondaryItems = (
  _locale?: string,
): TExtraMenuItem[] => [];

export type TExtraSearchItem = {
  id: string;
  label: string;
  href: string;
  keywords: string[];
};

export type TExtraSearchGroup = {
  groupLabel: string;
  items: TExtraSearchItem[];
  /** Long lists (e.g. templates) only appear once the user types. */
  searchOnly?: boolean;
};

// extra global-search groups — none here
export const getExtraSearchGroups = (
  _locale?: string,
): TExtraSearchGroup[] => [];
