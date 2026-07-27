"use client";

import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { useGetOrgQuery } from "@/redux/features/orgs/org-api";
import { useAppSelector } from "@/redux/store";
import { use } from "react";
import VercelConnectForm from "./_components/vercel-connect-form";
import { SandboxSettingsSkeleton } from "./_components/sandbox-skeleton";

export default function SandboxSettings(props: {
  params: Promise<{ orgId: string }>;
}) {
  const params = use(props.params);
  const orgId = params.orgId.startsWith("org-")
    ? params.orgId.slice(4)
    : params.orgId;
  const { data: org, isLoading } = useGetOrgQuery(orgId);

  const canUpdateSettings = usePermission(ENUM_PERMISSIONS.MANAGE_ORG);
  const { isOwner } = useOrgMember();
  const { canAccessProFeatures } = useOwnerPlan();

  if (isLoading) return <SandboxSettingsSkeleton />;
  if (!org) return null;

  const canUpdate = isOwner || canUpdateSettings;

  const isRestricted = !canAccessProFeatures;

  return (
    <VercelConnectForm
      org={org}
      canUpdate={canUpdate}
      isRestricted={isRestricted}
    />
  );
}
