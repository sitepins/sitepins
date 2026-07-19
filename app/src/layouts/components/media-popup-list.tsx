"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import VideoThumbnail from "@/components/video-thumbnail";
import { useDebounce } from "@/hooks/use-debounce";
import { useGitProvider } from "@/hooks/use-git-provider";
import { authClient } from "@/lib/auth/auth-client";
import { AcceptImages, MAX_FILES, MAX_SIZE } from "@/lib/constant";
import { checkMedia, isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import {
  findFileByPath,
  generatePath,
  generateUniqueFileName,
  sanitizedPath,
  searchByPath,
} from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import {
  selectMediaInfo,
  setPopupBreadcrumbs,
} from "@/redux/features/media/slice";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { TFiles, TImage } from "@/types";
import {
  CloudUpload,
  FolderClosed,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { isUrl } from "platejs";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import MediaConflictHandler from "./media-conflict-handler";
import { MediaUploadPreview } from "./media-upload-preview";
import SafeImage from "./safe-image";
import { AspectRatio } from "./ui/aspect-ratio";
import { Badge } from "./ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Card, CardContent, CardFooter } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";

type Props = {
  path: string;
  name: string;
  onChangeHandler: any;
  triggerButton?: React.ReactNode;
  ref?: React.RefObject<HTMLButtonElement | null>;
  addExternalImage?: (url: string) => void;
  absolutePath?: string;
  isReplace?: boolean;
} & ButtonProps;

const RenderFolderOrFiles = ({
  files,
  name,
  onChangeHandler,
  onClose,
  path,
  onNavigate,
}: {
  files: TFiles[];
  name: string;
  onChangeHandler?: any;
  path: string;
  onClose: (open: boolean) => void;
  onNavigate: (folder: TFiles) => void;
}) => {
  const config = useSelector(selectConfig);
  const mediaPath = config.media;
  const tMedia = useTranslations("media");

  return files.map((item) => {
    return !item.isFile ? (
      <div
        key={item.path}
        className="relative cursor-pointer hover:opacity-80"
        onClick={() => onNavigate(item)}
      >
        <Card className="h-auto gap-0 overflow-hidden pt-0 shadow-none">
          <CardContent className="relative p-0">
            <AspectRatio ratio={4 / 3} className="bg-light">
              <div className="flex h-full items-center justify-center">
                <FolderClosed
                  stroke="currentColor"
                  className="mx-auto size-14"
                />
              </div>
            </AspectRatio>
          </CardContent>
          <CardFooter className="px-4 py-2 pt-2 pb-3.5">
            <p className="text-secondary-foreground line-clamp-1 w-full text-left text-sm">
              {item.name}
            </p>
          </CardFooter>
        </Card>
      </div>
    ) : (
      checkMedia(item.path) && item.isFile && (
        <div key={item.path} className="relative hover:opacity-80">
          <Card className="h-auto gap-0 overflow-hidden pt-0 shadow-none">
            <CardContent className="relative p-0">
              {item.isNew && (
                <Badge
                  variant={"destructive"}
                  className="absolute top-2 right-2 z-50"
                >
                  {tMedia("new")}
                </Badge>
              )}

              {item.isReplace && (
                <Badge
                  variant={"muted"}
                  className="absolute top-2 right-2 z-50"
                >
                  {tMedia("replace")}
                </Badge>
              )}

              <AspectRatio ratio={4 / 3} className="bg-light bg-stripes">
                <SafeImage
                  lazy
                  path={item.path.replace(/^media\//, "")}
                  alt={item.name}
                  renderContent={
                    isVideo(item.path)
                      ? ({ src, ref, isFetching }) => (
                          <VideoThumbnail
                            ref={ref}
                            isFetching={isFetching}
                            alt={item.name}
                            src={src}
                          />
                        )
                      : undefined
                  }
                />
                <input
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onClose(false);
                    onChangeHandler(e);
                  }}
                  name={name}
                  type="text"
                  value={
                    "/" +
                    generatePath(
                      mediaPath,
                      item.path.replace(/^media\//, ""),
                      config.public,
                    )
                  }
                  className="absolute inset-0 z-50 cursor-pointer opacity-0"
                  readOnly
                />
              </AspectRatio>
            </CardContent>
            <CardFooter className="px-4 py-2 pt-2 pb-3.5">
              <p className="text-secondary-foreground line-clamp-1 w-full text-left text-sm">
                {item.name}
              </p>
            </CardFooter>
          </Card>
        </div>
      )
    );
  });
};

const MediaPopupList = ({
  triggerButton,
  path: filepath,
  name,
  onChangeHandler,
  ref,
  addExternalImage,
  absolutePath,
  isReplace = false,
  ...props
}: Props) => {
  const params = useParams();
  const { data: auth } = authClient.useSession();
  const { updateFiles, isPending: isUploading, useGitTrees } = useGitProvider();

  const [isLoading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [externalUrl, setExternalUrl] = useState(absolutePath || "");

  const inputRef = useRef<HTMLInputElement>(null);
  const config = useSelector(selectConfig);
  const { data } = useGitTrees("", {
    recursive: true,
    skip: !config.token || !config.repoName || !config.owner || !config.branch,
  });

  const [files, setFiles] = useState<TFiles[]>([]);
  const [addLog] = useAddProjectLogMutation();
  const [images, setImage] = useState<TImage[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const dispatch = useAppDispatch();
  const { popupBreadcrumbs: breadcrumbs } = useSelector(selectMediaInfo);

  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");

  const handleProcessFiles = async (inputFiles: File[]) => {
    setPendingFiles(inputFiles);
    // generate previews for the uploaded files
    const filePreviews = inputFiles.map((file) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      return new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
      });
    });

    const previewData = await Promise.all(filePreviews);
    setPreviews(previewData);
    setIsPreviewOpen(true);
  };

  const handleConfirmUpload = async () => {
    try {
      const newImages = await Promise.all(
        pendingFiles.map(async (file) => {
          const fileContent = await file.arrayBuffer();
          const contentBase64 = Buffer.from(fileContent).toString("base64");
          const { fileName, number, isAlreadyExist } = generateUniqueFileName(
            data?.trees || [],
            `${sanitizedPath(config.media, ...[...breadcrumbs.map((b) => b.name), file.name])}`,
          );
          return {
            number,
            name: file.name,
            path: fileName,
            isAlreadyExist: !!isAlreadyExist,
            content: contentBase64,
            isNew: true,
          };
        }),
      );
      setImage(newImages);
    } catch (err) {
      console.error(err);
      toast.error(tCommon("feedback.error_processing"));
    }
  };

  const handleCancel = () => {
    setIsPreviewOpen(false);
    setPendingFiles([]);
    setPreviews([]);
    setImage([]);
  };

  const duplicateImages = useMemo(() => {
    return images.filter((item) => item.isAlreadyExist === true);
  }, [images]);

  useEffect(() => {
    if (duplicateImages.length <= 0 && images.length > 0) {
      const updatePromise = updateFiles({
        message: "Uploading images",
        files: images.map((item) => ({
          path: item.path,
          content: item.content,
        })),
      });

      updatePromise
        .then((res: any) => {
          if (res.error) throw new Error(res.error.message);

          const syntheticEvent = {
            preventDefault: () => {},
            target: {
              value:
                "/" + generatePath(config.media, images[0].path, config.public),
              name: name,
            },
          };

          addLog({
            project_id: params.projectId as string,
            action: EAction.CREATE,
            file: `media/${images[0].path}`,
            file_type: EProjectLogType.MEDIA,
            user_id: auth?.user.user_id!,
          });

          toast.success(tCommon("feedback.uploaded_success"));
          onChangeHandler(syntheticEvent);
          setIsOpen(false);
          if (inputRef.current) {
            inputRef.current.value = "";
          }
        })
        .catch((err) => {
          toast.error(tCommon("feedback.upload_failed"));
          console.error(err);
          setImage([]);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, duplicateImages]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleProcessFiles(acceptedFiles);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      maxFiles: MAX_FILES,
      maxSize: MAX_SIZE,
      accept: AcceptImages,
    });

  const debouncedSearch = useDebounce(search, 500);

  const currentFiles = useMemo(() => {
    const rawFiles =
      breadcrumbs.length > 0
        ? breadcrumbs[breadcrumbs.length - 1].children || []
        : files;
    return rawFiles.filter((item) => item.name !== ".well-known");
  }, [breadcrumbs, files]);

  const filteredImages = useMemo(() => {
    if (!debouncedSearch) {
      return currentFiles;
    }
    return searchByPath(currentFiles, debouncedSearch);
  }, [debouncedSearch, currentFiles]);

  useEffect(() => {
    const mediaFolder = data?.trees?.find((f) => f.name === "media");
    if (isOpen && mediaFolder?.children) {
      const mediaFiles =
        findFileByPath(mediaFolder.children, `media/${config.media}`)
          ?.children ?? [];
      setFiles(mediaFiles);
    }
  }, [isOpen, data?.trees, config.media]);

  useEffect(() => {
    if (!isOpen) {
      // Small timeout to allow the dialog closing animation to finish
      const timeout = setTimeout(() => {
        setPreviews([]);
        setPendingFiles([]);
        setImage([]);
        setIsPreviewOpen(false);
        setSearch("");
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debouncedSearch && files.length > 0) {
      setLoading(true);
      const timeoutId = setTimeout(() => {
        setLoading(false);
      }, 100);
      return () => clearTimeout(timeoutId);
    } else {
      setLoading(false);
    }
  }, [debouncedSearch, files]);

  const prevProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${params.orgId}::${params.projectId}`;
    // Skip the very first run (mount); only reset when the project/org actually changes
    if (prevProjectRef.current === null) {
      prevProjectRef.current = key;
      return;
    }
    if (prevProjectRef.current !== key) {
      prevProjectRef.current = key;
      dispatch(setPopupBreadcrumbs([]));
    }
  }, [params.orgId, params.projectId, dispatch]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {triggerButton ? (
            triggerButton
          ) : (
            <Button ref={ref} {...props}>
              {tMedia("replace")}
            </Button>
          )}
        </DialogTrigger>

        <DialogContent
          className={cn(
            "z-9999 w-[95vw] gap-3 sm:max-w-xl md:max-w-3xl",
            isPreviewOpen && "pointer-events-none opacity-0 transition-opacity",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {isPreviewOpen ? tMedia("preview") : tMedia("media_library")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {tMedia("browse_media_desc")}
            </DialogDescription>
          </DialogHeader>

          <MediaConflictHandler
            images={duplicateImages}
            setImages={setImage}
            className="left-1/2"
          />

          {(addExternalImage || isReplace) && (
            <div className="flex items-center gap-2">
              <Input
                type="url"
                placeholder={tMedia("paste_external_url")}
                value={externalUrl}
                onChange={(e) => {
                  setExternalUrl(e.target.value);
                }}
                className="bg-light min-w-0 flex-1"
              />
              <Button
                variant="outline"
                disabled={!isUrl(externalUrl)}
                className="shrink-0"
                onClick={() => {
                  if (isUrl(externalUrl)) {
                    if (isReplace) {
                      onChangeHandler(externalUrl);
                    }
                    if (addExternalImage) {
                      addExternalImage(externalUrl);
                    }
                    setExternalUrl("");
                    setIsOpen(false);
                  }
                }}
              >
                {isReplace ? tMedia("replace") : tCommon("actions.add")}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">
              {tCommon("labels.or")}
            </span>
            <Separator className="flex-1" />
          </div>

          <div
            className={cn(
              "border-border bg-light relative w-full max-w-full overflow-hidden rounded border border-dashed p-3 text-center transition-colors duration-200 md:p-6",
              isDragActive && "bg-success/20 border-success text-white",
            )}
            {...getRootProps()}
          >
            <Input
              {...getInputProps()}
              type="file"
              style={{ display: "none" }}
            />
            <CloudUpload className="text-primary/55 mx-auto" />
            <div>
              <span className="text-primary/75 text-sm">
                {tMedia("drag_and_drop").split(",")[0] +
                  " " +
                  tCommon("labels.or")}
              </span>{" "}
              <Button className="p-0 text-sm" variant={"link"}>
                {tMedia("click_to_change")}
              </Button>
            </div>
            <div className="text-muted-foreground w-full min-w-0 flex-1 overflow-hidden text-xs">
              <p className="block max-w-full break-all whitespace-normal">
                {tMedia("upload_in", {
                  path: sanitizedPath(
                    config.media,
                    ...[...breadcrumbs.map((b) => b.name)],
                  ),
                })}
              </p>
            </div>
            {fileRejections.length !== 0 && (
              <p className="text-destructive max-w-full break-all whitespace-normal">
                {tMedia("file_too_large", {
                  type: tMedia("image"),
                  size: MAX_SIZE / 1000000,
                })}
              </p>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 overflow-hidden sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="w-full min-w-0 flex-1 shrink-0 overflow-x-auto">
              <Breadcrumb className="w-full max-w-full py-2">
                <BreadcrumbList className="flex-nowrap whitespace-nowrap">
                  <BreadcrumbItem>
                    <FolderClosed className="size-4" />
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  {(() => {
                    const mediaSegments =
                      config.media?.split("/").filter(Boolean) || [];
                    const lastMediaSegment =
                      mediaSegments[mediaSegments.length - 1];
                    if (!lastMediaSegment) return null;

                    return (
                      <Fragment key="root-segment">
                        <BreadcrumbItem>
                          <BreadcrumbLink
                            className="cursor-pointer"
                            onClick={() => dispatch(setPopupBreadcrumbs([]))}
                          >
                            {lastMediaSegment}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {breadcrumbs.length > 0 && <BreadcrumbSeparator />}
                      </Fragment>
                    );
                  })()}

                  {breadcrumbs.map((crumb, index) => (
                    <Fragment key={crumb.path}>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          className="cursor-pointer"
                          onClick={() =>
                            dispatch(
                              setPopupBreadcrumbs(
                                breadcrumbs.slice(0, index + 1),
                              ),
                            )
                          }
                        >
                          {crumb.name}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {index < breadcrumbs.length - 1 && (
                        <BreadcrumbSeparator />
                      )}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="relative w-full sm:max-w-xs">
              <div className="absolute top-1/2 left-3 -translate-y-1/2">
                {search !== debouncedSearch || isLoading ? (
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                ) : (
                  <SearchIcon className="text-muted-foreground size-4" />
                )}
              </div>
              <Input
                type="text"
                placeholder={tMedia("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted h-9 border-0 pl-9 text-sm ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          <div className="g-4 z-10 mt-1 grid max-h-96 w-full grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3">
            {filteredImages.length === 0 ? (
              <div className="col-span-3 text-center">
                <div className="mx-auto max-w-sm space-y-3 p-4">
                  <p className="text-muted-foreground text-sm font-medium">
                    {tMedia("no_images_found", { query: debouncedSearch })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {tMedia("try_adjusting_search")}
                  </p>
                </div>
              </div>
            ) : (
              <RenderFolderOrFiles
                onClose={setIsOpen}
                onChangeHandler={onChangeHandler}
                name={name}
                files={filteredImages}
                path={filepath}
                onNavigate={(folder) =>
                  dispatch(setPopupBreadcrumbs([...breadcrumbs, folder]))
                }
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MediaUploadPreview
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        previewSrc={previews[0]}
        onConfirm={handleConfirmUpload}
        onCancel={handleCancel}
        isUploading={isUploading}
      />
    </>
  );
};

export default MediaPopupList;
