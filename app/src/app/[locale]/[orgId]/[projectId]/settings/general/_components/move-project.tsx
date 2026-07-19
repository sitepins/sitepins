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
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IS_DEMO } from "@/lib/constant";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useMoveProjectMutation } from "@/redux/features/project/project-api";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function MoveProject({
  id,
  org_id,
}: {
  id: string;
  org_id: string;
}) {
  const { data: orgs = [], isLoading: isOrgsLoading } = useGetOrgsQuery();
  const [moveTo, { isLoading: isPending }] = useMoveProjectMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tProjectSettingsGeneralMove = useTranslations(
    "project-settings.general.move",
  );
  const tCommon = useTranslations("common");

  const otherOrgs = useMemo(
    () => orgs.filter((o) => o.org_id !== org_id),
    [orgs, org_id],
  );
  const currentOrg = useMemo(
    () => orgs.find((o) => o.org_id === org_id),
    [orgs, org_id],
  );

  // user must pick a destination to enable Move
  const [selected, setSelected] = useState<string>("");

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          {/* <FolderInput className="text-accent mr-2 size-5" /> */}
          {tProjectSettingsGeneralMove("title")}
        </CardTitle>
        <CardDescription>
          {tProjectSettingsGeneralMove("description")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* current org info */}
          <div className="text-left">
            <div className="text-muted-foreground text-sm">
              {tProjectSettingsGeneralMove("current_org")}
            </div>
            <div className="text-text-dark mt-1 text-base font-medium">
              {currentOrg?.org_name || org_id}
            </div>
          </div>

          {/* destination select + move button */}
          <div className="space-y-2">
            <div className="text-muted-foreground text-sm">
              {tProjectSettingsGeneralMove("destination")}
            </div>

            {isOrgsLoading ? (
              <div className="text-sm">
                {tProjectSettingsGeneralMove("loading_orgs")}
              </div>
            ) : otherOrgs.length === 0 ? (
              <div className="text-sm">
                {tProjectSettingsGeneralMove("no_orgs")}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Select value={selected} onValueChange={(v) => setSelected(v)}>
                  <SelectTrigger className="h-9 w-full min-w-50">
                    <SelectValue
                      placeholder={tProjectSettingsGeneralMove("placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {tProjectSettingsGeneralMove("destination")}
                      </SelectLabel>
                      {otherOrgs.map((org) => (
                        <SelectItem key={org.org_id} value={org.org_id}>
                          {org.org_name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              className="w-full sm:w-auto"
              disabled={
                isOrgsLoading || !selected || IS_DEMO || otherOrgs.length === 0
              }
              onClick={() => setConfirmOpen(true)}
            >
              {tProjectSettingsGeneralMove("move_btn")}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tProjectSettingsGeneralMove("confirm_title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tProjectSettingsGeneralMove("confirm_desc")}{" "}
                <strong>
                  {otherOrgs.find((o) => o.org_id === selected)?.org_name}
                </strong>
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
              <Button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  if (!selected)
                    return toast(tProjectSettingsGeneralMove("error_select"));
                  try {
                    await moveTo({
                      projectId: id,
                      orgId: selected,
                    }).unwrap();
                    toast.success(tProjectSettingsGeneralMove("success"));
                    setConfirmOpen(false);
                  } catch (error) {
                    toast.error(
                      (error as any)?.data?.message ||
                        tProjectSettingsGeneralMove("error"),
                    );
                  }
                }}
              >
                {tCommon("actions.move")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
