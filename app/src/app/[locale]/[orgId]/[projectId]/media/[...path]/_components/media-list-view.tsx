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
import { useGitProvider } from "@/hooks/use-git-provider";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import { selectMediaInfo } from "@/redux/features/media/slice";
import { TFiles } from "@/types";
import { FolderClosedIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSelector } from "react-redux";
import ImageSidebar from "./media-sidebar";

const ListRow = ({ file }: { file: TFiles }) => {
  const { view } = useSelector(selectMediaInfo);
  const tMedia = useTranslations("media");
  const { isFile, path: filepath, isNew, isReplace } = file;

  const { useGitContent, useGitCommits, adapter } = useGitProvider();
  const mediaPath = filepath.replace("media/", "");

  const { data } = useGitContent(mediaPath, {
    skip: view !== "list" || !isFile,
  });

  const { data: commit } = useGitCommits({
    path: mediaPath,
    skip: view !== "list",
  });

  const commitDate = adapter.commitDate(commit?.[0]);

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
