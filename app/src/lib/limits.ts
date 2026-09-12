export type TPlanLimits = {
  org_limit: number;
  site_limit: number;
  private_site_limit: number;
  org_member_limit: number;
};

const UNLIMITED: TPlanLimits = {
  org_limit: Infinity,
  site_limit: Infinity,
  private_site_limit: Infinity,
  org_member_limit: Infinity,
};

export const getPlanLimits = (_pkg?: string | null): TPlanLimits => UNLIMITED;
