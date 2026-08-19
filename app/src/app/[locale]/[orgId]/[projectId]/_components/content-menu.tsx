"use client";

import { NavLink } from "@/components/nav-link";
import { cn } from "@/lib/utils/cn";
import { normalizePath } from "@/lib/utils/normalize-path";
import { TConfig, TFiles } from "@/types";
import Link from "next/link";
import { Fragment } from "react";
import { FolderAccordion, useFolderActive } from "./folder-accordion";

const ContentMenu = ({
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

  const resolveHref = (filePath: string) => {
    const normalized = normalizePath(filePath).replace(/^content\//, "");
    return `/org-${orgId}/${projectId}/content/${normalized}`;
  };

  function render(item: TFiles, index: number) {
    const hasFolder = item.children?.findIndex((child) => !child.isFile);
    const isIncluded = item.path && !item.path.includes("undefined");

    if (!isIncluded) return null;

    return isIncluded && !item.isFile ? (
      <li key={item.path}>
        {hasFolder !== undefined && hasFolder !== -1 ? (
          <FolderAccordion
            index={index}
            isActive={
              isFolderActive(item.path) &&
              !(
                item.path
                  .replace("content/", "")
                  .startsWith(config.content || "") &&
                item.path.replace("content/", "") === config.content
              )
            }
            className={className}
            trigger={
              <Link
                className={cn(
                  "text-foreground hover:text-primary group flex flex-1 items-center justify-between rounded transition-colors",
                  isFolderActive(item.path) &&
                    !(
                      item.path
                        .replace("content/", "")
                        .startsWith(config.content || "") &&
                      item.path.replace("content/", "") === config.content
                    )
                    ? "text-primary"
                    : "",
                )}
                href={resolveHref(item.path)}
              >
                <span className="flex-1 text-start text-inherit">
                  {item.name}
                </span>
              </Link>
            }
          >
            <ContentMenu
              key={item.path}
              files={item.children}
              config={config}
              orgId={orgId}
              projectId={projectId}
            />
          </FolderAccordion>
        ) : (
          <NavLink
            key={item.path}
            className="text-foreground hover:text-primary hover:bg-muted/50 ms-2 flex items-center rounded px-2 py-2.5 transition-colors"
            href={resolveHref(item.path)}
            activeClassName="bg-muted text-primary"
          >
            <span className="flex-1 text-start text-inherit">{item.name}</span>
          </NavLink>
        )}
      </li>
    ) : (
      <ContentMenu
        key={item.path}
        files={item.children}
        config={config}
        orgId={orgId}
        projectId={projectId}
      />
    );
  }

  return files?.map((item, index) => {
    if (item.type === "heading") {
      return (
        <li key={item.path + "_" + index}>
          <NavLink
            className="bg-primary! my-2 ms-2 flex cursor-default items-center rounded-sm px-2 py-1 text-white!"
            activeClassName="bg-background text-primary"
            href={``}
            key={item.path + "_" + index}
          >
            {item.name}
          </NavLink>
        </li>
      );
    }

    if (item.type === "file") {
      return (
        <li key={item.path + "_" + item.type + "_" + index}>
          <NavLink
            className="text-foreground hover:text-primary hover:bg-muted/50 ms-2 flex items-center rounded px-2 py-2.5 transition-colors"
            activeClassName="bg-muted text-primary"
            href={resolveHref(item.path)}
          >
            <span className="flex-1 text-start">{item.name}</span>
          </NavLink>
        </li>
      );
    }

    return (
      <Fragment key={item.path + "_" + index}>
        {render({ ...item, children: item.children }, index)}
      </Fragment>
    );
  });
};

export default ContentMenu;
