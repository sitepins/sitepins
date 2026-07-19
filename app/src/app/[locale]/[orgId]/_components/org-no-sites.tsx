"use client";

import AddSite from "@/components/add-site";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { Plus } from "lucide-react";
import { useMemo } from "react";

type Props = { orgId: string };

export default function OrgNoSites({ orgId }: Props) {
  const { data: orgs } = useGetOrgsQuery();
  const org = useMemo(
    () => orgs?.find((o) => o.org_id === orgId.slice(4)),
    [orgs, orgId],
  );
  const isArchived = org?.status === "archived";

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="mx-auto mb-8 max-w-sm text-center">
        <h1 className="mb-2">Welcome to Sitepins 👋</h1>
        <p className="text-muted-foreground text-sm">
          Connect your existing website to get started in minutes.
        </p>
        <AddSite className="mt-5" orgId={`${orgId}`} disabled={isArchived}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Site
        </AddSite>
      </div>
    </div>
  );
}
