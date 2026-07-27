export type PlanLimits = {
  org_limit: number;
  org_site_limit: number;
  org_private_site_limit: number;
  org_member_limit: number;
};

const UNLIMITED: PlanLimits = {
  org_limit: Infinity,
  org_site_limit: Infinity,
  org_private_site_limit: Infinity,
  org_member_limit: Infinity,
};

export const getPlanLimits = (_pkg?: string | null): PlanLimits => UNLIMITED;
