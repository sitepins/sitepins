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
import { useLeaveOrgMutation } from "@/redux/features/orgs/org-api";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "next-intl";

export default function LeaveOrg({
  id,
  variant = "destructive",
}: { id: string } & ButtonProps) {
  const [value, setValue] = useState("");

  const router = useRouter();
  const { isOpen, onOpenChange } = useDialog();
  const [leaveOrg, { isLoading }] = useLeaveOrgMutation();
  const tOrgGeneralLeave = useTranslations("org.general.leave");
  const tCommon = useTranslations("common");

  return (
    <Card className="order-3">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {tOrgGeneralLeave("title")}
        </CardTitle>
        <CardDescription>{tOrgGeneralLeave("description")}</CardDescription>
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
              <LogOut className="me-1.5 size-5" />
              {tOrgGeneralLeave("leave_org_btn")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tOrgGeneralLeave("dialog_title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tOrgGeneralLeave("dialog_desc")}
              </AlertDialogDescription>

              <Input
                type="text"
                placeholder={tOrgGeneralLeave("placeholder")}
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
                    toast.error(tOrgGeneralLeave("demo_error"));
                    return;
                  }

                  try {
                    await leaveOrg(id).unwrap();
                    toast.success(tOrgGeneralLeave("success"));
                    if (localStorage.getItem("last_working_org_id") === id) {
                      localStorage.setItem("last_working_org_id", "");
                    }
                    onOpenChange(false);
                    router.replace("/");
                  } catch {
                    toast.error(tOrgGeneralLeave("error"));
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
