"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO, SCHEMA_FOLDER } from "@/lib/constant";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  cleanTemplateData,
  processTemplateForSave,
  Template,
} from "@/lib/utils/schema-helpers";
import { createSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabApi,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileJson, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import path from "path";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import * as z from "zod/v4";
import { SchemaBuilder } from "../../../_components/schema-builder";
import SchemaSkeleton from "./schema-skeleton";

type SchemaFile = {
  name: string; // filename without extension
  path: string; // full path including .sitepins/schema/
  data?: any;
};

const SchemaList = () => {
  const config = useSelector(selectConfig);
  const dispatch = useAppDispatch();
  const tProjectSettingsSchemas = useTranslations("project-settings.schemas");
  const tCommon = useTranslations("common");

  const [schemas, setSchemas] = useState<SchemaFile[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(true);
  const [selectedSchema, setSelectedSchema] = useState<SchemaFile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch all schema files from .sitepins/schema folder
  useEffect(() => {
    let cancelled = false;

    const fetchSchemas = async () => {
      if (
        !config.owner ||
        !config.branch ||
        !config.token ||
        (isGitHubProvider(config.provider) && !config.repoName)
      ) {
        setIsLoadingSchemas(false);
        return;
      }

      try {
        setIsLoadingSchemas(true);

        // First, get the tree to find all schema files
        const treeResult = isGitLabProvider(config.provider)
          ? await dispatch(
              // @ts-ignore
              gitlabApi.endpoints.getRepositoryTree.initiate(
                {
                  projectId: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  ref: config.branch,
                  recursive: true,
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

        if (cancelled) return;

        const treeItems =
          (treeResult &&
            ((treeResult as any).files || (treeResult as any).tree)) ||
          [];
        const schemaFiles = treeItems.filter(
          (item: any) =>
            item.type === "blob" &&
            item.path &&
            item.path.startsWith(SCHEMA_FOLDER + "/") &&
            item.path.endsWith(".json"),
        );

        if (schemaFiles.length === 0) {
          setSchemas([]);
          setIsLoadingSchemas(false);
          return;
        }

        // Fetch content for each schema file
        const schemaPromises = schemaFiles.map(async (file: any) => {
          try {
            // @ts-ignore
            const content = isGitLabProvider(config.provider)
              ? await dispatch(
                  // @ts-ignore
                  gitlabApi.endpoints.getGitLabContent.initiate(
                    {
                      id: config.repoName
                        ? `${config.owner}/${config.repoName}`
                        : config.owner,
                      file_path: file.path,
                      ref: config.branch,
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
                      path: file.path,
                      ref: config.branch,
                      parser: true,
                    },
                    { forceRefetch: false },
                  ),
                ).unwrap();

            const fileName = path.basename(file.path, ".json");
            return {
              name: fileName,
              path: file.path,
              data: content?.data || content,
            };
          } catch (e) {
            console.error(`Failed to load schema ${file.path}:`, e);
            return null;
          }
        });

        const results = await Promise.all(schemaPromises);
        if (!cancelled) {
          setSchemas(results.filter(Boolean) as SchemaFile[]);
          setIsLoadingSchemas(false);
        }
      } catch (error) {
        console.error("Error fetching schemas:", error);
        if (!cancelled) {
          setSchemas([]);
          setIsLoadingSchemas(false);
        }
      }
    };

    fetchSchemas();

    return () => {
      cancelled = true;
    };
  }, [dispatch, config]);

  const handleEditSchema = (schema: SchemaFile) => {
    setSelectedSchema(schema);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSchema(null);
  };

  const isConfigReady = Boolean(
    config.owner &&
    config.branch &&
    config.token &&
    (!isGitHubProvider(config.provider) || config.repoName),
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{tProjectSettingsSchemas("title")}</CardTitle>
          <CardDescription>
            {tProjectSettingsSchemas("description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!isConfigReady || isLoadingSchemas ? (
            <SchemaSkeleton />
          ) : schemas.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <FileJson className="mx-auto mb-3 size-12 opacity-20" />
              <p className="text-sm">
                {tProjectSettingsSchemas("no_schemas_found")}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {tProjectSettingsSchemas("create_first_schema")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schemas.map((schema) => (
                <div
                  key={schema.path}
                  className="border-border grid grid-cols-[1fr_auto] items-center justify-between gap-4 rounded-lg border p-4 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileJson className="text-accent size-4 shrink-0" />
                      <h3 className="truncate text-sm font-medium">
                        {schema.data?.name || schema.name}
                      </h3>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {schema.path}
                    </p>
                    {schema.data?.template && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {tProjectSettingsSchemas("fields_count", {
                          count: schema.data.template.length,
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleEditSchema(schema)}
                    size="sm"
                    variant="outline"
                  >
                    <Settings className="mr-1" />
                    {tCommon("actions.edit")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Schema Dialog */}
      {selectedSchema && (
        <SchemaEditDialog
          schema={selectedSchema}
          open={modalOpen}
          onOpenChange={(open) => {
            if (!open) handleCloseModal();
          }}
          onSuccess={() => {
            // Refresh schemas list
            setIsLoadingSchemas(true);
            setTimeout(() => {
              // Trigger re-fetch by updating a state
              const fetchSchemas = async () => {
                try {
                  const treeResult = isGitLabProvider(config.provider)
                    ? await dispatch(
                        // @ts-ignore
                        gitlabApi.endpoints.getRepositoryTree.initiate(
                          {
                            projectId: config.repoName
                              ? `${config.owner}/${config.repoName}`
                              : config.owner,
                            ref: config.branch,
                            recursive: true,
                          },
                          { forceRefetch: true },
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
                          { forceRefetch: true },
                        ),
                      ).unwrap();

                  const treeItems =
                    (treeResult &&
                      ((treeResult as any).files ||
                        (treeResult as any).tree)) ||
                    [];
                  const schemaFiles = treeItems.filter(
                    (item: any) =>
                      item.type === "blob" &&
                      item.path &&
                      item.path.startsWith(SCHEMA_FOLDER + "/") &&
                      item.path.endsWith(".json"),
                  );

                  const schemaPromises = schemaFiles.map(async (file: any) => {
                    try {
                      // @ts-ignore
                      const content = isGitLabProvider(config.provider)
                        ? await dispatch(
                            // @ts-ignore
                            gitlabApi.endpoints.getGitLabContent.initiate(
                              {
                                id: config.repoName
                                  ? `${config.owner}/${config.repoName}`
                                  : config.owner,
                                file_path: file.path,
                                ref: config.branch,
                              },
                              { forceRefetch: true },
                            ),
                          ).unwrap()
                        : await dispatch(
                            // @ts-ignore
                            githubContentApi.endpoints.getGitHubContent.initiate(
                              {
                                owner: config.owner,
                                repo: config.repoName,
                                path: file.path,
                                ref: config.branch,
                                parser: true,
                              },
                              { forceRefetch: true },
                            ),
                          ).unwrap();

                      const fileName = path.basename(file.path, ".json");
                      return {
                        name: fileName,
                        path: file.path,
                        data: content?.data || content,
                      };
                    } catch (e) {
                      return null;
                    }
                  });

                  const results = await Promise.all(schemaPromises);
                  setSchemas(results.filter(Boolean) as SchemaFile[]);
                  setIsLoadingSchemas(false);
                } catch (error) {
                  console.error("Error refreshing schemas:", error);
                  setIsLoadingSchemas(false);
                }
              };

              fetchSchemas();
            }, 500);
            handleCloseModal();
          }}
        />
      )}
    </>
  );
};

type SchemaEditDialogProps = {
  schema: SchemaFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function SchemaEditDialog({
  schema,
  open,
  onOpenChange,
  onSuccess,
}: SchemaEditDialogProps) {
  const config = useSelector(selectConfig);
  const dispatch = useAppDispatch();
  const params = useParams();
  const { data: auth } = authClient.useSession();

  const [template, setTemplate] = useState<Template[]>([]);
  const [initialTemplate, setInitialTemplate] = useState<string | null>(null);

  const [updateGhSchemaMutation, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGlSchemaMutation, { isLoading: isGlPending }] =
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
  const [addLog] = useAddProjectLogMutation();
  const tProjectSettingsSchemas = useTranslations("project-settings.schemas");
  const tCommon = useTranslations("common");

  const schemaForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: schema.data?.name || schema.name,
      file: schema.data?.file || "",
      template: [],
      fileType: schema.data?.fileType || "md",
      fmType: schema.data?.fmType || "yaml",
    },
  });

  // Populate form when schema data is loaded
  useEffect(() => {
    if (schema.data) {
      schemaForm.setValue("file", schema.data.file || "");
      schemaForm.setValue("fmType", schema.data.fmType || "yaml");
      schemaForm.setValue("fileType", schema.data.fileType || "md");
      schemaForm.setValue("name", schema.data.name || schema.name);
      const cleaned = cleanTemplateData(schema.data.template || []);
      setTemplate(cleaned);
      if (initialTemplate === null) {
        setInitialTemplate(JSON.stringify(cleaned));
      }
    }
  }, [schema, schemaForm, initialTemplate]);

  const handleUpdateSchema = async (data: z.infer<typeof createSchema>) => {
    const processedTemplate = processTemplateForSave(template as any);

    try {
      const result = isGitLabProvider(config.provider)
        ? await updateGlSchemaMutation({
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
                path: schema.path,
              },
            ],
            message: `Update ${data.name} schema`,
          })
        : await updateGhSchemaMutation({
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
                path: schema.path,
              },
            ],
            message: `Update ${data.name} schema`,
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!result.error?.message) {
        if (!IS_DEMO) {
          // Invalidate cache
          if (isGitLabProvider(config.provider)) {
            dispatch(gitlabApi.util.invalidateTags(["GitLabTree"]));
          } else {
            dispatch(
              githubContentApi.util.invalidateTags([
                { type: "GitHubFiles", id: "LIST" },
              ]),
            );
          }
        }

        toast.success(tProjectSettingsSchemas("success_update"));

        addLog({
          project_id: params.projectId as string,
          action: EAction.UPDATE,
          file: schema.path,
          file_type: getLogType(schema.path, config),
          user_id: auth?.user.user_id!,
        });

        onSuccess();
      }
    } catch (error) {
      console.error("Error updating schema:", error);
      toast.error(tProjectSettingsSchemas("error_update"));
    }
  };

  const handleDeleteSchema = async () => {
    try {
      const result = isGitLabProvider(config.provider)
        ? await deleteGlSchemaMutation({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            files: [
              {
                path: schema.path,
                delete: true,
              },
            ],
            message: `Delete ${schema.name} schema`,
          })
        : await deleteGhSchemaMutation({
            files: [
              {
                path: schema.path,
                delete: true,
              },
            ],
            message: `Delete ${schema.name} schema`,
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!result.error?.message) {
        if (!IS_DEMO) {
          // Invalidate cache
          if (isGitLabProvider(config.provider)) {
            dispatch(gitlabApi.util.invalidateTags(["GitLabTree"]));
          } else {
            dispatch(
              githubContentApi.util.invalidateTags([
                { type: "GitHubFiles", id: "LIST" },
              ]),
            );
          }
        }
        toast.success(tProjectSettingsSchemas("success_delete"));

        addLog({
          project_id: params.projectId as string,
          action: EAction.DELETE,
          file: schema.path,
          file_type: getLogType(schema.path, config),
          user_id: auth?.user.user_id!,
        });

        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error deleting schema:", error);
      toast.error(tProjectSettingsSchemas("error_delete"));
    }
  };

  const isDirty =
    initialTemplate !== null && JSON.stringify(template) !== initialTemplate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[80vh] md:max-w-5xl md:p-0 lg:max-w-6xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-border shrink-0 border-b p-6">
          <DialogTitle className="text-xl">
            {tProjectSettingsSchemas("edit_dialog_title")}
          </DialogTitle>
          <DialogDescription>
            {tProjectSettingsSchemas("edit_dialog_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          <form
            id="schema-edit-form"
            className="flex h-full flex-col"
            onSubmit={schemaForm.handleSubmit(handleUpdateSchema, (err) => {
              let message: string | undefined;

              const values = Object.values(err || ({} as any));
              for (const v of values) {
                if (!v) continue;
                if (v.message) {
                  message = String(v.message);
                  break;
                }
              }

              if (!message) {
                message = tProjectSettingsSchemas("error_validation");
              }

              toast.error(message);

              const firstKey = Object.keys(err || {})[0];
              if (firstKey) {
                try {
                  schemaForm.setFocus(firstKey as any);
                } catch (e) {
                  // ignore focus errors
                }
              }
            })}
          >
            <div className="border-border shrink-0 border-b px-6 py-4">
              <FieldGroup>
                <Controller
                  disabled
                  name="name"
                  control={schemaForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-schema-name text-xs font-medium">
                        {tProjectSettingsSchemas("schema_name_label")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-schema-name"
                        aria-invalid={fieldState.invalid}
                        readOnly
                        className="h-9"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
                <SchemaBuilder
                  value={template as Template[]}
                  onChange={setTemplate as any}
                />
              </div>
            </div>
          </form>
        </div>
        <DialogFooter className="bg-background border-border m-0 shrink-0 rounded-none border-t p-6 sm:m-0 md:m-0">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex-1">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteSchema}
                isLoading={isDeletingSchema}
                disabled={isPending}
                className="px-6"
              >
                {tCommon("actions.delete")}
              </Button>
            </div>
            <Button
              form="schema-edit-form"
              isLoading={isPending}
              disabled={isDeletingSchema || !isDirty}
              type="submit"
            >
              {tCommon("actions.update")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SchemaList;
