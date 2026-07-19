"use client";

import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useProjectBranch } from "@/hooks/use-project-branch";
import { useSafeLocale } from "@/hooks/use-safe-locale";
import { getProjectDashboardMenu, getProjectSettingsMenu } from "@/lib/menu";
import { cn } from "@/lib/utils/cn";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { slugify } from "@/lib/utils/text-converter";
import { SidebarPageLayout } from "@/partials/sidebar-layout";
import { resetConfig, selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubSiteConfigQuery,
  useGetGitHubTreesQuery,
} from "@/redux/features/github";
import {
  useGetGitLabSiteConfigQuery,
  useGetGitLabTreesQuery,
} from "@/redux/features/gitlab";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { useGetProvidersQuery } from "@/redux/features/provider/provider-api";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import { FileCode2, FileCog, FileTypeCorner } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import path from "path";
import { Suspense, use, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { GlobalSearch } from "../_components/global-search";
import CodeMenu from "./_components/code-menu";
import ConfigsMenu from "./_components/configs-menu";
import ContentMenu from "./_components/content-menu";
import ProjectHeader from "./_components/project-header";
import ProjectSidebar from "./_components/project-sidebar";

export default function Layout(
  props: LayoutProps<"/[locale]/[orgId]/[projectId]">,
) {
  const locale = useSafeLocale();
  const params = use(props.params);
  const { children } = props;
  const dispatch = useAppDispatch();
  const config = useSelector(selectConfig);
  const { canAccessPremiumFeatures } = useOwnerPlan();
  const { data: orgs, isLoading: isOrgsLoading } = useGetOrgsQuery();
  const pathname = usePathname() ?? "";
  const projectDashboardMenu = getProjectDashboardMenu(locale);
  const projectSettingsMenu = getProjectSettingsMenu(locale);
  const tSidebar = useTranslations("navigation.sidebar");
  const tDashboard = useTranslations("dashboard");
  const [searchOpen, setSearchOpen] = useState(false);

  const {
    isLoading: isProjectLoading,
    data: project,
    isFetching: isProjectFetching,
  } = useGetProjectQuery(
    {
      orgId: params.orgId.slice(4),
      projectId: params.projectId,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  if (!isProjectLoading && !project) {
    notFound();
  }

  useProjectBranch(project);

  const { isLoading: isProviderLoading, isFetching: isProviderFetching } =
    useGetProvidersQuery(
      { user_id: project?.user_id!, preferredProvider: project?.provider },
      {
        skip: !project?.user_id || isProjectFetching,
        refetchOnMountOrArgChange: true,
      },
    );

  const { isLoading: isGhSiteSettingLoading, isFetching: isGhFetching } =
    useGetGitHubSiteConfigQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        ref: config.branch,
        path: ".sitepins/config.json",
        framework: (project?.generator as any) || undefined,
      },
      {
        skip:
          isProjectFetching ||
          !config.token ||
          !config.repoName ||
          !isGitHubProvider(config.provider) ||
          !isGitHubProvider(project?.provider),
        refetchOnMountOrArgChange: true,
      },
    );

  const { isLoading: isGlSiteSettingLoading, isFetching: isGlFetching } =
    useGetGitLabSiteConfigQuery(
      {
        id: project?.repository || "",
        file_path: ".sitepins/config.json",
        ref: config.branch,
        framework: (project?.generator as any) || undefined,
      },
      {
        skip:
          isProviderFetching ||
          isProjectFetching ||
          !config.token ||
          !project?.repository ||
          !isGitLabProvider(config.provider) ||
          !isGitLabProvider(project?.provider),
        refetchOnMountOrArgChange: true,
      },
    );

  const isSiteSettingLoading = isGitLabProvider(project?.provider)
    ? isGlSiteSettingLoading
    : isGhSiteSettingLoading;
  const isFetching = isGitLabProvider(project?.provider)
    ? isGlFetching
    : isGhFetching;

  const {
    data: ghData,
    isLoading: isGhTreesLoading,
    isSuccess: isGhTreesLoaded,
  } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    {
      skip:
        !config.token ||
        !config.repoName ||
        !config.branch ||
        isFetching ||
        isProviderFetching ||
        !isGitHubProvider(config.provider) ||
        !isGitHubProvider(project?.provider),
    },
  );

  const {
    data: glData,
    isLoading: isGlTreesLoading,
    isSuccess: isGlTreesLoaded,
  } = useGetGitLabTreesQuery(
    {
      id: project?.repository || "",
      ref: config.branch,
      recursive: true,
      config: config,
    },
    {
      refetchOnMountOrArgChange: true,
      skip:
        !config.token ||
        !project?.repository ||
        !config.branch ||
        isFetching ||
        isProviderFetching ||
        !isGitLabProvider(config.provider) ||
        !isGitLabProvider(project?.provider),
    },
  );

  const data = isGitLabProvider(project?.provider) ? glData : ghData;
  const isTreesLoading = isGitLabProvider(project?.provider)
    ? isGlTreesLoading
    : isGhTreesLoading;
  const isTreesLoaded = isGitLabProvider(project?.provider)
    ? isGlTreesLoaded
    : isGhTreesLoaded;

  const { trees = [] } = data || {};

  useEffect(() => {
    return () => {
      if (config.repoName) {
        dispatch(resetConfig());
      }
    };
  }, [dispatch, config.repoName]);

  const isLoading =
    isOrgsLoading ||
    isProjectLoading ||
    isProviderLoading ||
    isTreesLoading ||
    isSiteSettingLoading ||
    !config.token;

  let arrangements = config.arrangement;
  const folderList = (files: TFiles[]): TFiles[] => {
    // Guard clause for when files is null/undefined
    if (!files) {
      return [];
    }

    // Guard clause for config
    if (!config.content) {
      return [];
    }

    // If no arrangements or no premium access, return original files
    if (
      !canAccessPremiumFeatures ||
      !arrangements ||
      arrangements.length <= 0
    ) {
      return files;
    }

    return arrangements?.reduce<TFiles[]>((acc, curr) => {
      if (curr.type === "file" || curr.type === "heading") {
        const name = curr.groupName;
        const type = curr.type;
        const { base, dir } = path.parse(curr.targetPath);
        return [
          ...acc,
          {
            name: name,
            ...(curr.type === "file" && {
              realPath: `content/${curr.targetPath}`,
            }),
            path: curr.groupName
              ? `content/${slugify(curr.groupName)}${path.extname(curr.targetPath)}`
              : `content/${curr.targetPath}`,
            children: [],
            sha: null,
            type: type === "heading" ? "heading" : "file",
            isFile: type === "file",
          },
        ];
      } else if (curr.type === "folder") {
        return [
          ...acc,
          {
            name: curr.groupName,
            path: `content/${slugify(curr.groupName)}`,
            sha: null,
            isFile: false,
          },
        ];
      }
      return acc;
    }, []);
  };

  let files = [] as TFiles[];

  if (isTreesLoaded) {
    const rootFolder = trees.find((t) => t.name === "root");
    files = folderList(rootFolder?.children || []);
  }

  const isArchived = project?.status === "archived";

  // Blocked child routes when project is archived
  const blockedSegments = ["/content/", "/media/", "/configs/", "/code/"];
  const isBlockedChildRoute =
    isArchived &&
    blockedSegments.some((seg) =>
      pathname.includes(`/${params.projectId}${seg}`),
    );

  return (
    <>
      <title>{project?.project_name + " - Sitepins"}</title>

      <SidebarPageLayout
        sidebar={
          isLoading ? (
            <SidebarSkeleton />
          ) : (
            <ProjectSidebar
              globalSearch={
                <GlobalSearch
                  open={searchOpen}
                  setOpen={setSearchOpen}
                  files={(trees as TFiles[]) || []}
                  config={config}
                />
              }
              dashboardMenu={projectDashboardMenu}
              settingsMenu={projectSettingsMenu.filter((item) => {
                if (!canAccessPremiumFeatures && item.name === "Arrangement") {
                  return false;
                }
                return true;
              })}
              orgs={orgs!}
              projectContext={{
                orgId: params.orgId.slice(4),
                projectId: params.projectId,
                projectName: project?.project_name!,
                config,
              }}
              navChildren={
                <>
                  {/* Content */}
                  {!isArchived && files.length > 0 && (
                    <ul
                      id="sidebar-content-root"
                      className="sidebar-content-root tree bg-background rounded"
                    >
                      <li>
                        <Accordion
                          defaultValue="config"
                          className={cn("relative")}
                          type="single"
                          collapsible
                        >
                          <AccordionItem value="config" className="border-0">
                            <Link
                              className={cn(
                                "text-foreground w-full rounded pr-0",
                                pathname.includes(
                                  `/${params.orgId}/${params.projectId}/content/${config.content}`,
                                ) ||
                                  pathname.includes(
                                    `/${params.orgId}/${params.projectId}/configs/${config.content}`,
                                  )
                                  ? "bg-background text-primary"
                                  : "",
                              )}
                              href={`/${params.orgId}/${params.projectId}/content/${config.content}`}
                            >
                              <AccordionTrigger
                                className={cn(
                                  "h-auto w-full justify-start space-x-1 py-3 pr-2.5 pl-3 text-sm hover:no-underline",
                                )}
                              >
                                <>
                                  <FileTypeCorner className="inline-block size-5 stroke-[1.5]" />
                                  <span
                                    className={cn(
                                      "flex-1 text-left",
                                      config.content.includes("content") &&
                                        "capitalize",
                                    )}
                                  >
                                    {path.basename(config.content)}
                                  </span>
                                </>
                              </AccordionTrigger>
                            </Link>
                            <AccordionContent className="pl-1">
                              <ul>
                                <Suspense
                                  fallback={Array.from(
                                    { length: 6 },
                                    (_, i) => (i = 1),
                                  ).map((item) => {
                                    return (
                                      <li key={item} className="mb-3 last:mb-0">
                                        <Skeleton className="h-3 w-full" />
                                      </li>
                                    );
                                  })}
                                >
                                  <ContentMenu
                                    files={files}
                                    config={config}
                                    orgId={params.orgId.slice(4)}
                                    projectId={params.projectId}
                                  />
                                </Suspense>
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </li>
                    </ul>
                  )}

                  {/* Code */}
                  {!isArchived && canAccessPremiumFeatures && (
                    <ul className="tree bg-background rounded [--tree-spacing:2rem]">
                      <li>
                        <Accordion
                          className={cn("relative")}
                          type="single"
                          collapsible
                        >
                          <AccordionItem value="code" className="border-0">
                            <AccordionTrigger
                              className={cn(
                                "h-auto w-full justify-start space-x-2 py-3 pr-2.5 pl-3 text-sm hover:no-underline",
                              )}
                            >
                              <>
                                <FileCode2 className="inline-block size-5 stroke-[1.5]" />
                                <span className="flex-1 text-left">
                                  {tSidebar("code")}
                                </span>
                              </>
                            </AccordionTrigger>
                            <AccordionContent className="pl-1">
                              <ul>
                                <Suspense
                                  fallback={Array.from(
                                    { length: 6 },
                                    (_, i) => (i = 1),
                                  ).map((item) => {
                                    return (
                                      <li key={item} className="mb-3 last:mb-0">
                                        <Skeleton className="h-3 w-full" />
                                      </li>
                                    );
                                  })}
                                >
                                  <CodeMenu
                                    files={
                                      trees.find((t) => t.name === "code")
                                        ?.children
                                    }
                                    config={config}
                                    orgId={params.orgId.slice(4)}
                                    projectId={params.projectId}
                                  />
                                </Suspense>
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </li>
                    </ul>
                  )}

                  {/* Config */}
                  {!isArchived && config.configs?.length > 0 && (
                    <ul className="tree bg-background rounded [--tree-spacing:2rem]">
                      <li>
                        <Accordion
                          className={cn("relative")}
                          type="single"
                          collapsible
                        >
                          <AccordionItem value="config" className="border-0">
                            <Link
                              className={cn(
                                "text-foreground w-full rounded pr-0",
                                pathname.includes(
                                  `/${params.orgId}/${params.projectId}/configs/`,
                                )
                                  ? "bg-background text-primary"
                                  : "",
                              )}
                              href={""}
                            >
                              <AccordionTrigger
                                className={cn(
                                  "h-auto w-full justify-start space-x-2 py-3 pr-2.5 pl-3 text-sm hover:no-underline",
                                )}
                              >
                                <>
                                  <FileCog className="inline-block size-5 stroke-[1.5]" />
                                  <span className="flex-1 text-left">
                                    {tSidebar("config")}
                                  </span>
                                </>
                              </AccordionTrigger>
                            </Link>

                            <AccordionContent className="pl-1">
                              <ul>
                                <ConfigsMenu
                                  files={
                                    trees.find((t) => t.name === "theme")
                                      ?.children ?? []
                                  }
                                  config={config}
                                  orgId={params.orgId.slice(4)}
                                  projectId={params.projectId}
                                />
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </li>
                    </ul>
                  )}
                </>
              }
            />
          )
        }
        header={<ProjectHeader project={project} />}
      >
        {isBlockedChildRoute ? (
          <ArchiveBlocked
            orgId={params.orgId}
            projectId={params.projectId}
            t={tDashboard}
          />
        ) : (
          children
        )}
      </SidebarPageLayout>

      {/*  */}
    </>
  );
}

const ArchiveBlocked = ({
  orgId,
  projectId,
  t,
}: {
  orgId: string;
  projectId: string;
  t: any;
}) => (
  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
    <div className="bg-card border-border max-w-xl rounded-lg border p-6">
      <h2 className="mb-2 text-xl font-semibold">
        {t("archived_project.title")}
      </h2>
      <p className="text-muted-foreground mb-4">
        {t("archived_project.description")}
      </p>
      <div className="space-x-2">
        <Link
          href={`/${orgId}/${projectId}?tab=settings`}
          className="btn bg-primary inline-flex items-center rounded px-4 py-2 text-white"
        >
          {t("archived_project.open_settings")}
        </Link>
      </div>
    </div>
  </div>
);
