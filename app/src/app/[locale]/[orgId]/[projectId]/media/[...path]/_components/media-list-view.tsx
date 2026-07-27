"use client";

import SafeImage from "@/components/safe-image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import VideoThumbnail from "@/components/video-thumbnail";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubCommitsQuery,
  useGetGitHubContentQuery,
} from "@/redux/features/github";
import {
  useGetGitLabCommitsQuery,
  useGetGitLabContentQuery,
} from "@/redux/features/gitlab";
import { selectMediaInfo } from "@/redux/features/media/slice";
import { TFiles } from "@/types";
import { FolderClosedIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSelector } from "react-redux";
import ImageSidebar from "./media-sidebar";

const ListRow = ({ file }: { file: TFiles }) => {
  const config = useSelector(selectConfig);
  const { branch, owner, repoName, provider } = config;
  const { view } = useSelector(selectMediaInfo);
  const tMedia = useTranslations("media");
  const { isFile, path: filepath, isNew, isReplace } = file;

  const { data: ghData } = useGetGitHubContentQuery(
    {
      owner,
      repo: repoName,
      path: `${filepath.replace("media/", "")}`,
      ref: branch,
    },
    {
      skip: view !== "list" || !isGitHubProvider(provider) || !isFile,
    },
  );

  const { data: glData } = useGetGitLabContentQuery(
    {
      id: `${owner}/${repoName}`,
      file_path: filepath.replace("media/", ""),
      ref: branch,
    },
    {
      skip: view !== "list" || !isGitLabProvider(provider) || !isFile,
    },
  );

  const data = isGitLabProvider(provider) ? glData : ghData;

  const { data: ghCommit } = useGetGitHubCommitsQuery(
    {
      owner,
      repo: repoName,
      path: filepath.replace("media/", ""),
      sha: branch,
    },
    {
      skip: view !== "list" || !isGitHubProvider(provider),
    },
  );

  const { data: glCommit } = useGetGitLabCommitsQuery(
    {
      id: `${owner}/${repoName}`,
      ref: branch,
      path: filepath.replace("media/", ""),
    },
    {
      skip: view !== "list" || !isGitLabProvider(provider),
    },
  );

  const commit = isGitLabProvider(provider) ? glCommit : ghCommit;

  const commitDate = isGitLabProvider(provider)
    ? // @ts-ignore
      commit?.[0]?.committed_date
    : // @ts-ignore
      commit?.[0]?.commit.author?.date;

  const date = commitDate
    ? new Date(commitDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : tMedia("not_available");

  const params = useParams();

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-[50%]">
        <div className="relative h-12">
          <ImageSidebar
            file={file}
            asChild
            className="h-full w-full cursor-pointer space-x-3"
          >
            {isFile ? (
              <div className="flex items-center">
                {isNew && (
                  <Badge variant={"destructive"} className="static block">
                    {tMedia("new")}
                  </Badge>
                )}

                {isReplace && (
                  <Badge variant={"muted"} className="static block">
                    {tMedia("replaced")}
                  </Badge>
                )}
                <div className="max-w-18.25 flex-1">
                  <AspectRatio
                    ratio={16 / 9}
                    className={cn(
                      "relative max-w-18.25",
                      isFile && "bg-stripes rounded-sm",
                    )}
                  >
                    <SafeImage
                      lazy
                      path={filepath.replace("/media", "")}
                      alt={file.name}
                      renderContent={
                        isVideo(filepath)
                          ? ({ src, ref, isFetching }) => (
                              <VideoThumbnail
                                ref={ref}
                                isFetching={isFetching}
                                alt={file.name}
                                src={src}
                              />
                            )
                          : undefined
                      }
                    />
                  </AspectRatio>
                </div>
                <p className="line-clamp-1 max-w-125 flex-1">{file.name}</p>
              </div>
            ) : (
              <div className="relative inline-flex items-center">
                <Link
                  href={`/${params.orgId}/${params.projectId}/${filepath}`}
                  className="hover:text-primary relative flex items-center gap-2 transition-colors hover:underline"
                >
                  <FolderClosedIcon stroke="currentColor" className="size-8" />
                  <span className="text-primary relative text-sm font-medium">
                    {file.name}
                  </span>

                  {isNew && (
                    <Badge
                      variant={"destructive"}
                      className="absolute top-0 -right-14"
                    >
                      {tMedia("new")}
                    </Badge>
                  )}
                </Link>
              </div>
            )}
          </ImageSidebar>
        </div>
      </TableCell>
      <TableCell className="w-[20%] text-center">{date}</TableCell>
      <TableCell className="w-[15%] text-right">
        {(file.size || data?.size) &&
          `${Math.ceil((file.size || data?.size || 0) / 1024)} kb`}
      </TableCell>
    </TableRow>
  );
};

export default function ListView({ items }: { items: TFiles[] }) {
  const tMedia = useTranslations("media");
  return (
    <div className="mt-7">
      <div className="border-border mb-3 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0! hover:bg-transparent">
              <TableHead className="w-[50%]">{tMedia("image")}</TableHead>
              <TableHead className="w-[20%] text-center">
                {tMedia("last_modified")}
              </TableHead>
              <TableHead className="w-[15%] text-right">
                {tMedia("size")}
              </TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      <div className="border-border rounded-lg border">
        <Table>
          <TableBody>
            {items.map((file) => {
              return <ListRow key={file.path} file={file} />;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
