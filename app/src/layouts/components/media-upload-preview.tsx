"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

interface MediaUploadPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewSrc: string | undefined;
  previewType?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isUploading: boolean;
  title?: string;
  description?: string;
}

export function MediaUploadPreview({
  open,
  onOpenChange,
  previewSrc,
  previewType,
  onConfirm,
  onCancel,
  isUploading,
  title,
  description,
}: MediaUploadPreviewProps) {
  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");
  const isVideo = previewType?.startsWith("video/");

  return (
    <AlertDialog open={open && !!previewSrc} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="sr-only">
          <AlertDialogTitle>{title || tMedia("preview")}</AlertDialogTitle>
          <AlertDialogDescription>
            {description || tMedia("preview_desc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="bg-stripes flex max-h-[60vh] min-h-[200px] w-full items-center justify-center overflow-hidden rounded-lg">
          {previewSrc && (
            <>
              {isVideo ? (
                <video
                  src={previewSrc}
                  className="max-h-[56vh] max-w-full rounded-lg object-contain"
                  controls
                />
              ) : (
                <img
                  src={previewSrc}
                  alt={tMedia("preview_image")}
                  className="max-h-[56vh] max-w-full rounded-lg object-contain"
                />
              )}
            </>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isUploading}
            onClick={() => {
              onCancel();
              onOpenChange(false);
            }}
          >
            {tCommon("actions.cancel")}
          </AlertDialogCancel>
          <Button isLoading={isUploading} onClick={onConfirm}>
            {tMedia("upload")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
