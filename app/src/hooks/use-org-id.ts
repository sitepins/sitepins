"use client";

import { TOrg } from "@/redux/features/orgs/type";
import { useStoredValue } from "@/hooks/use-stored-value";
import { useParams } from "next/navigation";
import { useMemo } from "react";

type UseOrgIdReturn = {
  effectiveOrgId?: string;
  prefixedOrgId?: string;
  normalizedOrgId?: string;
  isOrgRoute: boolean;
};

/**
 * Hook to resolve the effective organization ID from params or fallback sources
 * Handles org ID normalization, localStorage fallback, and default org selection
 */
export function useOrgId(orgs: TOrg[] = []): UseOrgIdReturn {
  const params = useParams();
  const storedOrgId = useStoredValue("last_working_org_id");

  const rawOrgId = useMemo(() => {
    const paramOrgId = params?.orgId;
    return Array.isArray(paramOrgId) ? paramOrgId[0] : paramOrgId;
  }, [params?.orgId]);

  const normalizedOrgId = useMemo(() => {
    if (!rawOrgId) return undefined;
    return rawOrgId.startsWith("org-") ? rawOrgId.slice(4) : rawOrgId;
  }, [rawOrgId]);

  const effectiveOrgId = useMemo(() => {
    // If there's an orgId in the URL, use it
    if (normalizedOrgId) {
      return normalizedOrgId;
    }

    // Archived organizations remain visible in management screens but cannot
    // be a current workspace or a redirect target.
    const activeOrgs = (orgs || []).filter((org) => org.status !== "archived");

    // If there's a stored org id AND the user has access to that org, use it
    if (storedOrgId && activeOrgs.some((org) => org.org_id === storedOrgId)) {
      return storedOrgId;
    }

    // Otherwise, fall back to the user's default org
    // This handles cases where the stored org id is invalid or the user lost access
    const defaultOrg = activeOrgs.find((org) => org.default);
    if (defaultOrg) {
      return defaultOrg.org_id;
    }

    // If no default org, use the first available org
    return activeOrgs[0]?.org_id;
  }, [normalizedOrgId, orgs, storedOrgId]);

  const prefixedOrgId = useMemo(() => {
    if (rawOrgId) {
      return rawOrgId;
    }

    return effectiveOrgId ? `org-${effectiveOrgId}` : undefined;
  }, [rawOrgId, effectiveOrgId]);

  const isOrgRoute = Boolean(normalizedOrgId);

  return {
    effectiveOrgId,
    prefixedOrgId,
    normalizedOrgId,
    isOrgRoute,
  };
}
