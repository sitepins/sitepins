import { SiDiscord } from "@icons-pack/react-simple-icons";
import {
  Box,
  Braces,
  CodeXml,
  GitBranch,
  Globe,
  Home,
  Images,
  ListTree,
  MegaphoneIcon,
  Settings,
  Settings2,
  Sparkles,
  UserCog,
} from "lucide-react";
import { COMMUNITY_URL, UPDATES_URL } from "./brand";
import type NavigationType from "../i18n/en/navigation.json";
import {
  getCloudDashboardPrimaryItems,
  getCloudDashboardSecondaryItems,
  getCloudFooterAccountItems,
} from "./menu-cloud";
import { Locale, getMenuTranslations, locales } from "./utils/localized-text";

export type MenuLocale = Locale;

export const menuTranslations = locales.reduce(
  (acc, lang) => {
    acc[lang] = getMenuTranslations(lang);
    return acc;
  },
  {} as Record<Locale, typeof NavigationType.navigation.menu>,
);

export const resolveMenuTranslations = (locale?: string) => {
  if (!locale) return menuTranslations.en;
  const lowerLocale = locale.toLowerCase();
  for (const lang of locales) {
    if (lowerLocale.startsWith(lang)) {
      return menuTranslations[lang as Locale];
    }
  }
  return menuTranslations.en;
};

export const getFooterAccountMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    {
      name: tMenu.footer_account.account,
      tKey: "account",
      href: "/dashboard/account",
      icon: UserCog,
    },
    {
      name: tMenu.footer_account.updates,
      tKey: "updates",
      href: UPDATES_URL,
      icon: MegaphoneIcon,
    },
    {
      name: tMenu.footer_account.support,
      tKey: "support",
      href: COMMUNITY_URL,
      icon: SiDiscord,
    },
    {
      name: tMenu.footer_account.sitepins_ai,
      tKey: "sitepins_ai",
      icon: Sparkles,
      href: "/dashboard/sitepins-ai",
    },
    ...getCloudFooterAccountItems(locale),
    {
      name: tMenu.footer_account.preferences,
      tKey: "preferences",
      icon: Settings,
      href: "/dashboard/preference",
    },
  ];
};

export const getUserDashboardMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    ...getCloudDashboardPrimaryItems(locale),
    {
      name: tMenu.user_dashboard.account,
      tKey: "account",
      icon: UserCog,
      href: "/dashboard/account",
    },
    {
      name: tMenu.user_dashboard.preferences,
      tKey: "preferences",
      icon: Settings,
      href: "/dashboard/preference",
    },
    {
      name: tMenu.user_dashboard.sitepins_ai,
      tKey: "sitepins_ai",
      icon: Sparkles,
      href: "/dashboard/sitepins-ai",
    },
    ...getCloudDashboardSecondaryItems(locale),
  ];
};

export const getOrgDashboardMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    {
      name: tMenu.org_dashboard.websites,
      tKey: "websites",
      href: ({ orgId }: { orgId: string }) => {
        const prefixedOrgId = orgId ? `org-${orgId}` : "";
        return prefixedOrgId ? `/${prefixedOrgId}` : "/";
      },
      icon: Globe,
    },
    {
      name: tMenu.org_dashboard.settings,
      tKey: "settings",
      href: ({ orgId }: { orgId: string }) => {
        const prefixedOrgId = orgId ? `org-${orgId}` : "";
        return prefixedOrgId
          ? `/${prefixedOrgId}/settings/general`
          : "/settings/general";
      },
      icon: Settings,
    },
  ];
};

export const getOrgSettingsMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    {
      name: tMenu.org_settings.general,
      tKey: "general",
      href: ({ orgId }: { orgId: string }) => {
        const prefixedOrgId = orgId ? `org-${orgId}` : "";
        return prefixedOrgId
          ? `/${prefixedOrgId}/settings/general`
          : "/settings/general";
      },
      icon: Settings,
    },
    {
      name: tMenu.org_settings.members,
      tKey: "members",
      href: ({ orgId }: { orgId: string }) => {
        const prefixedOrgId = orgId ? `org-${orgId}` : "";
        return prefixedOrgId
          ? `/${prefixedOrgId}/settings/members`
          : "/settings/members";
      },
      icon: UserCog,
    },
    {
      name: tMenu.org_settings.sandbox,
      tKey: "sandbox",
      href: ({ orgId }: { orgId: string }) => {
        const prefixedOrgId = orgId ? `org-${orgId}` : "";
        return prefixedOrgId
          ? `/${prefixedOrgId}/settings/sandbox`
          : "/settings/sandbox";
      },
      icon: Box,
    },
  ];
};

export const getProjectDashboardMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    {
      name: ({ projectName }: { projectName?: string }) =>
        projectName || tMenu.project_dashboard.overview,
      tKey: "overview",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}`,
      icon: Home,
    },
    {
      name: tMenu.project_dashboard.media,
      tKey: "media",
      href: ({
        orgId,
        projectId,
        config,
      }: {
        orgId: string;
        projectId?: string;
        config?: { media: string };
      }) =>
        `/org-${orgId}/${projectId}/${config?.media ? `media/${config?.media}` : ""}`,
      icon: Images,
    },
    {
      name: tMenu.project_dashboard.settings,
      tKey: "settings",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings`,
      icon: Settings,
    },
  ];
};

export const getProjectSettingsMenu = (locale?: string) => {
  const tMenu = resolveMenuTranslations(locale);
  return [
    {
      name: tMenu.project_settings.general,
      tKey: "general",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/general`,
      icon: Settings,
    },
    {
      name: tMenu.project_settings.configure,
      tKey: "configure",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/configure`,
      icon: Settings2,
    },
    {
      name: tMenu.project_settings.git,
      tKey: "git",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/git`,
      icon: GitBranch,
    },
    {
      name: tMenu.project_settings.schemas,
      tKey: "schemas",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/schemas`,
      icon: Braces,
    },
    {
      name: tMenu.project_settings.snippets,
      tKey: "snippets",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/snippets`,
      icon: CodeXml,
    },
    {
      name: tMenu.project_settings.arrangement,
      tKey: "arrangement",
      href: ({ orgId, projectId }: { orgId: string; projectId?: string }) =>
        `/org-${orgId}/${projectId}/settings/arrangement`,
      icon: ListTree,
    },
  ];
};

export const footerAccountMenu = getFooterAccountMenu();

export const userDashboardMenu = getUserDashboardMenu();

export const orgDashboardMenu = getOrgDashboardMenu();

export const orgSettingsMenu = getOrgSettingsMenu();

export const projectDashboardMenu = getProjectDashboardMenu();

export const projectSettingsMenu = getProjectSettingsMenu();
