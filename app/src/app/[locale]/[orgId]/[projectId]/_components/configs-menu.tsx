"use client";

import { NavLink } from "@/components/nav-link";
import { cn } from "@/lib/utils/cn";
import { sanitizedPath } from "@/lib/utils/common";
import { TConfig, TFiles } from "@/types";
import path from "path";
import { FolderAccordion, useFolderActive } from "./folder-accordion";

const ConfigsMenu = ({
  files,
  className,
  config,
  orgId,
  projectId,
}: {
  files: TFiles[] | undefined;
  config: TConfig;
  className?: string;
  orgId: string;
  projectId: string;
}) => {
  const isFolderActive = useFolderActive(orgId, projectId);

  const resolveHref = (filePath: string) =>
    `/org-${orgId}/${projectId}/configs/${filePath.replace("content/", "")}`;

  return files?.map((file, index) => {
    const isIncluded = config.configs?.some((item: string) => {
      const { ext } = path.parse(item);
      if (ext) {
        return file.path.includes(item);
      }
      return file.path.includes(sanitizedPath(item) + "/");
    });

    if (!isIncluded) {
      if (file.children) {
        return (
          <ConfigsMenu
            key={index}
            files={file.children}
            config={config}
            orgId={orgId}
            projectId={projectId}
          />
        );
      }
      return null;
    }

    if (file.children && file.children.length > 0) {
      return (
        <li key={file.path}>
          <FolderAccordion
            index={index}
            isActive={isFolderActive(file.path)}
            className={className}
            trigger={
              <NavLink
                className={cn(
                  "text-foreground hover:text-primary ml-1 flex flex-1 items-center justify-between rounded py-2.5 pr-2.5 transition-colors",
                )}
                href={resolveHref(file.path)}
                activeClassName={
                  file.path.replace("content/", "") !== config.content
                    ? "text-primary"
                    : ""
                }
              >
                <span className="flex-1 text-left text-inherit">
                  {file.name}
                </span>
              </NavLink>
            }
          >
            <ConfigsMenu
              key={index}
              files={file.children}
              config={config}
              orgId={orgId}
              projectId={projectId}
            />
          </FolderAccordion>
        </li>
      );
    }

    return (
      <li key={file.path}>
        <NavLink
          className="text-foreground hover:text-primary hover:bg-muted/50 ml-1 flex items-center rounded px-2.5 py-2.5 transition-colors"
          activeClassName="bg-muted text-primary"
          href={resolveHref(file.path)}
        >
          <span className="text-inherit">{file.name}</span>
        </NavLink>
      </li>
    );
  });
};

export default ConfigsMenu;
