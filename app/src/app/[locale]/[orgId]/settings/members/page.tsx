"use client";

import { useGetOrgQuery } from "@/redux/features/orgs/org-api";
import { use } from "react";
import OrgMembers from "./_components/org-members";
import { MembersSettingsSkeleton } from "./_components/org-members-skeleton";

export default function MembersSettings(
  props: PageProps<"/[locale]/[orgId]/settings/members">,
) {
  const params = use(props.params);
  const { data: org, isLoading: isOrgLoading } = useGetOrgQuery(
    params.orgId.slice(4),
  );

  if (isOrgLoading) {
    return <MembersSettingsSkeleton />;
  }

  if (!org) return null;

  return <OrgMembers {...org} />;
}
