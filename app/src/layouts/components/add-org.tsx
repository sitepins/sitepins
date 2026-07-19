"use client";

import { useTranslations } from "next-intl";
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
import { useDialog } from "@/hooks/use-dialog";
import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO } from "@/lib/constant";
import { orgSchema } from "@/lib/validate";
import { useAddOrgMutation } from "@/redux/features/orgs/org-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";
import FormError from "./form-error";
import { Button, ButtonProps } from "./ui/button";
import { Input } from "./ui/input";

export default function AddOrg({
  open,
  onOpenChange,
  onSuccess,
  ...props
}: ButtonProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (res: { org_id: string }) => void;
}) {
  const { isOpen, onOpenChange: setOpen } = useDialog();
  const { data: auth } = authClient.useSession();
  const tOrgCreate = useTranslations("org.create");
  const user = auth?.user;
  const router = useRouter();

  const isControlled = typeof open !== "undefined";
  const showDialog = isControlled ? open : isOpen;
  const handleOpenChange = isControlled ? onOpenChange : setOpen;

  const orgForm = useForm<z.infer<typeof orgSchema>>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      org_name: "",
      email: user?.email!,
    },
  });

  const [createOrg, { isLoading, isError, error }] = useAddOrgMutation();

  return (
    <Dialog open={showDialog} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button {...props}>
          <span className="bg-light border-border mr-1 flex size-6 flex-none items-center justify-center rounded-full border text-xs">
            <Plus className="size-3" />
          </span>
          <span className="flex-1 text-sm capitalize">
            {tOrgCreate("add_org_btn")}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="lg:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {tOrgCreate("dialog_title")}
          </DialogTitle>
          <DialogDescription>{tOrgCreate("dialog_desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <form
            id="add-org-form"
            onSubmit={orgForm.handleSubmit((data) => {
              if (IS_DEMO) {
                toast.error(tOrgCreate("demo_error"));
                return;
              }

              createOrg(data)
                .unwrap()
                .then((res) => {
                  toast.success(tOrgCreate("success"));
                  handleOpenChange?.(false);
                  if (onSuccess) {
                    onSuccess(res);
                  } else {
                    window.location.href = `/org-${res.org_id}`;
                  }
                });
            })}
            className="space-y-6 text-left"
          >
            <FieldGroup>
              <Controller
                name="org_name"
                control={orgForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-org-name">
                      {tOrgCreate("name_label")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-org-name"
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>

            <FormError
              isError={isError}
              // @ts-ignore
              message={error?.data?.message}
              error={[]}
            />
          </form>
        </div>
        <DialogFooter>
          <Button
            form="add-org-form"
            isLoading={isLoading}
            type="submit"
            disabled={IS_DEMO}
          >
            {tOrgCreate("submit_btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
