"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dateFormat from "@/lib/utils/date-format";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { slugify } from "@/lib/utils/text-converter";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubCommitsQuery,
  useGetGitHubContentQuery,
} from "@/redux/features/github";
import {
  useGetGitLabCommitsQuery,
  useGetGitLabContentQuery,
} from "@/redux/features/gitlab";
import { TFiles } from "@/types";
import { EllipsisVertical, PenLine } from "lucide-react";
import { useInView } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import path from "path";
import { useRef } from "react";
import { useSelector } from "react-redux";
import FileAction from "./file-actions";
import FileStatus from "./file-status";

export default function FileRow({ file }: { file: TFiles }) {
  const tDirectoryView = useTranslations("directory-view");
  const config = useSelector(selectConfig);
  const pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const fileName = file.path.replace("content/", "");
  const arrangement = config?.arrangement.find(
    (arrangement) =>
      arrangement.targetPath === fileName && arrangement.type === "file",
  );
  const groupName = arrangement?.groupName;
  const isInView = useInView(container, { once: true });
  const {
    data: ghResponse,
    isLoading: isGhLoading,
    isSuccess: isGhSuccess,
  } = useGetGitHubContentQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      path: fileName,
      ref: config.branch,
      parser: true,
    },
    {
      skip: !isInView || !isGitHubProvider(config.provider) || !file.isFile,
    },
  );

  const {
    data: glResponse,
    isLoading: isGlLoading,
    isSuccess: isGlSuccess,
  } = useGetGitLabContentQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      file_path: fileName,
      ref: config.branch,
      parser: true,
    },
    {
      skip: !isInView || !isGitLabProvider(config.provider) || !file.isFile,
    },
  );

  const response = isGitLabProvider(config.provider) ? glResponse : ghResponse;
  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;
  const isSuccess = isGitLabProvider(config.provider)
    ? isGlSuccess
    : isGhSuccess;

  const { data: ghCommit } = useGetGitHubCommitsQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      path: fileName,
      sha: config.branch,
    },
    {
      skip: !isGitHubProvider(config.provider),
    },
  );

  const { data: glCommit } = useGetGitLabCommitsQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      path: fileName,
    },
    {
      skip: !isGitLabProvider(config.provider),
    },
  );

  const commit = isGitLabProvider(config.provider) ? glCommit : ghCommit;

  if (!isSuccess || isLoading) {
    return (
      <div
        ref={container}
        className="border-border/20 grid grid-cols-12 items-center overflow-hidden px-6 *:py-2 2xl:px-8"
        key={file.name}
      >
        <div className="text-secondary-foreground col-span-4 flex h-full items-center overflow-hidden py-0! text-ellipsis">
          <Skeleton className="h-6 w-4/5" />
        </div>
        <div className="text-foreground col-span-2 text-sm font-medium">
          <p className="line-clamp-1">{slugify(path.parse(file.name).name)}</p>
        </div>
        <div className="col-span-4 flex items-center justify-center text-center">
          <Skeleton className="h-6 w-4/5" />
        </div>
        <div className="col-span-1 text-left">
          <Skeleton className="h-6 w-4/5" />
        </div>
        <div className="col-span-1 text-right">
          <Button
            className="text-muted-foreground"
            variant={"ghost"}
            size={"icon"}
          >
            <EllipsisVertical className="text-secondary-foreground mx-auto" />
          </Button>
        </div>
      </div>
    );
  }

  const { data } = (response as any) || {};
  const title = data?.title?.trim() || groupName || fileName;
  const { name, ext } = path.parse(fileName);
  const commitDate = isGitLabProvider(config.provider)
    ? // @ts-ignore
      commit?.[0]?.committed_date
    : // @ts-ignore
      commit?.[0]?.commit.author?.date;
  const date = commitDate;

  return (
    <div
      className="border-border grid-cols-12 items-center overflow-hidden rounded border p-4 px-6 *:py-2 md:grid md:rounded-none md:border-0 md:border-transparent md:p-0"
      key={file.name}
    >
      <div className="text-secondary-foreground col-span-4 flex h-full items-center justify-between overflow-hidden py-0! text-ellipsis">
        <Link
          className="text-foreground group/link inline-flex items-center gap-2 pr-2 text-sm font-semibold underline underline-offset-4 hover:underline md:px-4 md:no-underline"
          href={`${pathname}/${name}${ext}`}
        >
          <span className="line-clamp-1">{title}</span>
          <PenLine className="text-muted-foreground hidden size-3 shrink-0 group-hover/link:inline-block" />
        </Link>

        <div className="md:hidden">
          <FileAction file={file} className="size-6 [&>svg]:size-4" />
        </div>
      </div>
      <div className="text-foreground col-span-2 text-sm font-medium">
        <span className="md:hidden">{tDirectoryView("slug")}: </span>
        <p className="line-clamp-1 inline md:block">
          {slugify(path.parse(file.name).name)}
        </p>
      </div>
      <div className="col-span-4 flex items-center justify-between md:justify-center md:text-center">
        <p className="text-foreground text-center text-sm font-medium">
          {date ? dateFormat(date) : tDirectoryView("na")}
        </p>

        <div className="md:hidden">
          <FileStatus draft={!!data?.draft} />
        </div>
      </div>
      <div className="col-span-1 hidden text-left md:block">
        <FileStatus draft={!!data?.draft} />
      </div>
      <div className="col-span-1 hidden text-right md:block lg:text-center">
        <FileAction file={file} />
      </div>
    </div>
  );
}
