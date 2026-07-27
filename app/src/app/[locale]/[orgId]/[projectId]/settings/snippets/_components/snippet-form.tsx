"use client";

import {
  AlertDialog,
  AlertDialogAction,
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
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { SNIPPET_FOLDER } from "@/lib/constant";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { slugify } from "@/lib/utils/text-converter";
import { snippetSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabContentApi,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { useAppDispatch } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import * as z from "zod/v4";
import { EditorSkeleton } from "./editor-skeleton";

const SnippetEditor = dynamic(
  () => import("./snippet-editor").then((mod) => mod.SnippetEditor),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  },
);

type SnippetFile = {
  name: string;
  path: string;
  data?: z.infer<typeof snippetSchema>;
};

type SchemaFile = {
  name: string;
  path: string;
};

type Props = {
  snippet: SnippetFile | null;
  schemas: SchemaFile[];
  onSuccess: () => void;
  defaultCode?: string;
};

export default function SnippetForm({
  snippet,
  schemas,
  onSuccess,
  defaultCode,
}: Props) {
  const config = useSelector(selectConfig);
  const params = useParams();
  const { data: auth } = authClient.useSession();

  const [addLog] = useAddProjectLogMutation();
  const [updateGhFile, { isLoading: isGhUpdating }] =
    useUpdateGitHubFilesMutation();
  const [deleteGhFile, { isLoading: isGhDeleting }] =
    useUpdateGitHubFilesMutation();
  const [updateGlFile, { isLoading: isGlUpdating }] =
    useUpdateGitLabFilesMutation();
  const [deleteGlFile, { isLoading: isGlDeleting }] =
    useUpdateGitLabFilesMutation();

  const isUpdating = isGitLabProvider(config.provider)
    ? isGlUpdating
    : isGhUpdating;
  const isDeleting = isGitLabProvider(config.provider)
    ? isGlDeleting
    : isGhDeleting;
  const dispatch = useAppDispatch();
  const anchor = useComboboxAnchor();
  const tProjectSettingsSnippets = useTranslations("project-settings.snippets");
  const tCommon = useTranslations("common");

  const f = useForm<z.infer<typeof snippetSchema>>({
    resolver: zodResolver(snippetSchema),
    defaultValues: {
      label: "",
      schema: [],
      code: "",
    },
  });

  useEffect(() => {
    if (snippet) {
      f.reset({
        label: snippet.data?.label || "",
        schema: snippet.data?.schema || [],
        code: snippet.data?.code || "",
      });
    } else {
      // Try to extract label from code if it looks like a tag
      let autoLabel = "";
      if (defaultCode) {
        // Match <Tag> or {{< Tag or {{% Tag
        const tagMatch = defaultCode.match(/^(?:<|{{\s*[<%]\s*)([\w-]+)/);
        if (tagMatch) {
          autoLabel = tagMatch[1];
        }
      }

      f.reset({
        label: autoLabel,
        schema: [],
        code: defaultCode || "",
      });
    }
  }, [snippet, f, defaultCode]);

  const onSubmit = async (data: z.infer<typeof snippetSchema>) => {
    try {
      const filePath = snippet
        ? snippet.path
        : `${SNIPPET_FOLDER}/${slugify(data.label)}.json`;
      const isCreate = !snippet;

      const result = isGitLabProvider(config.provider)
        ? await updateGlFile({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            files: [
              {
                content: JSON.stringify(data, null, 2),
                path: filePath,
              },
            ],
            message: `${isCreate ? "Create" : "Update"} snippet ${data.label}`,
          })
        : await updateGhFile({
            files: [
              {
                content: JSON.stringify(data, null, 2),
                path: filePath,
              },
            ],
            message: `${isCreate ? "Create" : "Update"} snippet ${data.label}`,
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!result.error?.message) {
        toast.success(
          isCreate
            ? tProjectSettingsSnippets("success_created")
            : tProjectSettingsSnippets("success_updated"),
        );

        if (isGitLabProvider(config.provider)) {
          // @ts-ignore
          dispatch(
            gitlabContentApi.endpoints.getGitLabSnippets.initiate(
              {
                id: config.repoName
                  ? `${config.owner}/${config.repoName}`
                  : config.owner,
                ref: config.branch,
              },
              { forceRefetch: true },
            ),
          );
        } else {
          // @ts-ignore - force refetch snippets
          dispatch(
            githubContentApi.endpoints.getGitHubSnippets.initiate(
              {
                owner: config.owner,
                repo: config.repoName,
                ref: config.branch,
              },
              { forceRefetch: true },
            ),
          );
        }

        addLog({
          project_id: params.projectId as string,
          action: isCreate ? EAction.CREATE : EAction.UPDATE,
          file: filePath,
          file_type: EProjectLogType.SNIPPET,
          user_id: auth?.user.user_id!,
        });

        onSuccess();
      } else {
        toast.error(
          result.error?.message || tProjectSettingsSnippets("error_save"),
        );
      }
    } catch (error) {
      console.error("Error saving snippet:", error);
      toast.error(tProjectSettingsSnippets("error_save"));
    }
  };

  const handleDelete = async () => {
    if (!snippet) return;

    try {
      const result = isGitLabProvider(config.provider)
        ? await deleteGlFile({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            files: [
              {
                path: snippet.path,
                delete: true,
              },
            ],
            message: `Delete snippet ${snippet.name}`,
          })
        : await deleteGhFile({
            files: [
              {
                path: snippet.path,
                delete: true,
              },
            ],
            message: `Delete snippet ${snippet.name}`,
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!result.error?.message) {
        toast.success(tProjectSettingsSnippets("success_deleted"));
        addLog({
          project_id: params.projectId as string,
          action: EAction.DELETE,
          file: snippet.path,
          file_type: EProjectLogType.SNIPPET,
          user_id: auth?.user.user_id!,
        });
        if (isGitLabProvider(config.provider)) {
          // @ts-ignore
          dispatch(
            gitlabContentApi.endpoints.getGitLabSnippets.initiate(
              {
                id: config.repoName
                  ? `${config.owner}/${config.repoName}`
                  : config.owner,
                ref: config.branch,
              },
              { forceRefetch: true },
            ),
          );
        } else {
          // @ts-ignore - force refetch snippets
          dispatch(
            githubContentApi.endpoints.getGitHubSnippets.initiate(
              {
                owner: config.owner,
                repo: config.repoName,
                ref: config.branch,
              },
              { forceRefetch: true },
            ),
          );
        }
        onSuccess();
      }
    } catch (error) {
      console.error("Error deleting snippet:", error);
      toast.error(tProjectSettingsSnippets("error_delete"));
    }
  };

  return (
    <>
      <form id="snippet-form" onSubmit={f.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="label"
            control={f.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-label">
                  {tProjectSettingsSnippets("label_field")}
                </FieldLabel>
                <Input
                  {...field}
                  id="form-label"
                  aria-invalid={fieldState.invalid}
                  placeholder={tProjectSettingsSnippets("label_placeholder")}
                  autoComplete="off"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="schema"
            control={f.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-schema">
                  {tProjectSettingsSnippets("schemas_field")}
                </FieldLabel>
                <Combobox
                  value={field.value}
                  onValueChange={field.onChange}
                  multiple
                  items={schemas.map((s) => s.name)}
                >
                  <ComboboxChips ref={anchor} className="flex-wrap">
                    <ComboboxValue>
                      {(values) => (
                        <>
                          {values.map((value: string) => (
                            <ComboboxChip key={value}>{value}</ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            placeholder={tProjectSettingsSnippets(
                              "select_schemas_placeholder",
                            )}
                            className="ml-1"
                          />
                        </>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={anchor}>
                    <ComboboxEmpty>
                      {tProjectSettingsSnippets("no_schemas_found_in_combobox")}
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="code"
            control={f.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-code">
                  {tProjectSettingsSnippets("code_field")}
                </FieldLabel>
                <SnippetEditor value={field.value} onChange={field.onChange} />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        {snippet && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                isLoading={isDeleting}
                disabled={isDeleting}
              >
                {tCommon("actions.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {tProjectSettingsSnippets("delete_confirm_title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {tProjectSettingsSnippets("delete_confirm_desc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {tCommon("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} variant="destructive">
                  {tCommon("actions.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button
          form="snippet-form"
          type="submit"
          isLoading={isUpdating}
          disabled={isUpdating}
        >
          {snippet ? tCommon("actions.update") : tCommon("actions.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
