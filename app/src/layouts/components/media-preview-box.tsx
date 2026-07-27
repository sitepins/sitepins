"use client";

import VideoThumbnail from "@/components/video-thumbnail";
import { AcceptImages, MAX_SIZE } from "@/lib/constant";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import { CloudUpload } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";
import { useDropzone } from "react-dropzone";
import { MediaUploadPreview } from "./media-upload-preview";
import SafeImage from "./safe-image";
import { AspectRatio } from "./ui/aspect-ratio";
import { Input } from "./ui/input";

export const MediaPreviewBox: React.FC<{
  children: React.ReactNode;
  value?: string;
  className?: string;
  onUpload?: (file: File) => void;
  isUploading?: boolean;
}> = ({ children, value, className, onUpload, isUploading = false }) => {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewDialog, setPreviewDialog] = React.useState(false);

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      setPreviewDialog(true);
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_SIZE,
    accept: AcceptImages,
    noClick: true,
    noDrag: true,
  });

  const handleConfirmUpload = () => {
    if (selectedFile && onUpload) {
      onUpload(selectedFile);
    }
    setPreviewDialog(false);
  };

  const handleCancel = () => {
    setPreviewDialog(false);
    setPreview(null);
    setSelectedFile(null);
  };

  const tMedia = useTranslations("media");

  if (value) {
    return (
      <div
        className={cn(
          "bg-stripes border-border relative aspect-video rounded-lg border p-3",
          className,
        )}
      >
        <AspectRatio ratio={16 / 9}>
          <SafeImage
            path={value || ""}
            width={400}
            height={400}
            alt={value || ""}
            renderContent={
              isVideo(value || "")
                ? ({ src, ref, isFetching }) => (
                    <VideoThumbnail
                      ref={ref}
                      isFetching={isFetching}
                      alt={value || ""}
                      src={src}
                    />
                  )
                : undefined
            }
          />
        </AspectRatio>
        {children}
      </div>
    );
  }

  return (
    <>
      <div className="border-border hover:bg-light relative flex aspect-video w-[384px] max-w-sm border-spacing-6 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed">
        <div {...getRootProps()} className="group">
          <div className="flex flex-col items-center justify-center gap-2">
            <CloudUpload className="size-6" />
            <div className="text-center text-sm">
              {isDragActive ? <p>{tMedia("drop_files_here")}</p> : children}
            </div>
          </div>
          <Input {...getInputProps()} type="file" style={{ display: "none" }} />
        </div>
      </div>

      <MediaUploadPreview
        open={previewDialog}
        onOpenChange={setPreviewDialog}
        previewSrc={preview || ""}
        onConfirm={handleConfirmUpload}
        onCancel={handleCancel}
        isUploading={isUploading}
      />
    </>
  );
};
