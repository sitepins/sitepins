import { EPackage } from "@/lib/plan/types";

// IMPORTANT: ***change main limits in backend `src/config/limits.ts`***

// Defines the limits for each package type
export const PackageLimit = {
  [EPackage.HOBBY]: {
    org_limit: 1,
    org_site_limit: 3,
    org_private_site_limit: 1,
    org_member_limit: 1,
  },
  [EPackage.PRO]: {
    org_limit: 2,
    org_site_limit: 3,
    org_private_site_limit: 3,
    org_member_limit: 3,
  },
  [EPackage.TEAM]: {
    org_limit: 5,
    org_site_limit: 3,
    org_private_site_limit: 3,
    org_member_limit: 5,
  },
  [EPackage.ENTERPRISE]: {
    org_limit: Infinity,
    org_site_limit: Infinity,
    org_private_site_limit: Infinity,
    org_member_limit: Infinity,
  },
};
