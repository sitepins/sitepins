"use client";

import { getUserDashboardMenu } from "@/lib/menu";
import {
  SidebarLayout,
  SidebarMenu,
  SidebarUserMenu,
} from "@/partials/sidebar-layout";
import { TOrg } from "@/redux/features/orgs/type";
import { ChevronLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

type DashboardSidebarProps = {
  orgs: TOrg[];
};

export default function DashboardSidebar({ orgs }: DashboardSidebarProps) {
  const locale = useLocale();
  const tSidebar = useTranslations("dashboard.sidebar");
  const userDashboardMenu = getUserDashboardMenu(locale);

  const items = useMemo(
    () =>
      userDashboardMenu.map((item) => ({
        name: item.name,
        href: item.href,
        icon: item.icon,
      })),
    [userDashboardMenu],
  );

  return (
    <SidebarLayout
      header={
        <Link
          href="/"
          className="hover:bg-background relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors"
        >
          <ChevronLeft className="absolute left-4 size-5" />
          <h2 className="text-sm font-semibold">{tSidebar("back")}</h2>
        </Link>
      }
      headerClassName="py-3 px-4"
      navClassName=""
      footer={<SidebarUserMenu orgs={orgs} />}
      footerClassName="bg-light p-4"
      className="h-svh"
    >
      <div className="flex flex-1 flex-col px-4 pt-4 xl:pt-1">
        <SidebarMenu
          items={items}
          listClassName="flex-1 space-y-1"
          iconClassName="mr-1.5 size-5 stroke-[1.5]"
          labelClassName="text-text-dark flex-1"
        />
      </div>
    </SidebarLayout>
  );
}
