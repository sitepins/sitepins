"use client";

import dateFormat from "@/lib/utils/date-format";
import { normalizePath } from "@/lib/utils/normalize-path";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubCommitsQuery } from "@/redux/features/github";
import { useGetGitLabCommitsQuery } from "@/redux/features/gitlab";
import { TFiles } from "@/types";
import { PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import path from "path";
import { useSelector } from "react-redux";
import { getFileIcon } from "../code/[...file]/_components/file-icons";
import FileAction from "./file-actions";

export default function CodeFileRow({ file }: { file: TFiles }) {
  const tDirectoryView = useTranslations("directory-view");
  const config = useSelector(selectConfig);
  const params = useParams() as { orgId: string; projectId: string };
  const fileName = file.path.replace("content/", "");

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
      id: `${config.owner}/${config.repoName}`,
      ref: config.branch,
      path: fileName,
    },
    {
      skip: !isGitLabProvider(config.provider),
    },
  );

  const baseName = path.basename(fileName);
  const commit = isGitLabProvider(config.provider) ? glCommit : ghCommit;
  const lastCommit = commit?.[0];
  const commitDate = isGitLabProvider(config.provider)
    ? (lastCommit as any)?.committed_date
    : (lastCommit as any)?.commit?.author?.date;
  const fileIcon = getFileIcon(fileName);

  return (
    <div
      className="border-border grid-cols-12 items-center overflow-hidden rounded border p-4 px-6 *:py-2 md:grid md:rounded-none md:border-0 md:border-transparent md:p-0"
      key={file.name}
    >
      <div className="text-secondary-foreground col-span-5 flex h-full items-center justify-between overflow-hidden py-0! text-ellipsis">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3 pr-2 md:px-4 md:no-underline">
          {fileIcon}
          <Link
            className="text-foreground group/link inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline"
            href={`/${params.orgId}/${params.projectId}/code/${normalizePath(fileName)}`}
          >
            <span className="line-clamp-1">{baseName}</span>
            <PenLine className="text-muted-foreground hidden size-3 shrink-0 group-hover/link:inline-block" />
          </Link>
        </div>
      </div>
      <div className="col-span-3 flex items-center justify-between md:text-center">
        <p className="text-foreground text-left text-sm font-medium">
          <span className="md:hidden">{tDirectoryView("size")}: </span>
          <span className="line-clamp-1 inline md:block">
            {(file as any).size
              ? `${((file as any).size / 1024).toFixed(1)} KB`
              : "-"}
          </span>
        </p>

        <div className="md:hidden">
          <p className="text-foreground text-sm font-medium">
            {commitDate ? dateFormat(commitDate) : tDirectoryView("na")}
          </p>
        </div>
      </div>
      <div className="col-span-3 hidden text-left md:block">
        <p className="text-foreground text-sm font-medium">
          {commitDate ? dateFormat(commitDate) : tDirectoryView("na")}
        </p>
      </div>
      <div className="col-span-1 hidden text-center md:block">
        <FileAction file={file} />
      </div>
    </div>
  );
}
