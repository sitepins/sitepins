"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { computeUnifiedDiff } from "@/lib/utils/diff";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

const MAX_PREVIEW_LINES = 200;

type PublishConflictDialogProps = {
  open: boolean;
  filePath: string;
  /** Undefined when the repository copy couldn't be shown (deleted, binary, too large). */
  remoteContent?: string;
  remoteDeleted: boolean;
  localContent: string;
  pending: boolean;
  onOverwrite: () => void;
  onCancel: () => void;
};

export default function PublishConflictDialog({
  open,
  filePath,
  remoteContent,
  remoteDeleted,
  localContent,
  pending,
  onOverwrite,
  onCancel,
}: PublishConflictDialogProps) {
  const t = useTranslations("editor.publish_conflict");

  const preview = useMemo(() => {
    if (!open || remoteDeleted || remoteContent === undefined) return null;
    const lines = computeUnifiedDiff(remoteContent, localContent, filePath)
      .diff.split("\n")
      .filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "));
    return {
      lines: lines.slice(0, MAX_PREVIEW_LINES),
      isTruncated: lines.length > MAX_PREVIEW_LINES,
    };
  }, [open, remoteDeleted, remoteContent, localContent, filePath]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                {remoteDeleted ? t("deleted_description") : t("description")}
              </p>
              <p className="text-muted-foreground">{t("cancel_hint")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              {t("preview_title")}:{" "}
              <span className="text-destructive">- {t("preview_remote")}</span>{" "}
              <span className="text-green-600">+ {t("preview_local")}</span>
            </p>
            <div className="border-border bg-muted/20 max-h-72 overflow-auto rounded-md border p-2 font-mono text-xs">
              {preview.lines.length === 0 ? (
                <div className="text-muted-foreground">
                  {t("preview_no_diff")}
                </div>
              ) : (
                preview.lines.map((line, index) => (
                  <div
                    key={index}
                    className={
                      line.startsWith("+")
                        ? "text-green-700"
                        : line.startsWith("-")
                          ? "text-red-700"
                          : line.startsWith("@@")
                            ? "text-muted-foreground"
                            : "text-foreground/80"
                    }
                  >
                    <span className="whitespace-pre-wrap">{line || " "}</span>
                  </div>
                ))
              )}
              {preview.isTruncated && (
                <div className="text-muted-foreground pt-1">
                  {t("preview_truncated")}
                </div>
              )}
            </div>
          </div>
        )}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onOverwrite}
          >
            {t("overwrite")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
