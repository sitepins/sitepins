"use client";

import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import BranchManager from "./_components/branch-manager";
import GitSettingsSkeleton from "./_components/git-settings-skeleton";
import RepoManager from "./_components/repo-manager";

export default function GitPage() {
  const canUpdateSettings = usePermission(ENUM_PERMISSIONS.MANAGE_PROJECTS);
  const { isLoading } = useOrgMember();

  if (isLoading) return <GitSettingsSkeleton />;

  return (
    <>
      <RepoManager canUpdate={canUpdateSettings} />
      <BranchManager canUpdate={canUpdateSettings} />
    </>
  );
}
