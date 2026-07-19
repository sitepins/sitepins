"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDialog } from "@/hooks/use-dialog";
import { useFolderOps } from "@/hooks/use-folder-ops";
import { useGitCacheUpdates } from "@/hooks/use-git-cache-updates";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useSchemaData } from "@/hooks/use-schema-data";
import { authClient } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils/cn";
import { resolveRepoPath } from "@/lib/utils/common";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import { createFileSchema as createFolderSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabApi,
  gitlabContentApi,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";

import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { EAction } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Braces,
  Copy,
  FolderPen,
  FolderPlus,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import * as z from "zod/v4";
import CreateSchema from "./create-schema";

// In-memory cache to avoid refetching ancestor schemas repeatedly

type Props = {
  targetPath: string;
  folderName?: string;
  schemaDir?: string;
  filePath?: string;
  group?: string;
  children?: React.ReactNode;
} & ButtonProps;

export default function FolderActions({
  targetPath,
  folderName,
  schemaDir,
  filePath,
  group,
  children,
  ...props
}: Props) {
  const tDirectoryViewActions = useTranslations("directory-view.actions");
  const tCommon = useTranslations("common");
  const params = useParams();
  const { data: auth } = authClient.useSession();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const pathname = usePathname();
  const config = useSelector(selectConfig);
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);

  // Consolidated path resolution
  const relativePath = useMemo(() => {
    if (filePath !== undefined) return filePath;

    const folder =
      pathname.split("content/")[1] || pathname.split("media/")[1] || "";
    try {
      return decodeURIComponent(folder);
    } catch (e) {
      return folder;
    }
  }, [pathname, filePath]);

  const decodedFilepath = useMemo(
    () => resolveRepoPath(relativePath, config).replace(/\/$/, ""),
    [relativePath, config],
  );

  const schemaData = useSchemaData(relativePath, schemaDir);

  const folderCreateForm = useForm<z.infer<typeof createFolderSchema>>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: "",
    },
  });

  const [addLog] = useAddProjectLogMutation();

  const [createNewFolder, { isLoading: isGhFolderPending }] =
    useUpdateGitHubFilesMutation();
  const [createNewGitLabFolder, { isLoading: isGlFolderPending }] =
    useUpdateGitLabFilesMutation();

  const { updateCacheOnDelete } = useGitCacheUpdates();

  const { isOpen: isFolderOpen, onOpenChange: onFolderOpenChange } =
    useDialog();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);

  const renameForm = useForm<z.infer<typeof createFolderSchema>>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: folderName || "",
    },
  });

  const duplicateForm = useForm<z.infer<typeof createFolderSchema>>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: folderName ? `${folderName}-copy` : "copy",
    },
  });

  // Sync form values when folderName prop changes
  useEffect(() => {
    if (folderName) {
      renameForm.reset({ name: folderName }, { keepDefaultValues: false });
    }
  }, [folderName, renameForm]);

  useEffect(() => {
    if (folderName) {
      duplicateForm.reset(
        { name: `${folderName}-copy` },
        { keepDefaultValues: false },
      );
    }
  }, [folderName, duplicateForm]);

  const { useGitTrees } = useGitProvider();

  // Tree data for rename operations
  const {
    data: treesData,
    isLoading: isTreesLoading,
    isFetching: isTreesFetching,
  } = useGitTrees(decodedFilepath, {
    recursive: true,
  });

  const repoFiles = treesData?.files ?? [];

  const {
    deleteFolder,
    renameFolder,
    duplicateFolder,
    isLoading: isFolderOpsLoading,
  } = useFolderOps({
    config,
    repoFiles: repoFiles as TFiles[],
    projectId: params.projectId as string,
    userId: auth?.user.user_id!,
  });

  const isFolderPending = isGitLabProvider(config.provider)
    ? isGlFolderPending
    : isGhFolderPending;

  // Reusable handler to open delete confirmation dialog
  const handleDeleteCurrentFolder = () => {
    setIsDeleteConfirmOpen(true);
  };

  // perform the actual delete (called when user confirms)
  const performDelete = async () => {
    setIsDeleteConfirmOpen(false);

    await deleteFolder(decodedFilepath, {
      logType: getLogType(decodedFilepath, config),
      onSuccess: () => {
        // update cached listing for parent folder
        try {
          updateCacheOnDelete(decodedFilepath);
        } catch (e) {}

        // Invalidate cache tags to trigger refetch
        try {
          if (isGitLabProvider(config.provider)) {
            dispatch(
              gitlabApi.util.invalidateTags([
                { type: "GitLabFiles", id: "LIST" },
                "GitLabContent",
              ]),
            );
          } else {
            dispatch(
              githubContentApi.util.invalidateTags([
                { type: "GitHubFiles", id: "LIST" },
                "GitHubContent",
              ]),
            );
          }
        } catch (e) {}

        // Refresh server components
        router.refresh();

        // navigate to parent folder (preserve whether we're in content/media/code)
        try {
          const getBaseAndSegment = (p: string) => {
            if (!p) return { base: "", segment: "" };
            if (p.includes("content/"))
              return { base: p.split("content/")[0], segment: "content" };
            if (p.includes("media/"))
              return { base: p.split("media/")[0], segment: "media" };
            if (p.includes("code/"))
              return { base: p.split("code/")[0], segment: "code" };
            return { base: p, segment: "" };
          };

          const { base, segment } = getBaseAndSegment(pathname ?? "");
          const parent = decodedFilepath.includes("/")
            ? decodedFilepath.substring(0, decodedFilepath.lastIndexOf("/"))
            : "";
          const newPath = segment
            ? parent
              ? `${base}${segment}/${parent}`
              : `${base}${segment}`
            : parent
              ? `${base}/${parent}`
              : base;
          router.push(newPath);
        } catch (e) {}
      },
    });
  };

  // Perform folder rename
  const handleRename = async (data: z.infer<typeof createFolderSchema>) => {
    if (isTreesLoading || isTreesFetching) {
      toast.error(
        "File list is still loading. Please try again in a few seconds.",
      );
      return;
    }

    const normalizedFolderPath = decodedFilepath.replace(/\/$/, "");
    const parentPath = normalizedFolderPath.includes("/")
      ? normalizedFolderPath.split("/").slice(0, -1).join("/")
      : "";
    const newFolderPath = parentPath ? `${parentPath}/${data.name}` : data.name;

    await renameFolder(decodedFilepath, data.name, {
      logType: getLogType(newFolderPath, config),
      onSuccess: () => {
        setIsRenameOpen(false);

        // Invalidate cache tags to trigger refetch
        try {
          if (isGitLabProvider(config.provider)) {
            dispatch(
              gitlabApi.util.invalidateTags([
                { type: "GitLabFiles", id: "LIST" },
                "GitLabContent",
              ]),
            );
          } else {
            dispatch(
              githubContentApi.util.invalidateTags([
                { type: "GitHubFiles", id: "LIST" },
                "GitHubContent",
              ]),
            );
          }
        } catch (e) {}

        // Refresh server components
        router.refresh();

        // Navigate to the renamed folder with a slight delay
        setTimeout(() => {
          try {
            const getBaseAndSegment = (p: string) => {
              if (!p) return { base: "", segment: "" };
              if (p.includes("content/"))
                return { base: p.split("content/")[0], segment: "content" };
              if (p.includes("media/"))
                return { base: p.split("media/")[0], segment: "media" };
              if (p.includes("code/"))
                return { base: p.split("code/")[0], segment: "code" };
              return { base: p, segment: "" };
            };

            const { base, segment } = getBaseAndSegment(pathname ?? "");
            const newPath = segment
              ? `${base}${segment}/${newFolderPath}`
              : `${base}/${newFolderPath}`;
            router.push(newPath);
          } catch (e) {}
        }, 300);
      },
    });
  };

  // Perform folder duplication
  const handleDuplicate = async (data: z.infer<typeof createFolderSchema>) => {
    if (isTreesLoading || isTreesFetching) {
      toast.error(
        "File list is still loading. Please try again in a few seconds.",
      );
      return;
    }

    const normalizedFolderPath = decodedFilepath.replace(/\/$/, "");
    const parentPath = normalizedFolderPath.includes("/")
      ? normalizedFolderPath.split("/").slice(0, -1).join("/")
      : "";
    const newFolderPath = parentPath ? `${parentPath}/${data.name}` : data.name;

    await duplicateFolder(decodedFilepath, data.name, {
      logType: getLogType(newFolderPath, config),
      onSuccess: () => {
        setIsDuplicateOpen(false);

        // Force refetch parent folder to ensure consistency
        try {
          if (isGitLabProvider(config.provider)) {
            dispatch(
              gitlabContentApi.endpoints.getGitLabTrees.initiate(
                {
                  id: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  ref: config.branch,
                  path: parentPath || "",
                  config: config,
                },
                { forceRefetch: true },
              ),
            );
          } else {
            dispatch(
              // @ts-ignore
              githubContentApi.endpoints.getGitHubContent.initiate(
                {
                  owner: config.owner,
                  repo: config.repoName,
                  ref: config.branch,
                  path: parentPath || "",
                },
                { forceRefetch: true },
              ),
            );
          }
        } catch (e) {}

        // Force refetch trees to update sidebar and navigation
        try {
          if (isGitLabProvider(config.provider)) {
            dispatch(
              gitlabContentApi.endpoints.getGitLabTrees.initiate(
                {
                  id: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  ref: config.branch,
                  path: "",
                  config: config,
                },
                { forceRefetch: true },
              ),
            );

            dispatch(
              gitlabApi.util.invalidateTags([
                { type: "GitLabFiles", id: "LIST" },
              ]),
            );
          } else {
            // @ts-ignore
            dispatch(
              githubContentApi.endpoints.getGitHubTrees.initiate(
                {
                  owner: config.owner,
                  repo: config.repoName,
                  tree_sha: config.branch,
                  recursive: "1",
                  config: config,
                },
                { forceRefetch: true },
              ),
            );

            dispatch(
              githubContentApi.util.invalidateTags([
                { type: "GitHubFiles", id: "LIST" },
              ]),
            );
          }
        } catch (e) {}

        // Refresh server components
        router.refresh();

        // Navigate to the duplicated folder with a slight delay
        setTimeout(() => {
          try {
            const getBaseAndSegment = (p: string) => {
              if (!p) return { base: "", segment: "" };
              if (p.includes("content/"))
                return { base: p.split("content/")[0], segment: "content" };
              if (p.includes("media/"))
                return { base: p.split("media/")[0], segment: "media" };
              if (p.includes("code/"))
                return { base: p.split("code/")[0], segment: "code" };
              return { base: p, segment: "" };
            };

            const { base, segment } = getBaseAndSegment(pathname ?? "");
            const newPath = segment
              ? `${base}${segment}/${newFolderPath}`
              : `${base}/${newFolderPath}`;
            router.push(newPath);
          } catch (e) {}
        }, 300);
      },
    });
  };

  return (
    <>
      <div className={cn("flex items-center", props.className)}>
        {schemaData ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit [--radius:1rem]">
              {/* Edit/Create Schema - render a menu item with Braces icon that opens the schema dialog */}
              {schemaDir && (
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2"
                  onSelect={() => {
                    // delay opening schema dialog until dropdown closes
                    setTimeout(() => setIsSchemaDialogOpen(true), 0);
                  }}
                >
                  <Braces className="size-4" />
                  <span className="flex-1 text-sm">
                    {schemaData
                      ? tDirectoryViewActions("edit_schema")
                      : tDirectoryViewActions("create_schema")}
                  </span>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  // allow dropdown to close before opening dialog
                  setTimeout(() => onFolderOpenChange(true), 0);
                }}
              >
                <FolderPlus className="size-4" />
                {tDirectoryViewActions("new_folder")}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  setTimeout(() => {
                    renameForm.reset({ name: folderName || "" });
                    setIsRenameOpen(true);
                  }, 0);
                }}
              >
                <FolderPen className="size-4" />
                <span className="flex-1 text-sm">
                  {tDirectoryViewActions("rename_folder")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  setTimeout(() => {
                    duplicateForm.reset({
                      name: folderName ? `${folderName}-copy` : "copy",
                    });
                    setIsDuplicateOpen(true);
                  }, 0);
                }}
              >
                <Copy className="size-4" />
                <span className="flex-1 text-sm">
                  {tDirectoryViewActions("duplicate_folder")}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer"
                variant="destructive"
                onSelect={() => {
                  setTimeout(() => handleDeleteCurrentFolder(), 0);
                }}
              >
                <Trash2 className="text-destructive size-4" />
                <span className="text-destructive flex-1 text-sm">
                  {tDirectoryViewActions("delete_folder")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit [--radius:1rem]">
              {/* Edit/Create Schema - render a menu item with Braces icon that opens the schema dialog */}
              {schemaDir && (
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2"
                  onSelect={() => {
                    // delay opening schema dialog until dropdown closes
                    setTimeout(() => setIsSchemaDialogOpen(true), 0);
                  }}
                >
                  <Braces className="size-4" />
                  <span className="flex-1 text-sm">
                    {schemaData
                      ? tDirectoryViewActions("edit_schema")
                      : tDirectoryViewActions("create_schema")}
                  </span>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  // allow dropdown to close before opening dialog
                  setTimeout(() => onFolderOpenChange(true), 0);
                }}
              >
                <FolderPlus className="size-4" />
                {tDirectoryViewActions("new_folder")}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  setTimeout(() => {
                    renameForm.reset({ name: folderName || "" });
                    setIsRenameOpen(true);
                  }, 0);
                }}
              >
                <FolderPen className="size-4" />
                <span className="flex-1 text-sm">
                  {tDirectoryViewActions("rename_folder")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  setTimeout(() => {
                    duplicateForm.reset({
                      name: folderName ? `${folderName}-copy` : "copy",
                    });
                    setIsDuplicateOpen(true);
                  }, 0);
                }}
              >
                <Copy className="size-4" />
                <span className="flex-1 text-sm">
                  {tDirectoryViewActions("duplicate_folder")}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer"
                variant="destructive"
                onSelect={() => {
                  setTimeout(() => handleDeleteCurrentFolder(), 0);
                }}
              >
                <Trash2 className="text-destructive size-4" />
                <span className="text-destructive flex-1 text-sm">
                  {tDirectoryViewActions("delete_folder")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Controlled CreateSchema dialog opened from the dropdown menu above */}
      {schemaDir && (
        <CreateSchema
          filePath={filePath ?? targetPath}
          group={group ?? folderName ?? ""}
          schemaDir={schemaDir}
          triggerVariant="none"
          open={isSchemaDialogOpen}
          onOpenChange={(v) => setIsSchemaDialogOpen(v)}
        >
          {children}
        </CreateSchema>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tDirectoryViewActions("confirm_delete")}</DialogTitle>
            <DialogDescription>
              {tDirectoryViewActions("confirm_delete_message")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
              type="button"
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => performDelete()}
              isLoading={isFolderPending}
            >
              {tCommon("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tDirectoryViewActions("rename_folder")}</DialogTitle>
            <DialogDescription>
              {tDirectoryViewActions("enter_new_folder_name")}
            </DialogDescription>
          </DialogHeader>
          <form
            id="rename-form"
            className="grid gap-3"
            onSubmit={renameForm.handleSubmit(async (data, event) => {
              event?.preventDefault();
              if (data.name === folderName) {
                toast.error(
                  tDirectoryViewActions("please_enter_different_name"),
                );
                return;
              }
              handleRename(data);
            })}
          >
            <FieldGroup>
              <Controller
                name="name"
                control={renameForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-folder-name">
                      {tDirectoryViewActions("folder_name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-folder-name"
                      aria-invalid={fieldState.invalid}
                      type="text"
                      placeholder={tDirectoryViewActions("enter_folder_name")}
                    />
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
              type="button"
              variant="outline"
              onClick={() => setIsRenameOpen(false)}
              disabled={isFolderPending}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              form="rename-form"
              isLoading={isFolderPending}
              type="submit"
              variant="default"
            >
              {tCommon("actions.rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate folder dialog */}
      <Dialog open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tDirectoryViewActions("duplicate_folder")}
            </DialogTitle>
            <DialogDescription>
              {tDirectoryViewActions("enter_unique_folder_name")}
            </DialogDescription>
          </DialogHeader>

          <form
            id="duplicate-form"
            className="grid gap-3"
            onSubmit={duplicateForm.handleSubmit(async (data, event) => {
              event?.preventDefault();
              if (data.name === folderName) {
                toast.error(
                  tDirectoryViewActions("please_enter_different_name"),
                );
                return;
              }
              handleDuplicate(data);
            })}
          >
            <FieldGroup>
              <Controller
                name="name"
                control={duplicateForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-duplicate-folder-name">
                      {tDirectoryViewActions("new_folder_name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-duplicate-folder-name"
                      aria-invalid={fieldState.invalid}
                      type="text"
                      placeholder={tDirectoryViewActions("enter_folder_name")}
                    />
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
              type="button"
              variant="outline"
              onClick={() => setIsDuplicateOpen(false)}
              disabled={isFolderPending}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              form="duplicate-form"
              isLoading={isFolderPending}
              type="submit"
              variant="default"
            >
              {tCommon("actions.duplicate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder creation dialog */}
      <Dialog open={isFolderOpen} onOpenChange={onFolderOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tDirectoryViewActions("new_folder")}</DialogTitle>
            <DialogDescription>
              {tDirectoryViewActions("enter_unique_folder_name")}
            </DialogDescription>
          </DialogHeader>
          <form
            id="folder-form"
            onSubmit={folderCreateForm.handleSubmit(async (data) => {
              const newFolder = path.join(decodedFilepath, data.name);

              const filesToCreate = [
                {
                  path: newFolder + "/.gitkeep",
                  content: "",
                },
              ];

              const mutation = isGitLabProvider(config.provider)
                ? createNewGitLabFolder
                : createNewFolder;
              const mutationArgs = isGitLabProvider(config.provider)
                ? {
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    branch: config.branch,
                    message: `Create folder ${data.name}`,
                    files: filesToCreate,
                  }
                : {
                    owner: config.owner,
                    repo: config.repoName,
                    tree: config.branch,
                    files: filesToCreate,
                    message: `Create folder ${data.name}`,
                  };

              await mutation(mutationArgs as any).then((res: any) => {
                if (!res.error?.message) {
                  toast.success(
                    tDirectoryViewActions("folder_created_successfully"),
                  );
                  folderCreateForm.reset();
                  addLog({
                    project_id: params.projectId as string,
                    action: EAction.CREATE,
                    file: newFolder,
                    file_type: getLogType(newFolder, config),
                    user_id: auth?.user.user_id!,
                  });

                  const newFolderObj = {
                    name: data.name,
                    path: path.join(decodedFilepath, data.name),
                    sha: null,
                    type: "dir",
                    commitDate: new Date().toISOString(),
                    isFile: false,
                  };

                  if (isGitLabProvider(config.provider)) {
                    dispatch(
                      gitlabContentApi.util.updateQueryData(
                        "getGitLabContent",
                        {
                          id: config.repoName
                            ? `${config.owner}/${config.repoName}`
                            : config.owner,
                          file_path: decodedFilepath,
                          ref: config.branch,
                        },
                        (oldData: any) => {
                          if (oldData && Array.isArray(oldData.items)) {
                            oldData.items.push(newFolderObj);
                          }
                        },
                      ),
                    );

                    dispatch(
                      gitlabApi.util.invalidateTags([
                        { type: "GitLabFiles", id: "LIST" },
                      ]),
                    );
                  } else {
                    dispatch(
                      githubContentApi.util.updateQueryData(
                        "getGitHubContent",
                        {
                          owner: config.owner,
                          repo: config.repoName,
                          path: decodedFilepath,
                          ref: config.branch,
                        },
                        (oldData) => {
                          const files = oldData as unknown as
                            | (TFiles & { commitDate: string })[]
                            | undefined;
                          return [...(files ?? []), newFolderObj];
                        },
                      ),
                    );

                    dispatch(
                      githubContentApi.util.invalidateTags([
                        { type: "GitHubFiles", id: "LIST" },
                      ]),
                    );
                  }

                  // force refetch parent folder and trees to ensure UI reflects new folder
                  try {
                    if (isGitLabProvider(config.provider)) {
                      dispatch(
                        gitlabContentApi.endpoints.getGitLabTrees.initiate({
                          id: config.repoName
                            ? `${config.owner}/${config.repoName}`
                            : config.owner,
                          ref: config.branch,
                          path: decodedFilepath,
                          config: config,
                        }),
                      );
                    } else {
                      // @ts-ignore
                      dispatch(
                        githubContentApi.endpoints.getGitHubContent.initiate({
                          owner: config.owner,
                          repo: config.repoName,
                          ref: config.branch,
                          path: decodedFilepath,
                        }),
                      );
                    }
                  } catch (e) {}

                  router.refresh();
                  onFolderOpenChange();
                }
              });
            })}
          >
            <FieldGroup>
              <Controller
                name="name"
                control={folderCreateForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-new-folder-name">
                      {tDirectoryViewActions("folder_name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-new-folder-name"
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
          <DialogFooter>
            <Button
              form="folder-form"
              isLoading={isFolderPending}
              type="submit"
            >
              {tCommon("actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
