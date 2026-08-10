"use client";

import SafeImage from "@/components/safe-image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VideoThumbnail from "@/components/video-thumbnail";
import { useGitProvider } from "@/hooks/use-git-provider";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { TFiles } from "@/types";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Download,
  PenLine,
  Replace,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import path from "path";
import { useState } from "react";
import { useSelector } from "react-redux";
import MediaDelete from "./media-delete";
import MoveItem from "./media-move";
import MediaRename from "./media-rename";
import MediaUpload from "./media-upload";

export default function MediaSidebar({
  children,
  file: { isFile, name, path: filepath },
  ...props
}: {
  file: TFiles;
  children?: React.ReactNode;
} & ButtonProps) {
  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");
  const tMenu = useTranslations("navigation.menu");
  const { provider } = useSelector(selectConfig);
  const [selectedId, setSelectedImage] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { useGitCommits, useGitImage, adapter } = useGitProvider();
  const mediaPath = filepath.replace("media/", "");

  const { data: commit } = useGitCommits({
    path: mediaPath,
    skip: !selectedId,
  });
  const { data } = useGitImage(mediaPath, { skip: !selectedId });

  const date = adapter.commitDate(commit?.[0]);

  const downloadUrl = (() => {
    if (isGitHubProvider(provider) && data?.content) {
      const ext = path.extname(filepath).toLowerCase();
      let mimeType = ext.slice(1);
      if (ext === ".svg") {
        mimeType = "svg+xml";
      } else if (ext === ".jpg" || ext === ".jpeg") {
        mimeType = "jpeg";
      }
      const type = isVideo(filepath) ? "video" : "image";
      return `data:${type}/${mimeType};base64,${data.content}`;
    }

    if (isGitHubProvider(provider)) {
      return data?.download_url;
    }

    if (isGitLabProvider(provider) && data?.content) {
      const ext = path.extname(filepath).toLowerCase();
      let mimeType = ext.slice(1);
      if (ext === ".svg") {
        mimeType = "svg+xml";
      } else if (ext === ".jpg" || ext === ".jpeg") {
        mimeType = "jpeg";
      }
      const type = isVideo(filepath) ? "video" : "image";
      return `data:${type}/${mimeType};base64,${data.content}`;
    }
    return null;
  })();

  return (
    <>
      <Drawer
        open={drawerOpen}
        onOpenChange={(isOpen) => {
          if (!isFile) return;
          setDrawerOpen(isOpen);
          if (!isOpen) {
            setSelectedImage(null);
            setDimensions(null);
          }
        }}
        {...(!isFile && { open: false })}
        swipeDirection="right"
        modal
      >
        <DrawerTrigger
          {...props}
          onClick={() => {
            if (isFile) {
              setSelectedImage(filepath);
              setDimensions(null);
            }
          }}
        >
          {children}
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {tMenu("project_dashboard.media")} {tCommon("overview")}
              {downloadUrl && (
                <Button variant="ghost" size="icon" className="h-6">
                  <a
                    href={downloadUrl}
                    download={name}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="size-3.5" />
                  </a>
                </Button>
              )}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            <AspectRatio ratio={4 / 3} className="bg-stripes rounded">
              <SafeImage
                lazy
                alt={name}
                path={filepath.replace("/media", "")}
                renderContent={({ src, ref, isFetching }) => {
                  const isVideoFile = isVideo(filepath || src);

                  if (isVideoFile) {
                    return (
                      <VideoThumbnail
                        ref={ref}
                        isFetching={isFetching}
                        alt={name}
                        src={src}
                      />
                    );
                  }

                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      ref={ref}
                      src={src}
                      alt={name}
                      className={cn(
                        "absolute inset-0 inline h-full w-full object-contain duration-700 ease-in-out lg:group-hover:opacity-70",
                        isFetching ? "blur-xl" : "blur-0",
                      )}
                      onLoad={(e) => {
                        setDimensions({
                          width: e.currentTarget.naturalWidth,
                          height: e.currentTarget.naturalHeight,
                        });
                      }}
                    />
                  );
                }}
              />
            </AspectRatio>

            <form className="mt-6 w-full space-y-4">
              <div>
                <Label>{tCommon("labels.name")}</Label>
                <div className="relative">
                  <Input readOnly value={name} className="pr-10" />
                  <div className="absolute top-0 right-0 h-full">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOpen(true)}
                      className="h-full px-3 hover:bg-transparent"
                    >
                      <PenLine className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label>{tCommon("labels.date")}</Label>
                <Input
                  readOnly
                  value={date ? format(date, "PPP") : tMedia("not_available")}
                />
              </div>
              <div>
                <Label>{tCommon("labels.size")}</Label>
                <Input
                  readOnly
                  value={
                    data?.size
                      ? `${Math.ceil((data?.size ?? 0) / 1024)} kb`
                      : tMedia("not_available")
                  }
                />
              </div>
              <div>
                <Label>{tCommon("labels.dimensions")}</Label>
                <Input
                  readOnly
                  value={
                    dimensions
                      ? `${dimensions.width} x ${dimensions.height} px`
                      : tMedia("not_available")
                  }
                />
              </div>
            </form>
          </div>
          <DrawerFooter>
            <div className="grid grid-cols-2 gap-2">
              <MediaUpload
                className="relative w-full"
                type="button"
                shouldReplace
                replaceImageUrl={filepath.replace("media/", "")}
              >
                <Replace className="mr-1.5 size-4" />
                <span>{tCommon("actions.replace")}</span>
              </MediaUpload>
              <Button onClick={() => setMoveOpen(true)}>
                <ArrowRightLeft className="size-4" />
                <span>{tCommon("actions.move")}</span>
              </Button>
            </div>

            <Button variant={"destructive"} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1.5 size-4" />
              <span>{tCommon("actions.delete")}</span>
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <MediaRename
        open={open}
        setOpen={setOpen}
        filePath={filepath.replace("media/", "")}
      />
      <MoveItem
        selectedItemsDir={filepath.replace("media/", "")}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
      <MediaDelete
        dir={filepath.replace("media/", "")}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
