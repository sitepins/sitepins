"use client";

import config from "@/lib/config";
import { cn } from "@/lib/utils/cn";
import Link, { LinkProps } from "next/link";
import { useParams, usePathname } from "next/navigation";
import path from "path";

const allowedExtensions = config.allowExtensions;

export function NavLink({
  className,
  activeClassName,
  href,
  children,

  ...rest
}: LinkProps & {
  className?: string;
  children: React.ReactNode;
  activeClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  target?: string;
}) {
  const params = useParams();
  let pathname = usePathname();
  pathname = decodeURIComponent(pathname);

  const orgId = params?.orgId;
  const projectId = params?.projectId;
  const basePrefix = `/${orgId}/${projectId}/`;

  // Get current pure path by stripping common prefixes
  const prefixes = ["content/", "configs/", "code/"];
  let currentPath = "";
  for (const prefix of prefixes) {
    if (pathname.startsWith(basePrefix + prefix)) {
      currentPath = pathname.replace(basePrefix + prefix, "");
      break;
    }
  }

  // If no prefix matched, fallback to params
  if (!currentPath) {
    currentPath =
      (params?.file as string[])?.join("/") ||
      (params?.path as string[])?.join("/") ||
      "";
  }

  const useInclude = allowedExtensions.includes(path.extname(pathname));
  const isCodeHref = pathname.includes("code");

  // Get the href path without any of the prefixes for comparison
  let hrefPath = href as string;
  for (const prefix of prefixes) {
    if (hrefPath.includes(basePrefix + prefix)) {
      hrefPath = hrefPath.replace(basePrefix + prefix, "");
      break;
    }
  }

  // For folders, check if the current path starts with the folder path
  // and ensure it's an exact match (not just a parent folder)
  const isActiveFolder =
    currentPath.startsWith(hrefPath + "/") || currentPath === hrefPath;

  const currentPathNoExt = currentPath.replace(path.extname(currentPath), "");
  const hrefPathNoExt = hrefPath.replace(path.extname(hrefPath), "");
  const isExactFileMatch =
    currentPathNoExt === hrefPathNoExt && currentPathNoExt !== "";

  const isActive = isCodeHref
    ? isActiveFolder
    : pathname === href ||
      (useInclude && isActiveFolder) ||
      isActiveFolder ||
      isExactFileMatch;

  return (
    <Link
      href={href}
      className={cn(className, isActive && activeClassName)}
      onClick={(e) => {
        if (rest.target === "_blank") return;
        if (rest.onClick) rest.onClick(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
