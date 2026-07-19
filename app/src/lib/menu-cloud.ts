// Cloud-only menu entries (billing, subscription overview). Empty in the
// open-source build — those pages don't exist here. The hosted cloud
// edition overrides this module (menu-cloud.cloud.ts) and resolves labels
// from its own cloud i18n files using the locale.

export type CloudMenuItem = {
  name: string;
  tKey: string;
  href: string;
  icon: any;
};

// inserted into the account dropdown, before "Preferences"
export const getCloudFooterAccountItems = (_locale?: string): CloudMenuItem[] =>
  [];

// inserted at the top of the user dashboard sidebar (overview)
export const getCloudDashboardPrimaryItems = (
  _locale?: string,
): CloudMenuItem[] => [];

// appended to the user dashboard sidebar (billing)
export const getCloudDashboardSecondaryItems = (
  _locale?: string,
): CloudMenuItem[] => [];
