"use client";

import OrgSwitcher from "@/components/org-switcher";
import { useOrgId } from "@/hooks/use-org-id";
import { useSafeLocale } from "@/hooks/use-safe-locale";
import { getOrgDashboardMenu, getOrgSettingsMenu } from "@/lib/menu";
import {
  SidebarLayout,
  SidebarMenu,
  SidebarUserMenu,
} from "@/partials/sidebar-layout";
import { TOrg } from "@/redux/features/orgs/type";
import { TMenuItem } from "@/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GlobalSearch } from "./global-search";

export default function OrgSidebar({ orgs }: { orgs: TOrg[] }) {
  const locale = useSafeLocale();
  const { effectiveOrgId, prefixedOrgId } = useOrgId(orgs);
  const pathname = usePathname();
  const [view, setView] = useState<"main" | "settings">(
    pathname.includes("/settings") ? "settings" : "main",
  );
  const router = useRouter();
  const tCommon = useTranslations("common");
  const orgDashboardMenu = getOrgDashboardMenu(locale);
  const orgSettingsMenu = getOrgSettingsMenu(locale);

  useEffect(() => {
    if (pathname.includes("/settings")) {
      setView("settings");
    } else {
      setView("main");
    }
  }, [pathname]);

  const { menuItems, settingsMenuItems } = useMemo(() => {
    const processItem = (item: TMenuItem) => {
      let computedName = item.name;
      if (typeof computedName === "function") {
        computedName = computedName({
          orgId: effectiveOrgId || "",
        });
      }

      let computedHref = item.href;

      if (typeof computedHref === "function") {
        computedHref = computedHref({
          orgId: effectiveOrgId || "",
        });
      }

      const isSettings = item.tKey === "settings";

      return {
        ...item,
        name: String(computedName),
        href: String(computedHref),
        onClick: isSettings
          ? () => {
              setView("settings");
            }
          : undefined,
        label: (
          <div className="flex w-full items-center justify-between">
            <span>{String(computedName)}</span>
            {isSettings && <ChevronRight className="size-4 opacity-50" />}
          </div>
        ),
      };
    };

    return {
      menuItems: orgDashboardMenu.map(processItem),
      settingsMenuItems: orgSettingsMenu.map(processItem),
    };
  }, [effectiveOrgId, orgDashboardMenu, orgSettingsMenu]);

  return (
    <SidebarLayout
      header={<OrgSwitcher orgs={orgs} />}
      headerClassName="py-3.5"
      navClassName="overflow-hidden flex flex-col"
      footer={<SidebarUserMenu orgs={orgs} />}
      footerClassName="bg-light p-4"
      className="h-svh overflow-hidden"
    >
      <div className="mt-4 px-4 xl:mt-0">
        <GlobalSearch />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {view === "main" ? (
            <motion.div
              key="main"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 flex flex-col overflow-y-auto px-4 pt-4"
            >
              <SidebarMenu
                items={menuItems}
                listClassName="flex-1 space-y-1"
                iconClassName="mr-1.5 size-5 stroke-[1.5]"
                labelClassName="text-text-dark flex-1"
              />
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
                  router.push(prefixedOrgId ? `/${prefixedOrgId}` : "/");
                }}
                className="hover:bg-background relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors"
              >
                <ChevronLeft className="absolute left-4 size-5" />
                <h2 className="text-sm font-semibold">{tCommon("settings")}</h2>
              </button>
              <SidebarMenu
                items={settingsMenuItems}
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
