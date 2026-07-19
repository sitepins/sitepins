"use client";

import SafeImage from "@/components/safe-image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import VideoThumbnail from "@/components/video-thumbnail";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import { TFiles } from "@/types";
import { Folder, FolderClosed, FolderIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ImageSidebar from "./media-sidebar";
import MediaUpload from "./media-upload";
import { useTranslations } from "next-intl";

export default function GridView({ items }: { items: TFiles[] }) {
  const params = useParams();
  const tMedia = useTranslations("media");

  return (
    <div
      className={cn(
        "relative mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6",
        items.length <= 0 && "flex-1",
      )}
    >
      {items.length <= 0 ? (
        <div className="col-span-6 flex h-full flex-col items-center justify-center space-y-4 py-12 text-center">
          <div className="bg-muted/50 flex size-14 items-center justify-center rounded-2xl">
            <Folder className="size-7" />
          </div>
          <h2 className="text-center text-xl font-medium">
            {tMedia("nothing_to_see")}
          </h2>
          <div>
            <MediaUpload className="relative" type="button">
              <FolderIcon className="mr-1.5 size-4" />
              <span>{tMedia("upload")}</span>
            </MediaUpload>
          </div>
        </div>
      ) : (
        items.map((file, index) => {
          const { isFile, isNew, name, path: filepath, isReplace } = file;
          return (
            <div key={file.path + "_" + index} className="relative">
              <ImageSidebar
                file={file}
                className="h-full w-full hover:opacity-100"
              >
                <Card className="h-auto gap-0 overflow-hidden pt-0 shadow-none">
                  {!isFile && (
                    <Link
                      className="absolute inset-0 z-10"
                      href={`/${params.orgId}/${params.projectId}/${filepath}`}
                    />
                  )}
                  <CardContent className="relative p-0">
                    <AspectRatio
                      ratio={4 / 3}
                      className={cn("bg-light", isFile && "bg-stripes")}
                    >
                      {isFile ? (
                        // show a thumbnail for video files by capturing a frame,
                        // otherwise render images as before
                        (() => {
                          const isVideoFile = isVideo(filepath || name);

                          return (
                            <SafeImage
                              lazy
                              path={filepath}
                              alt={name}
                              renderContent={
                                isVideoFile
                                  ? ({ src, ref, isFetching }) => (
                                      <VideoThumbnail
                                        ref={ref}
                                        isFetching={isFetching}
                                        alt={name}
                                        src={src}
                                      />
                                    )
                                  : undefined
                              }
                            />
                          );
                        })()
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FolderClosed
                            stroke="currentColor"
                            className="mx-auto size-14"
                          />
                        </div>
                      )}
                    </AspectRatio>

                    {isNew && (
                      <Badge
                        variant={"destructive"}
                        className="absolute top-2 right-2"
                      >
                        {tMedia("new")}
                      </Badge>
                    )}

                    {isReplace && (
                      <Badge
                        variant={"muted"}
                        className="absolute top-2 right-2"
                      >
                        {tMedia("replaced")}
                      </Badge>
                    )}
                  </CardContent>
                  <CardFooter className="px-4 py-2 pt-2 pb-3.5">
                    <p className="text-secondary-foreground line-clamp-1 w-full text-left text-sm">
                      {name}
                    </p>
                  </CardFooter>
                </Card>
              </ImageSidebar>
            </div>
          );
        })
      )}
    </div>
  );
}
