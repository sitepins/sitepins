"use client";

import Container from "@/components/container";
import { cn } from "@/lib/utils/cn";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useGetProjectsQuery } from "@/redux/features/project/project-api";
import { use, useState } from "react";
import OrgArchived from "./_components/org-archived";
import OrgNoSites from "./_components/org-no-sites";
import OrgSites from "./_components/org-sites";
import OrgSitesHeader from "./_components/org-sites-header";
import OrgSitesSkeleton from "./_components/org-sites-skeleton";

export default function Projects(props: PageProps<"/[locale]/[orgId]">) {
  const params = use(props.params);
  const { data: projects, isLoading: isProjectLoading } = useGetProjectsQuery(
    params.orgId.slice(4),
  );

  const [searchQuery, setSearchQuery] = useState("");

  const { data: orgs, isLoading: isOrgLoading } = useGetOrgsQuery();

  if (isProjectLoading || isOrgLoading) return <OrgSitesSkeleton />;

  const org = orgs?.find((org) => org.org_id === params.orgId.slice(4));

  const isArchived = org?.status === "archived";

  const filteredSites = projects?.filter((site) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      site.project_name.toLowerCase().includes(searchLower) ||
      site.repository?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Container
      className="flex flex-1 flex-col"
      wrapperClassName="flex flex-1 flex-col"
    >
      <title>{org?.org_name + " - Sitepins"}</title>

      {isArchived && (!projects || projects.length === 0) ? (
        <OrgArchived variant="full" />
      ) : !projects || projects.length === 0 ? (
        <OrgNoSites orgId={params.orgId} />
      ) : (
        <>
          <div
            className={cn(
              "flex flex-col",
              isArchived && "pointer-events-none opacity-50",
            )}
          >
            <OrgSitesHeader
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              orgId={params.orgId}
              isArchived={isArchived}
            />

            <OrgSites sites={filteredSites || []} orgId={params.orgId} />
          </div>

          {isArchived && <OrgArchived variant="banner" />}
        </>
      )}
    </Container>
  );
}
