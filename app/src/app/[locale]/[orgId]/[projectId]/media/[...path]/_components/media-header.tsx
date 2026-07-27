"use client";

import Search from "@/components/search";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { sorts, views } from "@/lib/utils/filter-options";
import { selectConfig } from "@/redux/features/config/slice";
import {
  selectMediaInfo,
  setSortBy,
  setView,
} from "@/redux/features/media/slice";
import { useAppDispatch } from "@/redux/store";
import { FolderClosed, FolderIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { useTranslations } from "next-intl";
import MediaUpload from "./media-upload";

export default function MediaHeader() {
  const { view, sortby } = useSelector(selectMediaInfo);
  const dispatch = useAppDispatch();
  const params = useParams();
  const config = useSelector(selectConfig);
  const tMedia = useTranslations("media");

  const directory = useMemo(() => {
    const files = params.path as string[];
    return files.map((item) => decodeURIComponent(item));
  }, [params.path]);

  useEffect(() => {
    window.scroll({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [params]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto] lg:justify-between">
        <div className="grid w-full grid-cols-[1fr_auto] gap-2 lg:grid-cols-1">
          <Search className="h-10 flex-1 [&_input]:h-10" />
          <MediaUpload className="relative h-10 lg:hidden" type="button">
            <FolderIcon className="mr-1.5 size-4" />
            <span className="hidden sm:inline-block">{tMedia("upload")}</span>
          </MediaUpload>
        </div>
        <div className="grid w-full grid-cols-[1fr_auto] gap-2 lg:grid-cols-[auto_auto_auto]">
          <Select
            value={sortby}
            onValueChange={(value) => {
              dispatch(setSortBy(value));
            }}
          >
            <SelectTrigger className="w-full data-[size=default]:h-10 lg:w-45">
              <SelectValue placeholder={tMedia("sort_by")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sorts.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {tMedia(`sort_options.${item.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="border-border flex h-10 items-center rounded-lg border">
            {views.map((item) => (
              <Button
                key={item.value}
                onClick={() => dispatch(setView(item.value as any))}
                type="button"
                variant={"ghost"}
                className={cn(
                  "relative h-10",
                  view === item.value && "bg-light",
                )}
                title={tMedia(
                  item.value === "grid" ? "view_grid" : "view_list",
                )}
              >
                <item.icon className="size-5" />
              </Button>
            ))}
          </div>
          <MediaUpload className="relative hidden h-10 lg:flex" type="button">
            <FolderIcon className="mr-1.5 size-4" />
            <span>{tMedia("upload")}</span>
          </MediaUpload>
        </div>
      </div>

      <Breadcrumb className="mt-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <FolderClosed className="size-4" />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {(() => {
            const mediaSegments =
              config.media?.split("/").filter(Boolean) || [];
            const lastMediaSegment = mediaSegments[mediaSegments.length - 1];
            const skipCount = lastMediaSegment
              ? Math.max(0, directory.lastIndexOf(lastMediaSegment))
              : 0;

            return directory.slice(skipCount).map((item, index) => {
              const actualIndex = index + skipCount;
              return (
                <React.Fragment key={actualIndex}>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        href={`/${params?.orgId}/${params?.projectId}/media/${directory
                          .slice(0, actualIndex + 1)
                          .join("/")}`}
                      >
                        {item}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {actualIndex !== directory.length - 1 && (
                    <BreadcrumbSeparator />
                  )}
                </React.Fragment>
              );
            });
          })()}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
