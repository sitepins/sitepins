"use client";

import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { useGetOrgQuery } from "@/redux/features/orgs/org-api";
import { use } from "react";
import ArchiveOrg from "./_components/archive-org";
import DeleteOrg from "./_components/delete-org";
import EditOrg from "./_components/org-form";
import { GeneralSettingsSkeleton } from "./_components/org-general-skeleton";
import OrgThumb from "./_components/org-thumb";

export default function GeneralSettings(
  props: PageProps<"/[locale]/[orgId]/settings/general">,
) {
  const params = use(props.params);
  const { data: org, isLoading: isOrgLoading } = useGetOrgQuery(
    params.orgId.slice(4),
  );

  const canUpdateSettings = usePermission(ENUM_PERMISSIONS.MANAGE_ORG);
  const canPerformDestructiveActions = usePermission(
    ENUM_PERMISSIONS.DELETE_ORG,
  );
  const { member, isOwner, isLoading: isMemberLoading } = useOrgMember();

  if (isOrgLoading || isMemberLoading) {
    return <GeneralSettingsSkeleton />;
  }

  if (!org) return null;

  // Allow `editor` role to view this page, but not manage (update) org settings.
  const canViewSettings =
    isOwner || member?.role === "editor" || canUpdateSettings;

  return (
    <>
      {canViewSettings && <OrgThumb {...org} canUpdate={canUpdateSettings} />}
      {canViewSettings && <EditOrg {...org} canUpdate={canUpdateSettings} />}

      {canPerformDestructiveActions && !org.default && (
        <>
          <ArchiveOrg id={org.org_id} status={org.status} />
          <DeleteOrg id={org.org_id} variant={"destructive"} />
        </>
      )}
    </>
  );
}
