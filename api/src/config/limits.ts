export type TPlanLimits = {
  org_limit: number;
  org_site_limit: number;
  org_private_site_limit: number;
  org_member_limit: number;
};

// Self-hosted installs are unmetered.
export const UNLIMITED: TPlanLimits = {
  org_limit: Infinity,
  org_site_limit: Infinity,
  org_private_site_limit: Infinity,
  org_member_limit: Infinity,
};
