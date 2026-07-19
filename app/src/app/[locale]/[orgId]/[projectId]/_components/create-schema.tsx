"use client";

import Loading from "@/components/loading";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDialog } from "@/hooks/use-dialog";
import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO, SCHEMA_FOLDER } from "@/lib/constant";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  convertSchema,
  extractFolderName,
  generateSchemaName,
} from "@/lib/utils/schema-generator";
import {
  cleanTemplateData,
  processTemplateForSave,
  Template,
} from "@/lib/utils/schema-helpers";
import { createSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useGetGitHubContentQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabApi,
  useGetGitLabContentQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import path from "path";
import { ReactNode, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import * as z from "zod/v4";
import { SchemaBuilder } from "./schema-builder";

// In-memory cache to avoid refetching ancestor schemas repeatedly
const inheritedSchemaCache = new Map<string, any>();

type Props = {
  children: ReactNode;
  filePath: string;
  group: string;
  schemaDir: string;
  // triggerVariant controls how the dialog trigger is rendered.
  // 'button' renders a normal Button, 'menu' renders a DropdownMenuItem (for use inside a dropdown).
  triggerVariant?: "button" | "menu" | "none";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & ButtonProps;

export default function CreateSchema({
  children,
  filePath,
  group,
  schemaDir,
  triggerVariant = "button",
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...buttonProps
}: Props) {
  const params = useParams();
  const { data: auth } = authClient.useSession();
  const tDirectoryViewActions = useTranslations("directory-view.actions");
  const tCommon = useTranslations("common");
  const tGit = useTranslations("project.git");
  const [template, setTemplate] = useState<Template[]>([]);

  // Track initial state for "dirty" calculation
  const [initialTemplate, setInitialTemplate] = useState<string | null>(null);

  const pathname = usePathname();
  const config = useSelector(selectConfig);
  const [addLog] = useAddProjectLogMutation();
  const {
    data: ghSchemaData,
    isFetching: isGhSchemaFetching,
    refetch: ghRefetch,
    error: ghSchemaError,
  } = useGetGitHubContentQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      ref: config.branch,
      path: schemaDir,
      parser: true,
    },
    {
      skip:
        !config.owner || !config.repoName || !isGitHubProvider(config.provider),
    },
  );

  const {
    data: glSchemaData,
    isFetching: isGlSchemaFetching,
    refetch: glRefetch,
    error: glSchemaError,
  } = useGetGitLabContentQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      file_path: schemaDir,
      ref: config.branch,
      parser: true,
    },
    {
      skip:
        !config.owner || !config.branch || !isGitLabProvider(config.provider),
    },
  );

  const schemaData = isGitLabProvider(config.provider)
    ? glSchemaData
    : ghSchemaData;
  const isSchemaFetching = isGitLabProvider(config.provider)
    ? isGlSchemaFetching
    : isGhSchemaFetching;
  const schemaError = isGitLabProvider(config.provider)
    ? glSchemaError
    : ghSchemaError;
  const refetch = isGitLabProvider(config.provider) ? glRefetch : ghRefetch;

  // Determine if there's an existing schema for the current file/group
  const primarySchema =
    !schemaError && schemaData?.data ? schemaData.data : undefined;

  const dispatch = useAppDispatch();
  const [inheritedSchema, setInheritedSchema] = useState<
    Record<string, any> | undefined
  >(undefined);
  const [isSearchingInherited, setIsSearchingInherited] = useState(false);

  // If primary schema missing, try ancestor folders for schema
  useEffect(() => {
    let cancelled = false;
    if (primarySchema) return;
    if (!schemaError) return;

    setIsSearchingInherited(true);

    (async () => {
      try {
        const folder = pathname.split("content/")?.[1];
        if (!folder) return;
        let current = folder.replace(/\/+$/, "");

        const candidates: string[] = [];
        while (current && current.includes("/")) {
          current = current.substring(0, current.lastIndexOf("/"));
          const schemaName = generateSchemaName(current, config.content);
          candidates.push(`${SCHEMA_FOLDER}/${schemaName}.json`);
        }

        if (candidates.length === 0) return;

        // check cache for nearest available schema first
        for (const candidate of candidates) {
          const cacheKey = `${config.owner}|${config.repoName}|${config.branch}|${candidate}`;
          const cached = inheritedSchemaCache.get(cacheKey);
          if (cached && !cancelled) {
            setInheritedSchema(cached);
            return;
          }
        }

        // Try a single trees request to locate any ancestor schema files quickly
        try {
          // @ts-ignore
          const treeResult = isGitLabProvider(config.provider)
            ? await dispatch(
                // @ts-ignore
                gitlabContentApi.endpoints.getGitLabTrees.initiate(
                  {
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    ref: config.branch,
                    recursive: true,
                    config: config,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap()
            : await dispatch(
                // @ts-ignore
                githubContentApi.endpoints.getGitHubTrees.initiate(
                  {
                    owner: config.owner,
                    repo: config.repoName,
                    tree_sha: config.branch,
                    recursive: "1",
                    config: config,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap();

          const treeItems =
            (treeResult &&
              ((treeResult as any).files || (treeResult as any).tree)) ||
            [];
          for (const candidate of candidates) {
            const exists = treeItems.find(
              (t: any) => t && t.path === candidate,
            );
            if (exists) {
              try {
                // fetch the actual content once
                // @ts-ignore
                const res = isGitLabProvider(config.provider)
                  ? await dispatch(
                      // @ts-ignore
                      gitlabApi.endpoints.getGitLabContent.initiate(
                        {
                          id: config.repoName
                            ? `${config.owner}/${config.repoName}`
                            : config.owner,
                          file_path: candidate,
                          ref: config.branch,
                          parser: true,
                        },
                        { forceRefetch: false },
                      ),
                    ).unwrap()
                  : await dispatch(
                      // @ts-ignore
                      githubContentApi.endpoints.getGitHubContent.initiate(
                        {
                          owner: config.owner,
                          repo: config.repoName,
                          path: candidate,
                          ref: config.branch,
                          parser: true,
                        },
                        { forceRefetch: false },
                      ),
                    ).unwrap();
                if (res && !cancelled) {
                  const key = `${config.owner}|${config.repoName}|${config.branch}|${candidate}`;
                  inheritedSchemaCache.set(key, res);
                  setInheritedSchema(res as Record<string, any>);
                  return;
                }
              } catch (e) {
                // ignore and fall back to parallel lookup
              }
            }
          }
        } catch (e) {
          // getTrees failed, continue to parallel content fetch as fallback
        }

        const promises = candidates.map((candidate) =>
          // @ts-ignore
          dispatch(
            isGitLabProvider(config.provider)
              ? // @ts-ignore
                gitlabApi.endpoints.getGitLabContent.initiate(
                  {
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    file_path: candidate,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: true },
                )
              : // @ts-ignore
                githubContentApi.endpoints.getGitHubContent.initiate(
                  {
                    owner: config.owner,
                    repo: config.repoName,
                    path: candidate,
                    ref: config.branch,
                    parser: true,
                  },
                  { forceRefetch: true },
                ),
          )
            .unwrap()
            .then((res: any) => ({ candidate, res }))
            .catch(() => null),
        );

        const results = await Promise.all(promises);
        if (cancelled) return;

        for (const candidate of candidates) {
          const found = results.find(
            (r: any) => r && r.candidate === candidate && r.res,
          );
          if (found && !cancelled) {
            setInheritedSchema(found.res as Record<string, any>);
            break;
          }
        }
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setIsSearchingInherited(false);
      }
    })();

    return () => {
      cancelled = true;
      setIsSearchingInherited(false);
    };
  }, [
    schemaError,
    pathname,
    config,
    config.owner,
    config.repoName,
    config.branch,
    config.content,
    primarySchema,
    dispatch,
  ]);

  const schema = primarySchema ?? inheritedSchema?.data;

  // internal dialog state (used when not controlled by props)
  const { isOpen: _isOpenFromHook, onOpenChange: _onOpenChangeFromHook } =
    useDialog();
  const isControlled =
    typeof controlledOpen === "boolean" &&
    typeof controlledOnOpenChange === "function";
  const isOpen = isControlled ? (controlledOpen as boolean) : _isOpenFromHook;
  const handleOpenChange = (val: boolean) => {
    if (isControlled) {
      (controlledOnOpenChange as (open: boolean) => void)(val);
    } else {
      _onOpenChangeFromHook(val);
    }
  };
  const createSchemaForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: group || extractFolderName(filePath),
      file: "",
      template: [],
      fileType: "md",
      fmType: "yaml",
    },
  });

  // When schema data is loaded, populate the form and template state
  useEffect(() => {
    if (schema) {
      createSchemaForm.setValue("file", schema.file);
      createSchemaForm.setValue("fmType", schema.fmType);
      createSchemaForm.setValue("fileType", schema.fileType);
      createSchemaForm.setValue("name", schema.name);
      const cleaned = cleanTemplateData(schema.template || []);
      setTemplate(cleaned);
      if (initialTemplate === null) {
        setInitialTemplate(JSON.stringify(cleaned));
      }
    }
  }, [schema, createSchemaForm, initialTemplate]);

  // When filePath or group changes, update the name field if no schema is loaded
  useEffect(() => {
    if (!schema) {
      const currentName = createSchemaForm.getValues("name");
      if (!currentName || String(currentName).trim() === "") {
        try {
          createSchemaForm.setValue(
            "name",
            group || extractFolderName(filePath),
          );
        } catch (e) {
          // ignore
        }
      }
    }
  }, [filePath, group, schema, createSchemaForm]);

  // Watch the selected file to trigger content fetch
  const selectedFile = createSchemaForm.watch("file") ?? "";

  const [schemaGhCreate, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [schemaGlCreate, { isLoading: isGlPending }] =
    useUpdateGitLabFilesMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGlPending
    : isGhPending;

  const [deleteGhSchemaMutation, { isLoading: isGhDeletingSchema }] =
    useUpdateGitHubFilesMutation();
  const [deleteGlSchemaMutation, { isLoading: isGlDeletingSchema }] =
    useUpdateGitLabFilesMutation();

  const isDeletingSchema = isGitLabProvider(config.provider)
    ? isGlDeletingSchema
    : isGhDeletingSchema;

  const { data: ghResponse, isSuccess: isGhSuccess } = useGetGitHubContentQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      ref: config.branch,
      path: selectedFile,
      parser: true,
    },
    {
      refetchOnMountOrArgChange: true,
      skip:
        !selectedFile ||
        schema?.template ||
        !isGitHubProvider(config.provider) ||
        !config.owner ||
        !config.repoName,
    },
  );

  const { data: glResponse, isSuccess: isGlSuccess } = useGetGitLabContentQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      file_path: selectedFile,
      ref: config.branch,
      parser: true,
    },
    {
      refetchOnMountOrArgChange: true,
      skip:
        !selectedFile || schema?.template || !isGitLabProvider(config.provider),
    },
  );

  const response = isGitLabProvider(config.provider) ? glResponse : ghResponse;
  const isSuccess = isGitLabProvider(config.provider)
    ? isGlSuccess
    : isGhSuccess;
  const isLoading = false;
  const isFetching = false;

  useEffect(() => {
    if (isSuccess && response?.data) {
      const data = response.data;
      const template = convertSchema(data, (response as any).comments);
      const cleaned = cleanTemplateData(template as any);
      setTemplate(cleaned);
      setInitialTemplate(JSON.stringify(cleaned));
      if (response.fmType) {
        createSchemaForm.setValue("fmType", response.fmType);
      }
      createSchemaForm.setValue(
        "fileType",
        path.parse(selectedFile).ext.replace(".", "") as any,
      );
    }
  }, [isSuccess, isLoading, response, createSchemaForm, selectedFile, schema]);
  const deleteSchema = async () => {
    if (!schema) return;

    if (!schemaDir) {
      toast.error(tDirectoryViewActions("schema_dir_not_found"));
      return;
    }

    try {
      const result = isGitLabProvider(config.provider)
        ? await deleteGlSchemaMutation({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            files: [
              {
                path: schemaDir,
                delete: true,
              },
            ],
            message: tGit("commit_messages.delete_schema", {
              name: path.basename(schemaDir || ""),
            }),
          })
        : await deleteGhSchemaMutation({
            files: [
              {
                path: schemaDir,
                delete: true,
              },
            ],
            message: tGit("commit_messages.delete_schema", {
              name: path.basename(schemaDir || ""),
            }),
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!result.error?.message) {
        if (!IS_DEMO) {
          refetch();
        }
        toast.success(tDirectoryViewActions("schema_deleted_success"));

        addLog({
          project_id: params.projectId as string,
          action: EAction.DELETE,
          file: schemaDir || "",
          file_type: getLogType(schemaDir || "", config),
          user_id: auth?.user.user_id!,
        });

        handleOpenChange(false);
      }
    } catch (error) {
      toast.error(tDirectoryViewActions("error_deleting_schema"));
    }
  };

  const isDirty =
    initialTemplate !== null && JSON.stringify(template) !== initialTemplate;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {triggerVariant !== "none" &&
        !isSchemaFetching &&
        !isSearchingInherited &&
        (triggerVariant === "menu" ? (
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2"
            asChild
          >
            {children}
            <span className="flex-1 text-sm capitalize">
              {schema
                ? tDirectoryViewActions("edit_schema")
                : tDirectoryViewActions("create_schema")}
            </span>
          </DropdownMenuItem>
        ) : (
          // For button variant, only render the trigger when no schema exists
          !schema && (
            <DialogTrigger asChild>
              <Button {...buttonProps} type="button">
                <span className="flex-1 text-sm capitalize">
                  {tDirectoryViewActions("create_schema")}
                </span>{" "}
                <span className="hidden flex-1 text-sm capitalize sm:inline">
                  {tDirectoryViewActions("to_add_new_file")}
                </span>
              </Button>
            </DialogTrigger>
          )
        ))}
      <DialogContent
        className="flex h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[80vh] md:max-w-5xl md:p-0 lg:max-w-6xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Dialog Header */}
        <DialogHeader className="border-border shrink-0 border-b p-6">
          <DialogTitle>
            {schema
              ? tDirectoryViewActions("edit_schema")
              : tDirectoryViewActions("create_schema")}
          </DialogTitle>
          <DialogDescription>
            {schema
              ? tDirectoryViewActions("modify_schema_desc")
              : tDirectoryViewActions("create_schema_desc")}
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form
          id="form-schema-create"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={createSchemaForm.handleSubmit(
            async (data) => {
              if (!schemaDir) {
                toast.error(tDirectoryViewActions("schema_dir_not_found"));
                return;
              }

              const processedTemplate = processTemplateForSave(template as any);

              const schemaCreatePromise = isGitLabProvider(config.provider)
                ? schemaGlCreate({
                    id: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    branch: config.branch,
                    files: [
                      {
                        content: JSON.stringify(
                          {
                            ...data,
                            template: processedTemplate,
                          },
                          null,
                          2,
                        ),
                        path: schemaDir,
                      },
                    ],
                    message: tGit(
                      schema
                        ? "commit_messages.update_schema"
                        : "commit_messages.create_schema",
                      { name: data.name },
                    ),
                  })
                : schemaGhCreate({
                    files: [
                      {
                        content: JSON.stringify(
                          {
                            ...data,
                            template: processedTemplate,
                          },
                          null,
                          2,
                        ),
                        path: schemaDir,
                      },
                    ],
                    message: tGit(
                      schema
                        ? "commit_messages.update_schema"
                        : "commit_messages.create_schema",
                      { name: data.name },
                    ),
                    owner: config.owner,
                    repo: config.repoName,
                    tree: config.branch,
                  });

              schemaCreatePromise.then((res: any) => {
                if (!res.error?.message) {
                  if (!IS_DEMO) {
                    refetch();
                  }
                  toast.success(
                    schemaData
                      ? tDirectoryViewActions("schema_updated_success")
                      : tDirectoryViewActions("schema_created_success"),
                  );

                  addLog({
                    project_id: params.projectId as string,
                    action: schemaData ? EAction.UPDATE : EAction.CREATE,
                    file: schemaDir || "",
                    file_type: getLogType(schemaDir || "", config),
                    user_id: auth?.user.user_id!,
                  });

                  handleOpenChange(false);
                }
              });
            },
            (err) => {
              let message: string | undefined;

              const values = Object.values(err || ({} as any));
              for (const v of values) {
                if (!v) continue;
                if (v.message) {
                  message = String(v.message);
                  break;
                }
                if (typeof v === "object") {
                  const nested = Object.values(v as any).find(
                    (n) => n && (typeof n === "string" || (n as any).message),
                  );
                  if (nested) {
                    if (typeof nested === "string") {
                      message = nested as string;
                    } else if (
                      nested &&
                      typeof (nested as any).message === "string"
                    ) {
                      message = (nested as any).message;
                    }
                    if (message) break;
                  }
                }
              }

              if (!message) {
                message = tDirectoryViewActions("please_fix_highlighted");
              }

              toast.error(message);

              const firstKey = Object.keys(err || {})[0];
              if (firstKey) {
                try {
                  createSchemaForm.setFocus(firstKey as any);
                } catch (e) {
                  // ignore focus errors
                }
              }
            },
          )}
        >
          {/* Template file selector (only when creating, not editing) */}
          {!schema && (
            <div className="border-border shrink-0 border-b px-6 py-4">
              <FieldGroup>
                <Controller
                  name="file"
                  control={createSchemaForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-file">
                        {tDirectoryViewActions("choose_template_file")}
                      </FieldLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                        }}
                        value={field.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={tDirectoryViewActions("select_afile")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>{children}</SelectGroup>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>
          )}

          {/* Main body */}
          <div className="flex min-h-0 flex-1 flex-col">
            {isFetching || isSchemaFetching ? (
              <div className="flex h-full items-center justify-center gap-3">
                <p className="text-muted-foreground text-sm">
                  {tDirectoryViewActions("please_wait")}
                </p>
                <Loading
                  className="inline-block"
                  sizeClass="size-5"
                  center={false}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
                <SchemaBuilder
                  value={template as Template[]}
                  onChange={setTemplate as any}
                />
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="bg-background border-border m-0 shrink-0 rounded-none border-t p-6 sm:m-0 md:m-0">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex-1">
              {schema && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteSchema}
                  isLoading={isDeletingSchema}
                  disabled={isPending}
                  className="px-6"
                >
                  {tCommon("actions.delete")}
                </Button>
              )}
            </div>
            <Button
              form="form-schema-create"
              isLoading={isPending}
              disabled={
                schema
                  ? !isDirty || isDeletingSchema
                  : isPending ||
                    !(selectedFile?.length || (template && template.length > 0))
              }
              type="submit"
            >
              {!!schema
                ? tCommon("actions.update")
                : tDirectoryViewActions("create_schema")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
