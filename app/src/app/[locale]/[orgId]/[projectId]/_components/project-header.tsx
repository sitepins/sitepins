"use client";

import ProjectSwitcher from "@/components/project-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCHEMA_FOLDER } from "@/lib/constant";
import { getProjectSettingsMenu } from "@/lib/menu";
import { cn } from "@/lib/utils/cn";
import { generateSchemaName } from "@/lib/utils/schema-generator";
import { useVercelIntegration } from "@/hooks/use-vercel-integration";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetProjectsQuery } from "@/redux/features/project/project-api";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import FolderActions from "./folder-actions";
import PreviewButton from "./preview-button";

export default function ProjectHeader({ project }: { project: any }) {
  const tCommon = useTranslations("common");
  const tMedia = useTranslations("media");
  // Org id from the URL, not the async project query — while the project is
  // loading, project?.org_id is undefined and links would point to
  // "/org-undefined" (which Next.js then prefetches).
  const params = useParams();
  const rawOrgId = params?.orgId as string;
  const orgIdSafe = rawOrgId?.startsWith("org-") ? rawOrgId.slice(4) : rawOrgId;
  const { data: projects = [] } = useGetProjectsQuery(orgIdSafe, {
    skip: !orgIdSafe,
  });

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = useSelector(selectConfig);
  const projectSettingsMenu = getProjectSettingsMenu(tCommon("locale") as any);
  const { vercelToken, vercelTeamId, vercelProjectId } = useVercelIntegration(
    project?.org_id ?? "",
  );

  // Determine if we're in editor mode (viewing/editing a file)
  const isEditorMode = pathname && /\.[a-zA-Z0-9]+$/.test(pathname);

  // Hide header completely in editor mode
  if (isEditorMode) {
    return null;
  }

  // Determine title and folder info
  let middleTitle = null;
  let folderActionsProps = null;

  if (pathname) {
    const normalizedPath = pathname.replace(/\/$/, "");
    const pathSegments = normalizedPath
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    // Dashboard check
    if (pathSegments.length === 2 && pathSegments[0].startsWith("org-")) {
      middleTitle = tCommon("overview");
    }
    // Folder View Check
    else if (
      pathSegments.length >= 4 &&
      (pathSegments[2] === "content" || pathSegments[2] === "code")
    ) {
      const folderNameSlug = pathSegments[pathSegments.length - 1];
      const folderName =
        folderNameSlug.charAt(0).toUpperCase() + folderNameSlug.slice(1);
      middleTitle = folderName;

      // Prepare props for FolderActions menu
      if (config.content) {
        const fileSegments = pathSegments.slice(3);
        const filePathStr = fileSegments.join("/");
        const schemaName = generateSchemaName(filePathStr, config.content);
        let schemaDir = SCHEMA_FOLDER + "/" + schemaName + ".json";

        // Check if it's a content route to determine if schema should be shown
        const isContentRoute =
          config.content &&
          (filePathStr === config.content ||
            filePathStr.startsWith(config.content + "/"));

        if (!isContentRoute) {
          schemaDir = undefined as any;
        }

        folderActionsProps = {
          schemaDir,
          targetPath: `${project?.org_id}/${project?.project_id}`,
          folderName: folderNameSlug,
          filePath: filePathStr,
          group: searchParams.get("group") || "",
          size: "lg" as const,
        };
      }
    }
    // Media View Check
    else if (pathSegments.length >= 3 && pathSegments[2] === "media") {
      middleTitle = tMedia("title");
      const folderNameSlug = pathSegments[pathSegments.length - 1];
      const fileSegments = pathSegments.slice(3);
      const filePathStr = fileSegments.join("/");

      folderActionsProps = {
        targetPath: `${project?.org_id}/${project?.project_id}`,
        folderName: folderNameSlug,
        filePath: filePathStr,
        group: searchParams.get("group") || "",
        size: "lg" as const,
        variant: "ghost" as const,
        className: "hover:bg-transparent px-0",
      };
    }
  }

  const isSettingsPage = pathname?.includes("/settings/");

  if (isSettingsPage) {
    const activeSetting = projectSettingsMenu.find((item) => {
      const href = item.href({
        orgId: orgIdSafe,
        projectId: project?.project_id,
      });
      return pathname.startsWith(href);
    });
    middleTitle = activeSetting ? activeSetting.name : tCommon("settings");
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
        currentProject={project}
        orgId={orgIdSafe}
        className="hidden w-60 justify-between xl:flex"
      />

      {/* Middle: Dynamic Title */}
      <div className="flex-1 text-left xl:text-center">
        {middleTitle && (
          <h1 className="flex items-center justify-start text-lg font-semibold xl:justify-center">
            {middleTitle}
            {middleTitle === tCommon("overview") &&
              project?.status === "archived" && (
                <Badge variant="destructive" className="ml-2">
                  {tCommon("archived")}
                </Badge>
              )}
          </h1>
        )}
      </div>

      {/* Right: Preview Button + Folder MenuActions */}
      <div className="flex w-60 items-center justify-end gap-2">
        {/* Show Preview button when project has a connected git repo */}
        {project?.repository &&
          project?.branch &&
          project?.project_id &&
          config.token && (
            <PreviewButton
              repository={project.repository}
              branch={project.branch}
              token={config.token}
              provider={project.provider}
              generator={project.generator}
              vercelToken={vercelToken}
              vercelTeamId={vercelTeamId}
              vercelProjectId={vercelProjectId}
              spProjectId={project?.project_id}
            />
          )}
        {folderActionsProps && <FolderActions {...folderActionsProps} />}
        {(middleTitle === tCommon("overview") || isSettingsPage) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 px-0">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit">
              {projectSettingsMenu.map((item) => (
                <DropdownMenuItem key={item.name} asChild>
                  <Link
                    href={item.href({
                      orgId: orgIdSafe,
                      projectId: project?.project_id,
                    })}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
