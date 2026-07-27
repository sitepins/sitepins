"use client";

import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import ProtectedLayoutWrapper from "@/partials/protected-layout-wrapper";
import { SidebarPageLayout } from "@/partials/sidebar-layout";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { notFound, useParams } from "next/navigation";
import OrgHeader from "./_components/org-header";
import OrgSidebar from "./_components/org-sidebar";

export default function Layout(props: LayoutProps<"/[locale]/[orgId]">) {
  const { children } = props;
  const params = useParams();
  const { data: orgs, isLoading } = useGetOrgsQuery();

  // Check if this is a project route (has projectId segment)
  const isProjectRoute = !!params?.projectId;

  // Validate orgId
  const orgId = params?.orgId as string;
  const normalizedOrgId = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;
  const isValidOrg = orgs?.some((org) => org.org_id === normalizedOrgId);

  if (!isLoading && orgs && !isValidOrg) {
    notFound();
  }

  // For project routes, don't render sidebar here (project layout handles it)
  if (isProjectRoute) {
    return <ProtectedLayoutWrapper>{children}</ProtectedLayoutWrapper>;
  }

  // For org-level routes (projects list, settings), render with OrgSidebar
  return (
    <ProtectedLayoutWrapper>
      <SidebarPageLayout
        header={<OrgHeader />}
        sidebar={
          isLoading ? <SidebarSkeleton /> : <OrgSidebar orgs={orgs || []} />
        }
      >
        {children}
      </SidebarPageLayout>
    </ProtectedLayoutWrapper>
  );
}
