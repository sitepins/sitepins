import type { TOrg } from "@/redux/features/orgs/type";

// Sitepins has no plan limits, so these hooks never limit anything. Keep the
// shape stable: other builds may swap this module for their own.

export function useSiteLimit(_org?: TOrg) {
  return {
    isFull: false,
    // Translated reason a site can't be created, or null when it can.
    getCreateError: (_visibility: "public" | "private"): string | null => null,
    isLimitError: (_message: string) => false,
  };
}

export function useOrgLimit(_orgs?: TOrg[]) {
  return { isFull: false };
}
