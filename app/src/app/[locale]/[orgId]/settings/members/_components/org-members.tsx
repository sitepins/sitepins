"use client";

import { UpgradeCta } from "@/components/upgrade-cta";
import Avatar from "@/components/avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDialog } from "@/hooks/use-dialog";
import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { IS_DEMO } from "@/lib/constant";
import { EPackage } from "@/lib/plan/types";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { cn } from "@/lib/utils/cn";
import { addNewTeamMemberSchema } from "@/lib/validate";
import { selectCurrentPackage } from "@/redux/features/plan/slice";
import {
  useAddMemberMutation,
  useUpdateMemberRoleMutation,
} from "@/redux/features/orgs/org-api";
import { TMember, TOrg } from "@/redux/features/orgs/type";
import { useAppSelector } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import MemberActions from "./org-member-actions";

export default function OrgMembers(org: TOrg) {
  const { members, org_id, owner, ownerData } = org;

  const { currentPackage } = useAppSelector(selectCurrentPackage);
  const { isOwner } = useOrgMember();

  const [updateRoleMember, { isLoading: isUpdating }] =
    useUpdateMemberRoleMutation();

  const canManageMembers = usePermission(ENUM_PERMISSIONS.MANAGE_MEMBERS);

  const orgPackage = ownerData?.[0]?.active_package as EPackage;
  const isHobby = (orgPackage || currentPackage) === EPackage.HOBBY;
  const tOrgMembers = useTranslations("org.members");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{tOrgMembers("title")}</CardTitle>
          <CardDescription>{tOrgMembers("description")}</CardDescription>
        </div>

        {isHobby && isOwner ? (
          <UpgradeCta
            labelKey="members_add"
            className="hidden h-9 px-4 md:flex"
          />
        ) : (
          <AddMemberDialog
            className="hidden md:flex"
            orgId={org_id}
            canManageMembers={canManageMembers}
            isLoading={isUpdating}
          />
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="divide-border border-border divide-y rounded-xl border">
          {members?.map((member) => (
            <MemberListItem
              key={member._id}
              member={member}
              owner={owner}
              canManageMembers={canManageMembers}
              isUpdating={isUpdating}
              orgId={org_id}
              onUpdateRole={updateRoleMember}
            />
          ))}
        </div>
      </CardContent>
      <CardFooter className="md:hidden">
        {isHobby && isOwner ? (
          <UpgradeCta
            labelKey="members_add"
            className="h-9 w-full px-4"
          />
        ) : (
          <AddMemberDialog
            className="w-full"
            orgId={org_id}
            canManageMembers={canManageMembers}
            isLoading={isUpdating}
          />
        )}
      </CardFooter>
    </Card>
  );
}

function MemberListItem({
  member,
  owner,
  canManageMembers,
  isUpdating,
  orgId,
  onUpdateRole,
}: {
  member: TMember;
  owner: string;
  canManageMembers: boolean;
  isUpdating: boolean;
  orgId: string;
  onUpdateRole: any;
}) {
  const [first_name, last_name] = member.full_name?.split(" ") ?? [];
  const avatarFallBack =
    first_name?.charAt(0).toUpperCase() + last_name?.charAt(0).toUpperCase();
  const tOrgMembers = useTranslations("org.members");

  return (
    <div className="group hover:bg-muted/50 flex flex-col gap-4 px-4 py-4 transition-colors md:flex-row md:items-center md:justify-between">
      <div className="flex items-center space-x-4">
        <Avatar
          className="bg-light border-border size-10 rounded-full border object-cover object-center shadow-sm"
          width={40}
          height={40}
          email={member.email}
          src={member.image}
          alt={member.full_name}
        />
        <div className="flex min-w-0 flex-col">
          <p className="text-foreground truncate text-sm font-semibold">
            {typeof avatarFallBack === "string"
              ? member.full_name
              : tOrgMembers("anonymous")}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {member.email}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:justify-end">
        <div className="flex items-center">
          <span className="bg-muted text-muted-foreground ring-border inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset">
            {owner === member.user_id
              ? tOrgMembers("roles.owner")
              : tOrgMembers(`roles.${member.role}` as any)}
          </span>
        </div>
        {canManageMembers && (
          <MemberActions
            member={member}
            owner={owner}
            isUpdating={isUpdating}
            org_id={orgId}
            onUpdateRole={onUpdateRole}
          />
        )}
      </div>
    </div>
  );
}

function AddMemberDialog({
  orgId,
  canManageMembers,
  isLoading,
  className,
}: {
  orgId: string;
  canManageMembers: boolean;
  isLoading: boolean;
  className?: string;
}) {
  const { isOpen, onOpenChange } = useDialog();
  const [addMember, { isLoading: isAdding }] = useAddMemberMutation();
  const form = useForm<z.infer<typeof addNewTeamMemberSchema>>({
    resolver: zodResolver(addNewTeamMemberSchema),
    defaultValues: { email: "" },
  });
  const tOrgMembers = useTranslations("org.members");
  const tAdd = useTranslations("org.members.add_member");

  const onSubmit = async (data: z.infer<typeof addNewTeamMemberSchema>) => {
    if (IS_DEMO) {
      toast.error(tAdd("demo_error"));
      return;
    }

    try {
      await addMember({
        email: data.email,
        role: data.role,
        org_id: orgId,
      }).unwrap();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error(error.data?.message || tAdd("error"));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          disabled={!canManageMembers || isLoading}
          className={cn("gap-1.5", className)}
        >
          <Plus className="size-4" />
          <span>{tAdd("add_member_btn")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="lg:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tAdd("dialog_title")}</DialogTitle>
          <DialogDescription>{tAdd("dialog_desc")}</DialogDescription>
        </DialogHeader>
        <form
          id="add-team-member-form"
          className="mt-4 space-y-3 text-left"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">{tAdd("email_label")}</FieldLabel>
                  <Input
                    {...field}
                    type="email"
                    id="email"
                    placeholder={tAdd("email_placeholder")}
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="role"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="role">{tAdd("role_label")}</FieldLabel>
                  <Select onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={tAdd("role_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{tAdd("roles_group")}</SelectLabel>
                        <SelectItem value="admin">
                          {tOrgMembers(`roles.admin`)}
                        </SelectItem>
                        <SelectItem value="editor">
                          {tOrgMembers(`roles.editor`)}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            form="add-team-member-form"
            type="submit"
            isLoading={isAdding}
          >
            {tAdd("add_member_btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
