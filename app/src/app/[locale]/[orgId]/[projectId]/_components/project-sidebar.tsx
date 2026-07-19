"use client";

import OrgSwitcher from "@/components/org-switcher";
import {
  SidebarLayout,
  SidebarMenu,
  SidebarUserMenu,
  type SidebarMenuItem,
} from "@/partials/sidebar-layout";
import { TOrg } from "@/redux/features/orgs/type";
import { TConfig, TMenuItem } from "@/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ProjectContext = {
  orgId: string;
  projectId: string;
  projectName: string;
  config?: TConfig;
};

type Props = {
  dashboardMenu: TMenuItem[];
  settingsMenu: TMenuItem[];
  orgs: TOrg[];
  projectContext?: ProjectContext;
  navChildren?: React.ReactNode;
  globalSearch?: React.ReactNode;
};

export default function ProjectSidebar({
  dashboardMenu,
  settingsMenu,
  orgs,
  projectContext,
  navChildren,
  globalSearch,
}: Props) {
  const pathname = usePathname();
  const [view, setView] = useState<"main" | "settings">(() => {
    if (!projectContext) return "main";
    const settingsPath = `/org-${projectContext.orgId}/${projectContext.projectId}/settings`;
    return pathname.startsWith(settingsPath) ? "settings" : "main";
  });
  const router = useRouter();
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (!projectContext) return;
    const settingsPath = `/org-${projectContext.orgId}/${projectContext.projectId}/settings`;
    if (pathname.startsWith(settingsPath)) {
      setView("settings");
    } else {
      setView("main");
    }
  }, [pathname, projectContext]);

  const { mainItems, settingsItems } = useMemo(() => {
    if (!projectContext) return { mainItems: [], settingsItems: [] };

    const { orgId, projectId, projectName, config } = projectContext;

    const processItem = (item: TMenuItem) => {
      let computedName = item.name;
      if (typeof computedName === "function") {
        computedName = computedName({
          orgId,
          projectId,
          projectName,
          config,
        });
      }

      let computedHref = item.href;

      if (typeof computedHref === "function") {
        computedHref = computedHref({
          orgId,
          projectId,
          projectName,
          config,
        });
      }

      return {
        ...item,
        name: String(computedName),
        href: String(computedHref),
        icon: item.icon,
      };
    };

    const main = dashboardMenu.map(processItem);
    const settings = settingsMenu.map(processItem);

    // Add settings trigger to main menu if Settings exists in dashboardMenu
    const settingsTriggerIndex = main.findIndex(
      (item) => item.tKey === "settings" || item.name === "Settings",
    );
    if (settingsTriggerIndex !== -1) {
      const settingsTrigger = main[settingsTriggerIndex];
      main[settingsTriggerIndex] = {
        ...settingsTrigger,
        onClick: (e) => {
          e.preventDefault();
          setView("settings");
          router.push(settingsTrigger.href);
        },
        label: (
          <div className="flex w-full items-center justify-between">
            <span>{tCommon("settings")}</span>
            <ChevronRight className="size-4 opacity-50" />
          </div>
        ),
      } as SidebarMenuItem;
    }

    return { mainItems: main, settingsItems: settings };
  }, [dashboardMenu, settingsMenu, projectContext, router, tCommon]);

  return (
    <SidebarLayout
      header={<OrgSwitcher orgs={orgs} />}
      headerClassName="py-3.5"
      navClassName="overflow-hidden flex flex-col"
      footer={<SidebarUserMenu orgs={orgs} />}
      footerClassName="bg-light p-4"
      className="h-svh overflow-hidden"
    >
      <div className="mt-4 px-4 xl:mt-0">{globalSearch}</div>
      <div className="relative flex-1 overflow-hidden">
        <div className="from-light sticky top-0 z-20 h-4 bg-linear-to-b to-transparent" />
        <AnimatePresence initial={false} mode="popLayout">
          {view === "main" ? (
            <motion.div
              key="main"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col gap-4 overflow-y-auto px-4 pt-4"
            >
              <SidebarMenu
                items={mainItems}
                iconClassName="mr-1.5 size-5 stroke-[1.5]"
                listClassName="space-y-1"
                labelClassName="text-text-dark flex-1"
              />
              {navChildren}
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col overflow-y-auto px-4 pt-4"
            >
              <button
                onClick={() => {
                  setView("main");
                  if (projectContext) {
                    const { orgId, projectId } = projectContext;
                    router.push(`/org-${orgId}/${projectId}`);
                  }
                }}
                className="hover:bg-background relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors"
              >
                <ChevronLeft className="absolute left-4 size-5" />
                <h2 className="text-sm font-semibold">{tCommon("settings")}</h2>
              </button>
              <SidebarMenu
                items={settingsItems}
                listClassName="space-y-1 mt-3"
                iconClassName="mr-1.5 size-5 stroke-[1.5]"
                labelClassName="text-text-dark"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SidebarLayout>
  );
}
