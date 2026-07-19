"use client";

import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { SidebarPageLayout } from "@/partials/sidebar-layout";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { ReactNode } from "react";
import DashboardSidebar from "./_components/dashboard-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: orgs, isLoading: isOrgsLoading } = useGetOrgsQuery();

  return (
    <SidebarPageLayout
      sidebar={
        isOrgsLoading ? (
          <SidebarSkeleton />
        ) : (
          <DashboardSidebar orgs={orgs ?? []} />
        )
      }
      mainClassName="flex-1 p-0"
    >
      {children}
    </SidebarPageLayout>
  );
}
