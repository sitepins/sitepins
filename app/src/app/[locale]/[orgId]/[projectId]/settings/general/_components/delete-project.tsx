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
import { Input } from "@/components/ui/input";
import { useDialog } from "@/hooks/use-dialog";
import { IS_DEMO } from "@/lib/constant";
import { useDeleteProjectMutation } from "@/redux/features/project/project-api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function DeleteProject({
  id,
  org_id,
}: {
  id: string;
  org_id: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const { isOpen, onOpenChange } = useDialog();
  const [deleteProject, { isLoading: isPending }] = useDeleteProjectMutation();
  const tProjectSettingsGeneralDelete = useTranslations(
    "project-settings.general.delete",
  );
  const tCommon = useTranslations("common");

  return (
    <Card className="ring-destructive/20 dark:ring-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {tProjectSettingsGeneralDelete("title")}
        </CardTitle>
        <CardDescription>
          {tProjectSettingsGeneralDelete("description")}
        </CardDescription>
      </CardHeader>
      <CardFooter className="bg-destructive/10">
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              className="w-full px-4 py-2 sm:w-auto"
              variant={"destructive"}
              size={"lg"}
              disabled={isPending || IS_DEMO}
            >
              {tProjectSettingsGeneralDelete("delete_btn")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tProjectSettingsGeneralDelete("confirm_title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tProjectSettingsGeneralDelete("confirm_desc")}
              </AlertDialogDescription>
              <Input
                className="mt-4"
                type="text"
                placeholder={tProjectSettingsGeneralDelete("placeholder")}
                onChange={(e) => setValue(e.target.value)}
              />
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
              <Button
                variant={"destructive"}
                className="py-0!"
                isLoading={isPending}
                disabled={value !== tCommon("confirm.confirm_value")}
                onClick={async () => {
                  try {
                    await deleteProject({ id, org_id }).unwrap();
                    onOpenChange(false);
                    toast.success(tProjectSettingsGeneralDelete("success"));
                    try {
                      router.replace("/");
                      setTimeout(() => {
                        if (
                          typeof window !== "undefined" &&
                          window.location.pathname !== "/"
                        ) {
                          window.location.assign("/");
                        }
                      }, 500);
                    } catch (navErr) {
                      if (typeof window !== "undefined")
                        window.location.assign("/");
                    }
                  } catch (error: any) {
                    toast.error(
                      error?.data?.message ||
                        tProjectSettingsGeneralDelete("error_generic"),
                    );
                  }
                }}
              >
                {tCommon("actions.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
