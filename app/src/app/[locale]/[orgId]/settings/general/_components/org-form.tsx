"use client";

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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IS_DEMO } from "@/lib/constant";
import { updateOrgSchema } from "@/lib/validate";
import { useUpdateOrgMutation } from "@/redux/features/orgs/org-api";
import { TOrg } from "@/redux/features/orgs/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";
import { useTranslations } from "next-intl";

export default function EditOrg(org: TOrg & { canUpdate?: boolean }) {
  const { org_name, org_image, org_id } = org;
  const canUpdate = org.canUpdate ?? true;
  const [isPending, startTransition] = useTransition();
  const tOrgGeneralForm = useTranslations("org.general.form");

  const orgForm = useForm<z.infer<typeof updateOrgSchema>>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues: {
      org_name,
      org_image,
    },
  });

  const [updateOrg, { isLoading }] = useUpdateOrgMutation();

  const onSubmit = (data: z.infer<typeof updateOrgSchema>) => {
    startTransition(async () => {
      let imageUrl = data.org_image;

      if (IS_DEMO) {
        toast.error(tOrgGeneralForm("demo_error"));
        return;
      }

      await updateOrg({
        org_id: org_id,
        org_name: data.org_name,
        org_image: imageUrl,
      }).unwrap();
      toast.success(tOrgGeneralForm("success"));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tOrgGeneralForm("title")}</CardTitle>
        <CardDescription>{tOrgGeneralForm("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="org-form"
          className="space-y-4"
          onSubmit={orgForm.handleSubmit(onSubmit, (err) => {
            console.error(err);
          })}
        >
          <FieldGroup>
            <Controller
              name="org_name"
              control={orgForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="org-form-name">
                    {tOrgGeneralForm("title")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="org-form-name"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    disabled={!canUpdate}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          form="org-form"
          type="submit"
          isLoading={isPending || isLoading}
          disabled={!canUpdate || IS_DEMO || !orgForm.formState.isDirty}
        >
          {tOrgGeneralForm("update_btn")}
        </Button>
      </CardFooter>
    </Card>
  );
}
