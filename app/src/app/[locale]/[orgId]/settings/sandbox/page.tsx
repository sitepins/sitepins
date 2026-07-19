"use client";

import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { EPackage } from "@/lib/plan/types";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { selectCurrentPackage } from "@/redux/features/plan/slice";
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
  const { currentPackage } = useAppSelector(selectCurrentPackage);

  if (isLoading) return <SandboxSettingsSkeleton />;
  if (!org) return null;

  const canUpdate = isOwner || canUpdateSettings;

  const orgPackage = org.ownerData?.[0]?.active_package as EPackage;
  const isHobby = (orgPackage || currentPackage) === EPackage.HOBBY;

  return (
    <VercelConnectForm org={org} canUpdate={canUpdate} isHobby={isHobby} />
  );
}
