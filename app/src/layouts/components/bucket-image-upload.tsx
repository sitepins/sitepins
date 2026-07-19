"use client";

import Avatar from "@/components/avatar";
import { useImageUpload } from "@/hooks/use-image-upload";
import { AcceptImages, MAX_SIZE } from "@/lib/constant";
import { Camera } from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import Gravatar from "react-gravatar";
import SiteFallbackAvatar from "./site-fallback-avatar";
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
import { Input } from "./ui/input";

interface BucketImageUploadProps {
  folder: "sitepins/users" | "sitepins/orgs" | "sitepins/sites";
  previewSrc?: string;
  defaultImage?: string;
  defaultLabel?: string;
  onUploadSuccess: (url: string) => void;
  onUploadError?: (error: any) => void;
  altText?: string;
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  siteUrl?: string;
  email?: string;
  usedFor: "user" | "org" | "site";
}

const SIZES = {
  sm: "size-16",
  md: "size-20",
  lg: "size-25",
};

export function BucketImageUpload({
  folder,
  defaultImage,
  defaultLabel,
  onUploadSuccess,
  onUploadError,
  altText = "Preview",
  size = "lg",
  isDisabled = false,
  siteUrl,
  email = "",
  usedFor,
}: BucketImageUploadProps) {
  const tCommonImageUpload = useTranslations("common.image_upload");
  const tCommon = useTranslations("common");
  const [previewDialog, setPreviewDialog] = useState(false);
  const {
    previewSrc,
    file,
    fileRejections,
    handleFileSelect,
    handleFileReject,
    uploadFile,
    isUploading,
    reset,
  } = useImageUpload({
    folder,
  });

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: (files) => {
      handleFileSelect(files);
      setPreviewDialog(true);
    },
    onDropRejected: handleFileReject,
    maxFiles: 1,
    maxSize: MAX_SIZE,
    accept: AcceptImages,
    noDrag: true,
    noClick: true,
    disabled: isDisabled,
  });

  const handleUpload = async () => {
    const imageUrl = await uploadFile();
    if (imageUrl) {
      onUploadSuccess(imageUrl);
      setPreviewDialog(false);
      reset();
    }
  };

  return (
    <>
      <div {...getRootProps()}>
        <div className="flex flex-col items-start space-x-4 sm:flex-row lg:items-center">
          {/* Upload Control */}
          <div className="flex-1">
            {/* File Rejection Messages */}
            {fileRejections.length > 0 && (
              <ul className="text-destructive mt-2 text-sm font-medium">
                {fileRejections.map((reject) => {
                  return reject.errors.map((err) => {
                    if (err.code === "file-too-large") {
                      return (
                        <li key={err.code}>
                          {tCommonImageUpload("file_too_large", {
                            limit: Math.floor(MAX_SIZE / 1024 / 1024),
                          })}
                        </li>
                      );
                    }
                    return <li key={err.code}>{err.message}</li>;
                  });
                })}
              </ul>
            )}
          </div>
          {/* Image Preview Container */}
          <Input
            accept="image/jpg, image/jpeg, image/png"
            type="file"
            className="absolute top-0 left-0 h-full w-full cursor-pointer border-none opacity-0"
            {...getInputProps()}
            disabled={isDisabled}
          />
          <div
            className={`bg-light relative flex ${SIZES[size]} group/thumb mb-4 flex-none items-center justify-center rounded-full sm:mb-0`}
          >
            {previewSrc || defaultImage ? (
              <Avatar
                className="absolute top-0 left-0 size-full flex-none cursor-pointer rounded-full object-cover"
                src={previewSrc || defaultImage || ""}
                preview={!!previewSrc}
                alt={altText}
                width={200}
                height={200}
                site_url={siteUrl}
                email={email}
              />
            ) : (
              <>
                {usedFor === "user" && (
                  <Gravatar
                    email={email}
                    className="rounded-full"
                    alt={altText}
                    height={200}
                    width={200}
                    default="mm"
                  />
                )}
                {usedFor === "org" && (
                  <p className="text-primary text-3xl capitalize">
                    {defaultLabel}
                  </p>
                )}
                {usedFor === "site" && siteUrl ? (
                  <SiteFallbackAvatar siteUrl={siteUrl || ""} />
                ) : (
                  usedFor === "site" &&
                  !siteUrl && (
                    <p className="text-primary text-3xl capitalize">
                      {defaultLabel}
                    </p>
                  )
                )}
              </>
            )}

            <span
              onClick={open}
              className="absolute inset-0 top-0 left-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-all duration-500 group-hover/thumb:opacity-100"
            >
              <Camera />
            </span>
          </div>
        </div>
      </div>

      <AlertDialog
        open={previewDialog && !!previewSrc}
        onOpenChange={setPreviewDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="sr-only">
            <AlertDialogTitle>
              {tCommonImageUpload("preview_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tCommonImageUpload("preview_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-stripes rounded-lg">
            {previewSrc && (
              <img
                src={previewSrc}
                alt="Preview"
                className="w-full rounded-lg object-contain"
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPreviewDialog(false);
                reset();
              }}
            >
              {tCommon("actions.cancel")}
            </AlertDialogCancel>
            <Button isLoading={isUploading} onClick={handleUpload}>
              {tCommonImageUpload("upload")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
