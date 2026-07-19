"use client";

import FormError from "@/components/form-error";
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
import { projectSchema } from "@/lib/validate";
import { useUpdateProjectMutation } from "@/redux/features/project/project-api";
import { TProject } from "@/redux/features/project/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";

export default function ProjectForm(
  project: TProject & { canUpdate?: boolean },
) {
  const { org_id, project_id, project_name, project_image, site_url, ...rest } =
    project;

  const canUpdate = project.canUpdate ?? true;

  const projectForm = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_name,
      project_image,
      provider: rest.provider,
      branch: rest.branch,
      repository: rest.repository,
      visibility: rest.visibility,
      site_url: site_url,
    },
  });

  const [updateProject, { isLoading, error }] = useUpdateProjectMutation();
  const tProjectSettingsGeneralForm = useTranslations(
    "project-settings.general.form",
  );
  const tCommon = useTranslations("common");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tProjectSettingsGeneralForm("title")}</CardTitle>
        <CardDescription>
          {tProjectSettingsGeneralForm("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="project-form"
          className="space-y-4"
          onSubmit={projectForm.handleSubmit(
            async (data) => {
              if (IS_DEMO) {
                toast.error(tProjectSettingsGeneralForm("demo_error"));
                return;
              }

              let imageUrl = data.project_image;

              await updateProject({
                ...project,
                project_id: project_id,
                org_id: org_id,
                site_url: data.site_url,
                project_name: data.project_name,
                project_image: imageUrl,
                visibility: data.visibility,
              }).unwrap();

              toast.success(tProjectSettingsGeneralForm("success"));
            },
            (err) => {
              console.error(err);
            },
          )}
        >
          <FieldGroup>
            <Controller
              name="project_name"
              control={projectForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-form-name">
                    {tProjectSettingsGeneralForm("site_name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="project-form-name"
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
            <Controller
              name="site_url"
              control={projectForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-form-site-url">
                    {tProjectSettingsGeneralForm("website")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="project-form-site-url"
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
          {/* @ts-ignore */}
          <FormError error={error?.data?.errorMessage} />
        </form>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          form="project-form"
          type="submit"
          isLoading={isLoading}
          disabled={
            !canUpdate || isLoading || !projectForm.formState.isDirty || IS_DEMO
          }
        >
          {tCommon("actions.update")}
        </Button>
      </CardFooter>
    </Card>
  );
}
