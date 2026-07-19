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
import { Button, ButtonProps } from "@/components/ui/button";
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
import { useDeleteOrgMutation } from "@/redux/features/orgs/org-api";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function DeleteOrg({
  id,
  variant,
}: { id: string } & ButtonProps) {
  const [value, setValue] = useState("");

  const router = useRouter();
  const { isOpen, onOpenChange } = useDialog();
  const [deleteOrg, { isLoading }] = useDeleteOrgMutation();
  const tOrgGeneralDelete = useTranslations("org.general.delete");
  const tCommon = useTranslations("common");

  return (
    <Card className="order-3">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {tOrgGeneralDelete("title")}
        </CardTitle>
        <CardDescription>{tOrgGeneralDelete("description")}</CardDescription>
      </CardHeader>

      <CardFooter>
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              className="w-full px-4 py-2 sm:w-auto"
              variant={variant}
              size={"lg"}
            >
              <Trash2 className="mr-1.5 size-5" />
              {tOrgGeneralDelete("delete_org_btn")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tOrgGeneralDelete("dialog_title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tOrgGeneralDelete("dialog_desc")}
              </AlertDialogDescription>

              <Input
                type="text"
                placeholder={tOrgGeneralDelete("placeholder")}
                onChange={(e) => setValue(e.target.value)}
                className="mt-4"
              />
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoading}>
                {tCommon("actions.cancel")}
              </AlertDialogCancel>
              <Button
                onClick={async (e) => {
                  e.preventDefault();
                  if (IS_DEMO) {
                    toast.error(tOrgGeneralDelete("demo_error"));
                    return;
                  }

                  try {
                    await deleteOrg(id).unwrap();
                    toast.success(tOrgGeneralDelete("success"));
                    localStorage.setItem("last_working_org_id", "");
                    router.push("/");
                  } catch {
                    toast.error(tOrgGeneralDelete("error"));
                  }
                }}
                type="button"
                variant={"destructive"}
                isLoading={isLoading}
                disabled={value !== tCommon("confirm.confirm_value")}
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
