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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDialog } from "@/hooks/use-dialog";
import { useGitCacheUpdates } from "@/hooks/use-git-cache-updates";
import { useGitProvider } from "@/hooks/use-git-provider";
import { authClient } from "@/lib/auth/auth-client";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { createFileSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction } from "@/redux/features/project-log/type";
import { TFiles } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import path from "path";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { z } from "zod/v4";

type Props = {
  files?: TFiles[];
  title: string;
  path: string;
  children?: React.ReactNode;
  operation?: "delete" | "rename" | "create" | "duplicate";
  media?: boolean;
  callback?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function FileOperation({
  operation,
  title,
  path: filepath,
  children,
  files,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const tDirectoryViewActions = useTranslations("directory-view.actions");
  const tCommon = useTranslations("common");
  const params = useParams();
  const { data: auth } = authClient.useSession();

  const actionLabels: Record<string, string> = {
    delete: tCommon("actions.delete"),
    rename: tCommon("actions.rename"),
    create: tCommon("actions.create"),
    duplicate: tCommon("actions.duplicate"),
  };

  const config = useSelector(selectConfig);
  const { name: fileName } = path.parse(filepath);
  const { isOpen: internalIsOpen, onOpenChange: internalOnOpenChange } =
    useDialog();
  const [addLog] = useAddProjectLogMutation();
  const { updateFiles, isPending, provider, useGitTrees, useGitContent } =
    useGitProvider();

  const { updateCacheOnDelete, updateCacheOnRename, updateCacheOnDuplicate } =
    useGitCacheUpdates();

  const [value, setValue] = useState<string>(
    process.env.NODE_ENV === "development"
      ? tCommon("confirm.confirm_value")
      : "",
  );
  const editFileForm = useForm<z.infer<typeof createFileSchema>>({
    resolver: zodResolver(createFileSchema),
    defaultValues: {
      name: fileName,
    },
  });

  useEffect(() => {
    editFileForm.reset({ name: fileName }, { keepDefaultValues: false });
  }, [editFileForm, fileName]);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalIsOpen;
  const onOpenChange = isControlled
    ? controlledOnOpenChange
    : internalOnOpenChange;

  const { data: trees } = useGitTrees(path.dirname(filepath), {
    skip: operation === "create",
  });

  const { data: content } = useGitContent(filepath, {
    skip: operation === "create",
  });

  const hasFileContent =
    typeof content?.data === "string" ||
    typeof content?.content === "string" ||
    typeof content === "string";
  const fileContent =
    typeof content?.data === "string"
      ? content.data
      : typeof content?.content === "string"
        ? content.content
        : "";

  const onRename = async (data: z.infer<typeof createFileSchema>) => {
    if (!hasFileContent) {
      toast.error(tCommon("feedback.rename_failed"));
      return;
    }

    const { dir, ext } = path.parse(filepath);
    const updatePromise = updateFiles({
      files: [
        {
          path: filepath,
          delete: true,
        },
        {
          path: `${dir}/${data.name}${ext}`,
          content: fileContent,
        },
      ],
      message: `Rename file ${fileName}`,
    });

    updatePromise.then((res: any) => {
      if (!res.error?.message) {
        addLog({
          project_id: params.projectId as string,
          action: EAction.RENAME,
          file: `${dir}/${data.name}${ext}`,
          file_type: getLogType(`${dir}/${data.name}${ext}`, config),
          user_id: auth?.user.user_id!,
        });
        toast.success(tDirectoryViewActions("file_renamed"));

        if (isGitLabProvider(provider)) {
          updateCacheOnRename(filepath, {
            name: `${data.name}${ext}`,
            path: `${dir}/${data.name}${ext}`,
          } as TFiles);
        } else {
          updateCacheOnRename(filepath, {
            name: `${data.name}${ext}`,
            path: `${dir}/${data.name}${ext}`,
          } as TFiles);
        }

        onOpenChange?.(false);
      }
    });
  };

  if (operation === "rename") {
    return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {children && (
          <AlertDialogTrigger asChild>
            <Button
              className="relative flex w-full items-center justify-start px-2 py-1.5 text-left select-none focus-visible:ring-0 focus-visible:outline-none"
              variant="ghost"
            >
              {children}
            </Button>
          </AlertDialogTrigger>
        )}
        <AlertDialogContent className="sm:max-w-md lg:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-all">
              {actionLabels[operation!]}
            </AlertDialogTitle>
            <AlertDialogDescription>{title}</AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="grid gap-3"
            onSubmit={editFileForm.handleSubmit(async (data, event) => {
              event?.preventDefault();
              const isAlreadyExit = files?.some((item) => {
                return (
                  path.parse(item.name).name.toLowerCase() ===
                  data.name.toLocaleLowerCase()
                );
              });
              if (isAlreadyExit) {
                toast.error(tDirectoryViewActions("file_already_exists"));
              } else {
                onRename(data);
              }
            })}
          >
            <FieldGroup>
              <Controller
                name="name"
                control={editFileForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel className="sr-only" htmlFor="form-file-name">
                      {tDirectoryViewActions("file_name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-file-name"
                      aria-invalid={fieldState.invalid}
                      type="text"
                      placeholder={tDirectoryViewActions("enter_file_name")}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
            <AlertDialogFooter className="sm:justify-end">
              <AlertDialogCancel asChild>
                <Button type="button" variant="outline">
                  {tCommon("actions.cancel")}
                </Button>
              </AlertDialogCancel>
              <Button isLoading={isPending} type="submit" variant="default">
                {tCommon("actions.save")}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const onDelete = async () => {
    const deletePromise = updateFiles({
      files: [
        {
          path: filepath,
          delete: true,
        },
      ],
      message: `Delete file ${fileName}`,
    });

    deletePromise.then((res: any) => {
      if (!res.error?.message) {
        addLog({
          project_id: params.projectId as string,
          action: EAction.DELETE,
          file: filepath,
          file_type: getLogType(filepath, config),
          user_id: auth?.user.user_id!,
        });
        toast.success(tDirectoryViewActions("file_deleted"));
        updateCacheOnDelete(filepath);
        onOpenChange?.(false);
      }
    });
  };

  const onDuplicate = async () => {
    if (!hasFileContent) {
      toast.error(tCommon("feedback.duplicate_failed"));
      return;
    }

    const { dir, name, ext } = path.parse(filepath);
    const treesToUse = (trees as any)?.trees || [];
    const currentFolderFiles = treesToUse.filter((file: TFiles) =>
      file.name.includes(name),
    );

    const number: number = Math.max(
      ...((currentFolderFiles as TFiles[])?.reduce<number[]>(
        (acc: number[], curr: TFiles) => {
          const regex = /_copy_(\d+)/;
          const fileName = path.parse(curr.path).name;
          const match = fileName.match(regex);
          if (match) {
            const [, number] = match;
            const extractedNumber = number ? parseInt(number, 10) : 0;
            return [...acc, extractedNumber];
          }
          return acc;
        },
        [0],
      ) || [0]),
    );

    const newPath = `${dir}/${name.replace(/_copy_(\d+)/, "")}_copy_${number + 1}${ext}`;
    const newName = `${name.replace(/_copy_(\d+)/, "")}_copy_${number + 1}${ext}`;

    const updatePromise = updateFiles({
      files: [
        {
          path: newPath,
          content: fileContent,
        },
      ],
      message: `Duplicate file ${name}`,
    });

    updatePromise.then((res: any) => {
      if (!res.error?.message) {
        addLog({
          project_id: params.projectId as string,
          action: EAction.DUPLICATE,
          file: newPath,
          file_type: getLogType(newPath, config),
          user_id: auth?.user.user_id!,
        });
        toast.success(tDirectoryViewActions("file_duplicated"));
        updateCacheOnDuplicate({
          name: newName,
          path: newPath,
          sha: null,
          type: "file",
          commitDate: new Date().toISOString(),
          isFile: true,
          size: 0,
        });
        onOpenChange?.(false);
      }
    });
  };

  if (operation === "duplicate") {
    return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {children && (
          <AlertDialogTrigger asChild>
            <Button
              className="relative flex w-full items-center justify-start px-2 py-1.5 text-left select-none focus-visible:ring-0 focus-visible:outline-none"
              variant="ghost"
            >
              {children}
            </Button>
          </AlertDialogTrigger>
        )}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionLabels[operation!]}</AlertDialogTitle>
            <AlertDialogDescription>{title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {tCommon("actions.cancel")}
            </AlertDialogCancel>
            <Button
              onClick={async (e) => {
                e.preventDefault();
                onDuplicate();
              }}
              type="button"
              isLoading={isPending}
            >
              {actionLabels[operation!]}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      {children && (
        <AlertDialogTrigger asChild>
          <Button
            className="relative flex w-full items-center justify-start px-2 py-1.5 text-left select-none focus-visible:ring-0 focus-visible:outline-none"
            variant="ghost"
          >
            {children}
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{actionLabels[operation!]}</AlertDialogTitle>
          <AlertDialogDescription>{title}</AlertDialogDescription>
          <Input
            className="mt-4"
            type="text"
            placeholder={tCommon("confirm.type_to_confirm", {
              confirm: tCommon("confirm.confirm_value"),
            })}
            onChange={(e) => setValue(e.target.value)}
            value={value}
          />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {tCommon("actions.cancel")}
          </AlertDialogCancel>
          <Button
            onClick={async (e) => {
              e.preventDefault();
              operation === "delete" ? onDelete() : onDuplicate();
            }}
            {...(operation === "delete" && {
              variant: "destructive",
            })}
            type="button"
            isLoading={isPending}
            disabled={value !== tCommon("confirm.confirm_value")}
          >
            {actionLabels[operation!]}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
