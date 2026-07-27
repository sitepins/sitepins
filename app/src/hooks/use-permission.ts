"use client";

import { useOrgId } from "@/hooks/use-org-id";
import { authClient } from "@/lib/auth/auth-client";
import { hasPermission } from "@/lib/utils/permission-checker";
import { useGetOrgQuery, useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { TMember } from "@/redux/features/orgs/type";

export function useOrgMember(orgId?: string): {
  member?: TMember;
  isOwner: boolean;
  isLoading: boolean;
} {
  const { data: orgs, isLoading: isOrgsLoading } = useGetOrgsQuery();
  const { effectiveOrgId } = useOrgId(orgs);
  const { data: auth, isPending: isAuthLoading } = authClient.useSession();
  const { user } = auth || {};

  const targetOrgId = orgId ?? effectiveOrgId;

  const { data: orgData, isLoading: isOrgLoading } = useGetOrgQuery(
    targetOrgId as string,
    { skip: !targetOrgId || isOrgsLoading },
  );

  const currentOrg = orgData || orgs?.find((org) => org.org_id === targetOrgId);

  if (!currentOrg || !user) {
    return {
      isOwner: false,
      isLoading: isOrgsLoading || isAuthLoading || isOrgLoading,
    };
  }

  const isOwner = currentOrg.owner === user.user_id;
  const member = currentOrg.members?.find((m) => m.user_id === user.user_id);

  return {
    member,
    isOwner,
    isLoading: isOrgsLoading || isAuthLoading || isOrgLoading,
  };
}

export function usePermission(requiredPermission: string, orgId?: string) {
  const { member, isOwner, isLoading } = useOrgMember(orgId);

  if (isLoading) {
    return false;
  }

  // Owner has all permissions
  if (isOwner) {
    return true;
  }

  if (!member) {
    return false;
  }

  return hasPermission(member.role, requiredPermission);
}
