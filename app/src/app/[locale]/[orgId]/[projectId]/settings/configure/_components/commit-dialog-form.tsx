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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth/auth-client";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { commitDialogSchema } from "@/lib/validate";
import { selectConfig, updateConfig } from "@/redux/features/config/slice";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";

export default function CommitDialogForm({
  className,
}: {
  className?: string;
}) {
  const params = useParams();
  const { data: auth } = authClient.useSession();
  const config = useAppSelector(selectConfig);
  const dispatch = useAppDispatch();
  const tProjectSettingsConfigureCommit = useTranslations(
    "project-settings.configure.commit",
  );
  const tCommon = useTranslations("common");

  const [addLog] = useAddProjectLogMutation();
  const [updateGhFile, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGlFile, { isLoading: isGlPending }] =
    useUpdateGitLabFilesMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGlPending
    : isGhPending;

  const form = useForm<z.infer<typeof commitDialogSchema>>({
    resolver: zodResolver(commitDialogSchema),
    defaultValues: {
      customCommit: config.customCommit || false,
    },
    mode: "onChange",
  });

  // Watch for changes to enable save button
  const watchedValue = form.watch("customCommit");
  const isChanged = watchedValue !== config.customCommit;

  const handleSubmit = async (data: z.infer<typeof commitDialogSchema>) => {
    const files = [
      {
        path: ".sitepins/config.json",
        content: JSON.stringify(
          {
            media: config.media,
            content: config.content,

            configs: config.configs,
            arrangement: config.arrangement,
            "custom-commit": data.customCommit,
          },
          null,
          2,
        ),
      },
    ];

    try {
      const res = isGitLabProvider(config.provider)
        ? await updateGlFile({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            files,
            message: "Update commit dialog settings",
          })
        : await updateGhFile({
            files,
            message: "Update commit dialog settings",
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!res.error?.message) {
        dispatch(
          updateConfig({
            ...config,
            customCommit: data.customCommit,
          }),
        );

        addLog({
          project_id: params.projectId as string,
          action: EAction.UPDATE,
          file: ".sitepins/config.json",
          file_type: EProjectLogType.CONFIG,
          user_id: auth?.user.user_id!,
        });

        toast.success(tProjectSettingsConfigureCommit("success_update"));
      }
    } catch {
      toast.error(tProjectSettingsConfigureCommit("error_update"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tProjectSettingsConfigureCommit("title")}</CardTitle>
        <CardDescription>
          {tProjectSettingsConfigureCommit("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="commit-dialog-form"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <FieldGroup>
            <Controller
              name="customCommit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  className="grid grid-cols-[1fr_auto] gap-4"
                  data-invalid={fieldState.invalid}
                >
                  <div>
                    <FieldLabel htmlFor="form-custom-commit">
                      {tProjectSettingsConfigureCommit("custom_commit_label")}
                    </FieldLabel>
                    <FieldDescription>
                      {tProjectSettingsConfigureCommit("custom_commit_desc")}
                    </FieldDescription>
                  </div>
                  <div className="flex items-center">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          form="commit-dialog-form"
          disabled={!isChanged}
          type="submit"
          isLoading={isPending}
        >
          {tCommon("actions.save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
