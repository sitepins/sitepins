"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IS_DEMO } from "@/lib/constant";
import { useUpdateOrgStatusMutation } from "@/redux/features/orgs/org-api";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export default function ArchiveOrg({
  id,
  status,
}: {
  id: string;
  status?: string;
}) {
  const [updateOrgStatus, { isLoading: isPending }] =
    useUpdateOrgStatusMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tOrgGeneralArchive = useTranslations("org.general.archive");
  const tCommon = useTranslations("common");

  const isArchived = status === "archived";

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {isArchived
            ? tOrgGeneralArchive("title_restore")
            : tOrgGeneralArchive("title_archive")}
        </CardTitle>
        <CardDescription>
          {isArchived
            ? tOrgGeneralArchive("desc_restore")
            : tOrgGeneralArchive("desc_archive")}
        </CardDescription>
      </CardHeader>

      <CardFooter>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setConfirmOpen(true)}
              variant={isArchived ? "success" : "warning"}
              disabled={IS_DEMO || isPending}
            >
              {isArchived
                ? tOrgGeneralArchive("restore_btn")
                : tOrgGeneralArchive("archive_btn")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isArchived
                  ? tOrgGeneralArchive("dialog_title_restore")
                  : tOrgGeneralArchive("dialog_title_archive")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isArchived
                  ? tOrgGeneralArchive("dialog_desc_restore")
                  : tOrgGeneralArchive("dialog_desc_archive")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
              <Button
                type="button"
                variant={isArchived ? "success" : "warning"}
                disabled={isPending}
                onClick={async () => {
                  try {
                    const newStatus = isArchived ? "active" : "archived";
                    await updateOrgStatus({
                      org_id: id,
                      status: newStatus,
                    }).unwrap();

                    toast.success(
                      isArchived
                        ? tOrgGeneralArchive("success_restore")
                        : tOrgGeneralArchive("success_archive"),
                    );
                    setConfirmOpen(false);
                  } catch (error: any) {
                    toast.error(
                      (error as any)?.data?.message ||
                        tOrgGeneralArchive("error"),
                    );
                  }
                }}
              >
                {isArchived
                  ? tCommon("actions.restore")
                  : tCommon("actions.archive")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
