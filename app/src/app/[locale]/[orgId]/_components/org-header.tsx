"use client";

import ProjectSwitcher from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSafeLocale } from "@/hooks/use-safe-locale";
import { useTranslations } from "next-intl";
import { getOrgSettingsMenu } from "@/lib/menu";
import { cn } from "@/lib/utils/cn";
import { useGetProjectsQuery } from "@/redux/features/project/project-api";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export default function OrgHeader() {
  const locale = useSafeLocale();
  const tNavigation = useTranslations("navigation");
  const params = useParams();
  const pathname = usePathname();
  const orgId = params.orgId as string;
  const normalizedOrgId = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;

  const { data: projects = [] } = useGetProjectsQuery(normalizedOrgId, {
    skip: !normalizedOrgId,
  });

  const isSettingsPage = pathname?.includes("/settings/");
  const orgSettingsMenu = getOrgSettingsMenu(locale);

  let middleTitle = tNavigation("menu.user_dashboard.overview");
  if (isSettingsPage) {
    const activeSetting = orgSettingsMenu.find((item) => {
      const href = item.href({ orgId: normalizedOrgId });
      return pathname.startsWith(href);
    });
    middleTitle = activeSetting
      ? activeSetting.name
      : tNavigation("menu.org_dashboard.settings");
  }

  return (
    <div
      className={cn(
        "border-border flex items-center justify-between border-b px-4 py-3 md:px-6",
        isSettingsPage && "hidden xl:flex",
      )}
    >
      {/* Left: Project Switcher */}
      <ProjectSwitcher
        projects={projects}
        orgId={normalizedOrgId}
        className="hidden w-60 justify-between xl:flex"
      />

      {/* Middle: Title */}
      <div className="flex-1 text-left xl:text-center">
        <h1 className="flex items-center justify-start text-lg font-semibold xl:justify-center">
          {middleTitle}
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex w-60 items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 px-0">
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit">
            {orgSettingsMenu.map((item) => (
              <DropdownMenuItem key={item.name} asChild>
                <Link
                  href={item.href({
                    orgId: normalizedOrgId,
                  })}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
