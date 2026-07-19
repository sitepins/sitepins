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
import { useUpdateProjectStatusMutation } from "@/redux/features/project/project-api";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function ArchiveProject({
  id,
  org_id,
  status,
}: {
  id: string;
  org_id: string;
  status?: string;
}) {
  const [updateProjectStatus, { isLoading: isPending }] =
    useUpdateProjectStatusMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tProjectSettingsGeneralArchive = useTranslations(
    "project-settings.general.archive",
  );
  const tCommon = useTranslations("common");

  const isArchived = status === "archived";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {isArchived
            ? tProjectSettingsGeneralArchive("restore_title")
            : tProjectSettingsGeneralArchive("archive_title")}
        </CardTitle>
        <CardDescription>
          {isArchived
            ? tProjectSettingsGeneralArchive("restore_desc")
            : tProjectSettingsGeneralArchive("archive_desc")}
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
                ? tProjectSettingsGeneralArchive("restore_btn")
                : tProjectSettingsGeneralArchive("archive_btn")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isArchived
                  ? tProjectSettingsGeneralArchive("restore_confirm_title")
                  : tProjectSettingsGeneralArchive("archive_confirm_title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isArchived ? (
                  <>{tProjectSettingsGeneralArchive("restore_confirm_desc")}</>
                ) : (
                  <>{tProjectSettingsGeneralArchive("archive_confirm_desc")}</>
                )}
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
                    await updateProjectStatus({
                      project_id: id,
                      org_id: org_id,
                      status: newStatus,
                    }).unwrap();

                    toast.success(
                      isArchived
                        ? tProjectSettingsGeneralArchive("restore_success")
                        : tProjectSettingsGeneralArchive("archive_success"),
                    );
                    setConfirmOpen(false);
                  } catch (error: any) {
                    toast.error(
                      (error as any)?.data?.message ||
                        tProjectSettingsGeneralArchive("error"),
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
