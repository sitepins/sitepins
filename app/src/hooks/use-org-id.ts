"use client";

import { TOrg } from "@/redux/features/orgs/type";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  const [storedOrgId, setStoredOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStoredOrgId(localStorage.getItem("last_working_org_id"));
  }, []);

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

    const allOrgs = orgs || [];

    // If there's a stored org id AND the user has access to that org, use it
    if (storedOrgId && allOrgs.some((org) => org.org_id === storedOrgId)) {
      return storedOrgId;
    }

    // Otherwise, fall back to the user's default org
    // This handles cases where the stored org id is invalid or the user lost access
    const defaultOrg = allOrgs.find((org) => org.default);
    if (defaultOrg) {
      return defaultOrg.org_id;
    }

    // If no default org, use the first available org
    return allOrgs[0]?.org_id;
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
