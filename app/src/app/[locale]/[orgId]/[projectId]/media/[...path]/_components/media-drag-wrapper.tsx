"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/lib/utils/cn";
import { selectConfig } from "@/redux/features/config/slice";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useTranslations } from "next-intl";
import MediaUpload from "./media-upload";

export default function MediaDragWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ path: string[] }>();
  const currentPath = params.path.join("/");
  const { media } = useSelector(selectConfig);
  const isCorrectPath = currentPath.startsWith(media);
  const { isOpen, onOpenChange } = useDialog();
  const tMedia = useTranslations("media");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <div
      onDragEnter={() => {
        onOpenChange(true);
      }}
      className="flex flex-1 flex-col"
    >
      {children}
      <Dialog open={isCorrectPath ? isOpen : false} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "transition-opacity sm:max-w-xl",
            isPreviewOpen && "pointer-events-none opacity-0",
          )}
        >
          <DialogHeader className={cn(isPreviewOpen && "sr-only")}>
            <DialogTitle>{tMedia("upload_files")}</DialogTitle>
            <DialogDescription>{tMedia("drag_and_drop")}</DialogDescription>
          </DialogHeader>
          <MediaUpload
            dropZone
            afterUpload={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            onPreviewOpenChange={setIsPreviewOpen}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
