"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useGitCacheUpdates } from "@/hooks/use-git-cache-updates";
import { useSchemaData } from "@/hooks/use-schema-data";
import { authClient } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils/cn";
import { contentFormatter } from "@/lib/utils/content-serializer";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { slugify } from "@/lib/utils/text-converter";
import { createFileSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction } from "@/redux/features/project-log/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import * as z from "zod/v4";
import CreateSchema from "./create-schema";
import { convertToFormData } from "./schema-form-converter";

type Props = {
  targetPath: string;
  folderName?: string;
  schemaDir?: string;
  filePath?: string;
  group?: string;
  children?: React.ReactNode;
  size?: "default" | "sm" | "lg" | "icon";
} & ButtonProps;

export default function AddFile({
  targetPath,
  folderName,
  schemaDir,
  filePath,
  group,
  children,
  ...props
}: Props) {
  const tDirectoryView = useTranslations("directory-view");
  const tCommon = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const config = useSelector(selectConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [addLog] = useAddProjectLogMutation();
  const { data: auth } = authClient.useSession();

  const { updateCacheOnCreate } = useGitCacheUpdates();

  const [updateGitHubFiles, { isLoading: isGitHubPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGitLabPending }] =
    useUpdateGitLabFilesMutation();

  const schemaData = useSchemaData(filePath ?? "", schemaDir);

  const decodedFilepath = decodeURIComponent(
    (params.file as string[])?.join("/") || "",
  );

  const createFileForm = useForm<z.infer<typeof createFileSchema>>({
    resolver: zodResolver(createFileSchema),
    defaultValues: {
      name: "",
      title: "",
    },
  });

  const isPending =
    createFileForm.formState.isSubmitting ||
    createFileForm.formState.isLoading ||
    (isGitLabProvider(config.provider) ? isGitLabPending : isGitHubPending);

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      createFileForm.reset();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {schemaData ? (
        <DialogTrigger asChild>
          <Button {...props}>
            <Plus className="size-4" />
            <span>{tDirectoryView("add_new")}</span>
          </Button>
        </DialogTrigger>
      ) : (
        schemaDir && (
          <CreateSchema
            filePath={filePath ?? targetPath}
            group={group ?? folderName ?? ""}
            schemaDir={schemaDir}
            triggerVariant="button"
            {...props}
            className={cn("px-4", props.className)}
          >
            {children}
          </CreateSchema>
        )
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl capitalize">
            {tDirectoryView("add_new_file_in", { folder: folderName ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <form
            id="add-file-form"
            onSubmit={createFileForm.handleSubmit(async (data) => {
              try {
                const newFileText = contentFormatter({
                  data: convertToFormData(schemaData?.template, data.title),
                  page_content: "\n",
                  format: schemaData?.fmType,
                  startWith:
                    schemaData?.fmType === "yaml"
                      ? "---"
                      : schemaData?.fmType === "toml"
                        ? "+++"
                        : undefined,
                });

                const fileExtension = schemaData?.fileType || "md";
                const fileName = slugify(data.name) + "." + fileExtension;
                const fileDataToCreate = {
                  path: [decodedFilepath, fileName]
                    .filter(Boolean)
                    .join("/")
                    .replace(/\/{2,}/g, "/"),
                  content: newFileText,
                };

                const mutation = isGitLabProvider(config.provider)
                  ? updateGitLabFiles
                  : updateGitHubFiles;

                const commitMessage = tDirectoryView("commit_message", {
                  folder: folderName ?? "",
                });

                const mutationArgs = isGitLabProvider(config.provider)
                  ? {
                      id: config.repoName
                        ? `${config.owner}/${config.repoName}`
                        : config.owner,
                      branch: config.branch,
                      message: commitMessage,
                      files: [fileDataToCreate],
                    }
                  : {
                      owner: config.owner,
                      repo: config.repoName,
                      tree: config.branch,
                      files: [fileDataToCreate],
                      message: commitMessage,
                    };

                const res = await mutation(mutationArgs as any);

                if (!("error" in res)) {
                  toast.success(tDirectoryView("file_created_successfully"));
                  createFileForm.reset();

                  if (auth?.user?.id) {
                    addLog({
                      project_id: params.projectId as string,
                      action: EAction.CREATE,
                      file: fileDataToCreate.path,
                      file_type: getLogType(fileDataToCreate.path, config),
                      user_id: auth.user.id,
                    });
                  }

                  const newFileObj = {
                    name: fileName,
                    path: fileDataToCreate.path,
                    sha: null,
                    type: "file",
                    commitDate: new Date().toISOString(),
                    isFile: true,
                    size: 0,
                  };

                  // @ts-ignore
                  updateCacheOnCreate(newFileObj);

                  setIsOpen(false);
                  router.refresh();

                  // Navigate to new file
                  setTimeout(() => {
                    router.push(`${pathname}/${fileName}`);
                  }, 100);
                } else {
                  toast.error(tDirectoryView("failed_to_create_file"));
                }
              } catch (e) {
                toast.error(tDirectoryView("error_creating_file"));
                console.error(e);
              }
            })}
            className="space-y-4"
          >
            <FieldGroup>
              <Controller
                name="title"
                control={createFileForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-title">
                      {tDirectoryView("form_title")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-title"
                      aria-invalid={fieldState.invalid}
                      type="text"
                      onChange={(e) => {
                        field.onChange(e);
                        createFileForm.setValue(
                          "name",
                          slugify(e.target.value),
                        );
                      }}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="name"
                control={createFileForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-name">
                      {tDirectoryView("form_slug")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-name"
                      aria-invalid={fieldState.invalid}
                      type="text"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
          </form>
        </div>
        <DialogFooter>
          <Button form="add-file-form" isLoading={isPending} type="submit">
            {tCommon("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
