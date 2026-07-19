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
import { GitBranch, HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";

export type ConflictChoice = "use-draft" | "use-git";

interface DraftConflictDialogProps {
  open: boolean;
  /** ISO string — when the DB draft was last saved */
  draftSavedAt?: string;
  /** Parsed content/body from current Git version. */
  gitContent?: string;
  /** Parsed content/body from saved DB draft. */
  draftContent?: string;
  onChoose: (choice: ConflictChoice) => void;
}

export default function DraftConflictDialog({
  open,
  draftSavedAt,
  gitContent,
  draftContent,
  onChoose,
}: DraftConflictDialogProps) {
  const t = useTranslations("editor.conflict");

  const buildPreview = () => {
    const git = (gitContent || "").replace(/\r\n/g, "\n").split("\n");
    const draft = (draftContent || "").replace(/\r\n/g, "\n").split("\n");
    const maxLines = Math.min(Math.max(git.length, draft.length), 120);

    const lines: Array<{ prefix: "+" | "-" | " "; text: string }> = [];

    for (let i = 0; i < maxLines; i++) {
      const g = git[i] ?? "";
      const d = draft[i] ?? "";

      if (g === d) {
        lines.push({ prefix: " ", text: d });
      } else {
        if (g !== "") lines.push({ prefix: "-", text: g });
        if (d !== "") lines.push({ prefix: "+", text: d });
      }
    }

    const isTruncated = Math.max(git.length, draft.length) > maxLines;

    return { lines, isTruncated };
  };

  const hasPreview =
    typeof gitContent === "string" &&
    typeof draftContent === "string" &&
    (gitContent.length > 0 || draftContent.length > 0);
  const preview = hasPreview ? buildPreview() : null;

  const formattedDate = draftSavedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(draftSavedAt))
    : null;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>{t("description")}</p>
              {formattedDate && (
                <p className="text-muted-foreground">
                  {t("draft_saved_at", { date: formattedDate })}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              {t("preview_title")}:{" "}
              <span className="text-destructive">- {t("preview_git")}</span>{" "}
              <span className="text-green-600">+ {t("preview_draft")}</span>
            </p>
            <div className="border-border bg-muted/20 max-h-56 overflow-auto rounded-md border p-2 font-mono text-xs">
              {preview.lines.length === 0 ? (
                <div className="text-muted-foreground">
                  {t("preview_no_diff")}
                </div>
              ) : (
                preview.lines.map((line, index) => (
                  <div
                    key={`${index}-${line.prefix}`}
                    className={
                      line.prefix === "+"
                        ? "text-green-700"
                        : line.prefix === "-"
                          ? "text-red-700"
                          : "text-foreground/80"
                    }
                  >
                    <span className="select-none">{line.prefix}</span>{" "}
                    <span>{line.text || " "}</span>
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
            onClick={() => onChoose("use-git")}
          >
            <GitBranch className="mr-2 size-4" />
            {t("use_git")}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => onChoose("use-draft")}
          >
            <HardDrive className="mr-2 size-4" />
            {t("use_draft")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
