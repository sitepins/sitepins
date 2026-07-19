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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialog } from "@/hooks/use-dialog";
import { usePermission } from "@/hooks/use-permission";
import { IS_DEMO } from "@/lib/constant";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { useRemoveMemberMutation } from "@/redux/features/orgs/org-api";
import { TMember } from "@/redux/features/orgs/type";
import { EllipsisVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

const role: { admin: string; editor: string } = {
  admin: "editor",
  editor: "admin",
};

function DeleteOrgMember({
  org_id,
  member_id,
  open,
  onOpenChange,
  children,
}: {
  org_id: string;
  member_id: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const { isOpen: internalIsOpen, onOpenChange: internalOnOpenChange } =
    useDialog();
  const [removeMember, { isLoading }] = useRemoveMemberMutation();

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalIsOpen;
  const handleOpenChange = isControlled ? onOpenChange : internalOnOpenChange;

  const canManageMembers = usePermission(ENUM_PERMISSIONS.MANAGE_MEMBERS);
  const tOrgMembersActions = useTranslations("org.members.actions");
  const tCommon = useTranslations("common");

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      {children ? (
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      ) : (
        !isControlled && (
          <AlertDialogTrigger asChild>
            <Button
              className="text-destructive hover:text-destructive block w-full text-left"
              variant={"ghost"}
              disabled={isLoading || !canManageMembers}
            >
              {tOrgMembersActions("delete_user")}
            </Button>
          </AlertDialogTrigger>
        )
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tCommon("confirm.are_you_sure")}</AlertDialogTitle>
          <AlertDialogDescription>
            {tOrgMembersActions("delete_warning")}
          </AlertDialogDescription>
          <Input
            className="mt-4"
            type="text"
            placeholder={tOrgMembersActions("placeholder")}
            onChange={(e) => setValue(e.target.value)}
            value={value}
          />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
          <Button
            disabled={isLoading || value !== "CONFIRM" || !canManageMembers}
            variant={"destructive"}
            onClick={async () => {
              if (IS_DEMO) {
                toast.error(tOrgMembersActions("demo_error_delete"));
                return;
              }
              try {
                await removeMember({
                  org_id,
                  member_id,
                }).unwrap();
                toast.success(tOrgMembersActions("success_delete"));
                handleOpenChange?.(false);
              } catch (error) {
                const message =
                  // @ts-ignore
                  error.data?.message || tOrgMembersActions("error_generic");
                toast.error(
                  `${message} ${tOrgMembersActions("error_delete_suffix")}`,
                );
              }
            }}
          >
            {tCommon("actions.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function MemberActions({
  member,
  owner,
  isUpdating,
  org_id,
  onUpdateRole,
}: {
  member: TMember;
  owner: string;
  isUpdating: boolean;
  org_id: string;
  onUpdateRole?: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const canManageMembers = usePermission(ENUM_PERMISSIONS.MANAGE_MEMBERS);
  const tOrgMembersActions = useTranslations("org.members.actions");
  const tr = useTranslations("org.members.roles");

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            disabled={
              owner === member.user_id || isUpdating || !canManageMembers
            }
            className="text-muted-foreground"
            variant={"link"}
            size={"icon"}
          >
            <EllipsisVertical className="mx-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          collisionPadding={8}
          align="end"
          className="max-w-39 p-1.5"
        >
          <ul>
            <li>
              <Button
                className="block w-full text-left capitalize"
                variant={"ghost"}
                disabled={
                  owner === member.user_id || isUpdating || !canManageMembers
                }
                onClick={async () => {
                  setIsOpen(false);
                  if (IS_DEMO) {
                    toast.error(tOrgMembersActions("demo_error_update"));
                    return;
                  }
                  try {
                    if (!onUpdateRole) {
                      toast.error(tOrgMembersActions("error_update_fn"));
                      return;
                    }
                    await onUpdateRole({
                      org_id: org_id,
                      member_id: member.user_id,
                      role: role[member.role],
                    }).unwrap();
                    toast.success(tOrgMembersActions("success_update"));
                  } catch (error) {
                    toast.error(
                      // @ts-ignore
                      error.data.message || tOrgMembersActions("error_generic"),
                    );
                  }
                }}
              >
                {member.role === "admin"
                  ? tOrgMembersActions("make")
                  : tOrgMembersActions("make")}{" "}
                {tr(role[member.role] as any)}
              </Button>
            </li>
            <li>
              <Button
                className="text-destructive hover:text-destructive block w-full text-left"
                variant={"ghost"}
                onClick={() => {
                  setIsOpen(false);
                  setIsDeleteOpen(true);
                }}
              >
                {tOrgMembersActions("remove_member")}
              </Button>
            </li>
          </ul>
        </PopoverContent>
      </Popover>

      <DeleteOrgMember
        org_id={org_id}
        member_id={member.user_id}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />
    </>
  );
}
