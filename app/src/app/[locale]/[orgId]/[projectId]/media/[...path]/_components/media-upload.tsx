"use client";

import MediaConflictHandler from "@/components/media-conflict-handler";
import { MediaUploadPreview } from "@/components/media-upload-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, ButtonProps } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import {
  AcceptMedia,
  MAX_FILES,
  MAX_SIZE,
  MAX_VIDEO_SIZE,
} from "@/lib/constant";
import { cn } from "@/lib/utils/cn";
import { cleanMediaPath, generateUniqueFileName } from "@/lib/utils/common";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabContentApi,
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { TImage } from "@/types";
import { Images, Upload, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import path from "path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";

export default function MediaUpload({
  dropZone,
  afterUpload,
  onCancel,
  onPreviewOpenChange,
  shouldReplace,
  replaceImageUrl,
  children,
  ...props
}: ButtonProps & {
  dropZone?: boolean;
  afterUpload?: () => void;
  onCancel?: () => void;
  onPreviewOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  shouldReplace?: boolean;
  replaceImageUrl?: string;
}) {
  const params = useParams();
  const dispatch = useDispatch();
  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");

  let pathname = usePathname();
  const { data: auth } = authClient.useSession();
  const config = useSelector(selectConfig);
  pathname = decodeURIComponent(pathname);
  const [addLog] = useAddProjectLogMutation();
  const [previews, setPreviews] = useState<string[]>([]);
  const [previewTypes, setPreviewTypes] = useState<string[]>([]);
  const [showExtensionAlert, setShowExtensionAlert] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [extensionInfo, setExtensionInfo] = useState<{
    original: string;
    new: string;
  } | null>(null);

  const [previewDialog, setPreviewDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    if (onPreviewOpenChange) {
      onPreviewOpenChange(previewDialog);
    }
    if (!previewDialog) {
      // Small timeout to allow the transition to finish
      const timeout = setTimeout(() => {
        setPreviews([]);
        setPendingFiles([]);
        setImages([]);
        setPreviewTypes([]);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [previewDialog, onPreviewOpenChange]);

  const { data: ghData } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    {
      skip:
        !config.owner ||
        !config.repoName ||
        !config.branch ||
        !config.token ||
        !isGitHubProvider(config.provider),
    },
  );

  const { data: glData } = useGetGitLabTreesQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      recursive: true,
      config: config,
    },
    {
      skip:
        !config.repoName ||
        !config.branch ||
        !config.token ||
        !isGitLabProvider(config.provider),
    },
  );

  const data = isGitLabProvider(config.provider) ? glData : ghData;

  const [uploadImage, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [uploadGitLabImage, { isLoading: isGlPending }] =
    useUpdateGitLabFilesMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGlPending
    : isGhPending;

  const onDropCallback = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setPendingFiles(acceptedFiles);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviews([reader.result as string]);
      setPreviewTypes([acceptedFiles[0].type]);
      setPreviewDialog(true);
    };
    reader.readAsDataURL(acceptedFiles[0]);
  }, []);

  const handleConfirmUpload = async () => {
    await handleUpload(pendingFiles);
  };

  const handleCancel = () => {
    setPreviewDialog(false);
    setPendingFiles([]);
    setPreviews([]);
    setPreviewTypes([]);
    if (onCancel) onCancel();
  };

  // Helper function to check if file is a video
  const isVideoFile = (file: File) => {
    return file.type.startsWith("video/");
  };

  // Get max size based on file type
  const getMaxSize = (file: File) => {
    return isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_SIZE;
  };

  const [images, setImages] = useState<TImage[]>([]);
  const {
    getRootProps,
    getInputProps,
    acceptedFiles,
    isDragActive,
    inputRef,
    fileRejections,
  } = useDropzone({
    maxFiles: MAX_FILES,
    maxSize: MAX_VIDEO_SIZE,
    accept: AcceptMedia,
    onDrop: onDropCallback,
    validator: (file) => {
      const maxSize = getMaxSize(file);
      if (file.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / 1000000);
        const fileType = isVideoFile(file) ? tMedia("video") : tMedia("image");
        return {
          code: "file-too-large",
          message: tMedia("file_too_large", {
            type: fileType,
            size: maxSizeMB,
          }),
        };
      }
      return null;
    },
  });

  const processReplacement = async (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    const preview = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
    });
    setPreviews([preview]);
    setPreviewTypes([file.type]);

    const fileContent = await file.arrayBuffer();
    const contentBase64 = Buffer.from(fileContent).toString("base64");

    const originalDir = path.dirname(replaceImageUrl!);
    const originalName = path.parse(replaceImageUrl!).name;
    const newExtension = path.extname(file.name);
    const newPath = path.join(originalDir, originalName + newExtension);

    const newImages: TImage[] = [
      {
        number: 0,
        name: originalName + newExtension,
        path: newPath,
        isAlreadyExist: false,
        isReplace: true,
        content: contentBase64,
        isNew: false,
      },
    ];

    setImages(newImages);
  };

  const handleUpload = async (files?: File[]) => {
    if (!files) return;
    const newImages: TImage[] = [];
    const file = files[0];

    if (shouldReplace && replaceImageUrl && file) {
      const originalExtension = path.extname(replaceImageUrl);
      const newExtension = path.extname(file.name);

      if (originalExtension !== newExtension) {
        setExtensionInfo({
          original: originalExtension,
          new: newExtension,
        });
        setPendingFile(file);
        setShowExtensionAlert(true);
        return;
      }

      await processReplacement(file);
      return;
    }

    for (const file of files) {
      const fileContent = await file.arrayBuffer();
      const contentBase64 = Buffer.from(fileContent).toString("base64");
      const mediaFolder = data?.trees?.find((f) => f.name === "media");
      const {
        fileName: filepath,
        number,
        isAlreadyExist,
      } = generateUniqueFileName(
        mediaFolder?.children || [],
        path.join(pathname.split("media/")?.[1], file.name),
      );

      newImages.push({
        number,
        name: file.name,
        path: filepath,
        isAlreadyExist: !!isAlreadyExist,
        content: contentBase64,
        isNew: true,
      });
    }
    setImages(newImages);
  };

  const duplicateImages = useMemo(() => {
    return images.filter((item) => item.isAlreadyExist === true);
  }, [images]);

  useEffect(() => {
    if (duplicateImages.length <= 0 && images.length > 0) {
      const uploadPromise = isGitLabProvider(config.provider)
        ? uploadGitLabImage({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            message: "uploads images",
            files: images.map((img) => ({
              path: img.path,
              content: img.content,
            })),
          })
        : uploadImage({
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
            message: "uploads images",
            files: images,
          });

      uploadPromise.then((res: any) => {
        if (!res.error?.message) {
          toast.success(tMedia("upload_successful"));
          setPreviewDialog(false);
          // Previews, files and images will be cleared when dialog fully closes
          addLog({
            project_id: params.projectId as string,
            action: EAction.CREATE,
            file: images.map((image) => `media/${image.path}`).join(","),
            file_type: EProjectLogType.MEDIA,
            user_id: auth?.user.user_id!,
          });
          if (afterUpload) {
            afterUpload();
          }
          if (inputRef.current) {
            inputRef.current.value = "";
          }

          // Invalidate specific image tags to trigger refetch in SafeImage components
          images.forEach((image) => {
            const finalPath = cleanMediaPath(config.media, image.path);

            if (isGitHubProvider(config.provider)) {
              dispatch(
                githubContentApi.util.invalidateTags([
                  {
                    type: "GitHubContent",
                    id: `IMAGE/${config.owner}/${config.repoName}/${config.branch}/${finalPath}`,
                  },
                ]),
              );
            } else {
              dispatch(
                gitlabContentApi.util.invalidateTags([
                  {
                    type: "GitLabContent",
                    id: `${config.repoName ? `${config.owner}/${config.repoName}` : config.owner}/${config.branch}/${finalPath}/undefined`,
                  },
                ]),
              );
            }
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, duplicateImages.length]);

  useEffect(() => {
    if (fileRejections.length) {
      fileRejections.forEach((rejection) => {
        rejection.errors.forEach((error) => {
          toast.error(error.message);
        });
      });
    }
  }, [fileRejections]);

  const conflictHandler = (
    <MediaConflictHandler
      images={duplicateImages}
      setImages={setImages}
      className={cn(dropZone && "left-1/2 w-full")}
    />
  );

  if (shouldReplace) {
    return (
      <>
        <div {...getRootProps()}>
          <Button {...props} isLoading={isPending}>
            <Images className="mr-1.5 size-4" />
            <span>{tMedia("replace")}</span>
            <input {...getInputProps()} />
          </Button>
        </div>

        <AlertDialog
          open={showExtensionAlert}
          onOpenChange={setShowExtensionAlert}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tMedia("file_extension_change")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tMedia("extension_change_desc", {
                  original: extensionInfo?.original || "",
                  new: extensionInfo?.new || "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowExtensionAlert(false);
                  setPendingFile(null);
                  setExtensionInfo(null);
                  setPreviews([]);
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
              >
                {tCommon("actions.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (pendingFile) {
                    await processReplacement(pendingFile);
                  }
                  setShowExtensionAlert(false);
                  setPendingFile(null);
                  setExtensionInfo(null);
                }}
                variant="destructive"
              >
                {tCommon("actions.replace")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <MediaUploadPreview
          open={previewDialog}
          onOpenChange={setPreviewDialog}
          previewSrc={previews[0]}
          previewType={previewTypes[0]}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancel}
          isUploading={isPending}
        />
      </>
    );
  }

  if (dropZone) {
    return (
      <>
        {conflictHandler}
        <div
          {...getRootProps()}
          className={cn(
            "group border-muted-foreground/25 hover:bg-muted/25 relative grid h-100 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed px-5 py-2.5 text-center transition",
            "ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            isDragActive && "border-muted-foreground/50",
          )}
        >
          <input {...getInputProps()} />

          {isDragActive ? (
            <div className="flex flex-col items-center justify-center gap-4 overflow-y-scroll sm:px-5">
              <div className="rounded-full border border-dashed p-3">
                <UploadIcon
                  className="text-muted-foreground size-7"
                  aria-hidden="true"
                />
              </div>
              <p className="text-muted-foreground font-medium">
                {tMedia("drop_files_here")}
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "flex h-full w-full flex-col items-center justify-center px-5 transition-opacity",
                acceptedFiles.length > 1 && "overflow-y-auto",
                previewDialog && "pointer-events-none opacity-0",
              )}
            >
              {previews.length > 0 ? (
                <div
                  className={cn(
                    "grid w-full gap-4",
                    previews.length === 1
                      ? "h-full place-items-center"
                      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
                  )}
                >
                  {previews.map((preview, index) => {
                    return (
                      <div
                        key={index}
                        className={cn(
                          "relative",
                          acceptedFiles.length === 1
                            ? "h-full w-full"
                            : "aspect-square",
                        )}
                      >
                        <img
                          src={preview}
                          alt={tMedia("preview_image")}
                          className="h-full w-full rounded-lg object-contain"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div>
                    <div className="inline-block rounded-full border border-dashed p-3">
                      <UploadIcon className="text-muted-foreground size-7" />
                    </div>
                  </div>
                  <p className="text-muted-foreground font-medium">
                    {tMedia("drag_and_drop")}
                  </p>
                  <p className="text-muted-foreground/70 text-sm">
                    {tMedia("you_can_upload")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <MediaUploadPreview
          open={previewDialog}
          onOpenChange={setPreviewDialog}
          previewSrc={previews[0]}
          previewType={previewTypes[0]}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancel}
          isUploading={isPending}
        />

        {fileRejections.length > 0 && (
          <ul className="text-destructive text-sm font-medium">
            {fileRejections.map((reject) => {
              return reject.errors.map((err) => {
                return <li key={err.code}>{err.message}</li>;
              });
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      {conflictHandler}
      <div {...getRootProps()}>
        <Button {...props} isLoading={isPending} disabled={false}>
          <Upload className="size-4 sm:mr-1.5" />
          <span className="hidden sm:inline-block">{tMedia("upload")}</span>
          <input {...getInputProps()} />
        </Button>
      </div>

      <MediaUploadPreview
        open={previewDialog}
        onOpenChange={setPreviewDialog}
        previewSrc={previews[0]}
        previewType={previewTypes[0]}
        onConfirm={handleConfirmUpload}
        onCancel={handleCancel}
        isUploading={isPending}
      />
    </>
  );
}
