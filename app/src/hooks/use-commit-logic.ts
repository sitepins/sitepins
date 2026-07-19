import { MdxSnippet } from "@/editor/utils/plate-types";
import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useImages } from "@/hooks/use-images";
import { authClient } from "@/lib/auth/auth-client";
import { contentFormatter, format } from "@/lib/utils/content-serializer";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { githubApi, githubContentApi } from "@/redux/features/github";
import { gitlabApi, gitlabContentApi } from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction } from "@/redux/features/project-log/type";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TField, TState } from "@/types";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface CommitData {
  path: string;
  content: string;
}

interface CommitDetails {
  message: string;
  description?: string;
  createPullRequest?: boolean;
}

interface UseCommitLogicProps {
  socket?: any;
  state: TState | undefined;
  setState: React.Dispatch<React.SetStateAction<any>>;
  filePath: string;
  fmType: format;
  schema: any[];
  snippets: MdxSnippet[];
  startWith?: string;
  storeRef: RefObject<TState | undefined>;
  pageContent: string;
  onReplaceContentRef: (content: string) => void;
  newPath?: string;
  onRenameComplete?: (newPath: string) => void;
  /** Fired once after a successful commit. Used to trigger sandbox commit-sync. */
  onCommitSuccess?: () => void;
}

function checkRequiredFields(
  schemaFields: TField[],
  currentData: any,
  parentLabel = "",
): string[] {
  if (!schemaFields || !currentData) return [];
  const emptyFields: string[] = [];

  schemaFields.forEach((field) => {
    const fieldLabel = parentLabel
      ? `${parentLabel} > ${field.label || field.name}`
      : field.label || field.name;

    // Check if the field itself is marked as required
    if (field.isRequired) {
      const fieldEntry = currentData[field.name];
      let isEmpty = false;

      if (fieldEntry === undefined || fieldEntry === null) {
        isEmpty = true;
      } else {
        // Depending on type, check the value
        if (field.type === "Array" || field.type === "gallery") {
          if (Array.isArray(fieldEntry)) {
            if (fieldEntry.length === 0) {
              isEmpty = true;
            }
          } else if (
            fieldEntry &&
            typeof fieldEntry === "object" &&
            Array.isArray(fieldEntry.value)
          ) {
            if (fieldEntry.value.length === 0) {
              isEmpty = true;
            }
          } else {
            isEmpty = true;
          }
        } else {
          // Regular fields are typically wrapped in { value, id }
          const val =
            fieldEntry &&
            typeof fieldEntry === "object" &&
            "value" in fieldEntry
              ? fieldEntry.value
              : fieldEntry;

          if (val === undefined || val === null || val === "") {
            isEmpty = true;
          } else if (Array.isArray(val) && val.length === 0) {
            isEmpty = true;
          }
        }
      }

      if (isEmpty) {
        emptyFields.push(fieldLabel);
      }
    }

    // Recurse if there are nested fields
    const fieldEntry = currentData[field.name];
    if (fieldEntry) {
      if (
        field.type === "object" &&
        field.fields &&
        Array.isArray(field.fields)
      ) {
        const objectData =
          fieldEntry && typeof fieldEntry === "object" && "value" in fieldEntry
            ? fieldEntry.value
            : fieldEntry;
        emptyFields.push(
          ...checkRequiredFields(field.fields, objectData, fieldLabel),
        );
      } else if (
        field.type === "Array" &&
        field.fields &&
        Array.isArray(field.fields)
      ) {
        const arrayData =
          fieldEntry && typeof fieldEntry === "object" && "value" in fieldEntry
            ? fieldEntry.value
            : fieldEntry;
        if (Array.isArray(arrayData)) {
          arrayData.forEach((item, index) => {
            const itemLabel = `${fieldLabel} [${index + 1}]`;
            emptyFields.push(
              ...checkRequiredFields(field.fields!, item, itemLabel),
            );
          });
        }
      }
    }
  });

  return emptyFields;
}

export function useCommitLogic({
  socket,
  state,
  filePath,
  fmType,
  schema,
  snippets,
  startWith,
  setState,
  storeRef,
  pageContent,
  onReplaceContentRef,
  newPath,
  onRenameComplete,
  onCommitSuccess,
}: UseCommitLogicProps) {
  const { images, clearImages } = useImages();
  const dispatch = useAppDispatch();
  const tEditor = useTranslations("editor.commit");
  const tFeedback = useTranslations("common.feedback");
  const tCommon = useTranslations("common");

  const { data: auth } = authClient.useSession();
  const params = useParams();
  const config = useAppSelector(selectConfig);
  const [addLog] = useAddProjectLogMutation();
  const { updateFiles, isPending, provider } = useGitProvider();

  const draftRef = useRef(false);
  const [commitData, setCommitData] = useState<CommitData | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);

  const updateSavedBaseline = useCallback(() => {
    const clonedState = (() => {
      if (!state) return state;
      try {
        return JSON.parse(JSON.stringify(state));
      } catch (e) {
        return state;
      }
    })();

    if (clonedState) {
      clonedState.page_content = pageContent;
    }

    if (storeRef) {
      storeRef.current = clonedState;
    }

    if (setState) {
      setState(clonedState as any);
    }

    if (onReplaceContentRef) {
      onReplaceContentRef(pageContent);
    }
  }, [state, pageContent, storeRef, setState, onReplaceContentRef]);

  const updateSavedBaselineRef = useRef(updateSavedBaseline);

  useEffect(() => {
    updateSavedBaselineRef.current = updateSavedBaseline;
  }, [updateSavedBaseline]);

  useEffect(() => {
    if (!socket) return;

    const onCommitCompleted = (payload: any) => {
      toast.success(`Saved by ${payload.user_name}`);
      updateSavedBaselineRef.current();
    };

    const onCommitError = (payload: any) => {
      toast.error(payload.message);
    };

    socket.on("commit:completed", onCommitCompleted);
    socket.on("commit:error", onCommitError);

    return () => {
      socket.off("commit:completed", onCommitCompleted);
      socket.off("commit:error", onCommitError);
    };
  }, [socket]);

  const getProcessedStateData = useCallback(() => {
    if (!state?.data) return state?.data;

    const processedData = { ...state.data };

    schema?.forEach((field) => {
      if (
        field?.type?.toLowerCase() === "date" &&
        field?.alwaysUseCurrentDate === true
      ) {
        if (processedData[field.name]) {
          processedData[field.name] = {
            ...processedData[field.name],
            value: new Date().toISOString(),
          };
        }
      }
    });

    return processedData;
  }, [state?.data, schema]);

  const commitToProvider = useCallback(
    async (
      images: { path: string; content: string }[],
      data: CommitData,
      isDraft: boolean,
      message = tEditor("default_message"),
      description?: string,
    ) => {
      const targetPath = newPath || data.path;
      const isRename = targetPath !== data.path;

      const finalMessage = isRename
        ? tEditor("rename_message", { oldPath: data.path, newPath: targetPath })
        : message;

      const actions = isRename
        ? [
            { path: data.path, delete: true },
            { path: targetPath, content: data.content },
            ...images,
          ]
        : [{ path: data.path, content: data.content }, ...images];

      let res: any;
      res = await updateFiles({
        files: actions,
        message: finalMessage,
        description,
      });

      if (!res.error?.message) {
        // update saved baseline (deep clone to avoid reference aliasing)
        updateSavedBaseline();

        // Optimistic update
        if (isGitLabProvider(provider)) {
          dispatch(
            gitlabContentApi.util.updateQueryData(
              "getGitLabContent",
              {
                id: config.repoName
                  ? `${config.owner}/${config.repoName}`
                  : config.owner,
                file_path: isRename ? targetPath : filePath,
                ref: config.branch,
                parser: true,
              },
              (draft: any) => {
                draft.commitDate = new Date().toString();
                draft.data = {
                  ...revertToOriginal(getProcessedStateData()!),
                  draft: isDraft,
                };
                draft.content = pageContent;
                return draft;
              },
            ),
          );

          dispatch(
            gitlabApi.util.invalidateTags([
              { type: "GitLabCommit", id: isRename ? targetPath : filePath },
            ]),
          );
        } else {
          dispatch(
            githubContentApi.util.updateQueryData(
              "getGitHubContent",
              {
                path: isRename ? targetPath : filePath,
                owner: config.owner,
                repo: config.repoName,
                parser: true,
                ref: config.branch,
              },
              (draft: any) => {
                draft.commitDate = new Date().toString();
                draft.data = {
                  ...revertToOriginal(getProcessedStateData()!),
                  draft: isDraft,
                };
                draft.content = pageContent;
                return draft;
              },
            ),
          );

          dispatch(
            githubApi.util.invalidateTags([
              { type: "GitHubCommit", id: filePath },
            ]),
          );
        }

        await addLog({
          project_id: params.projectId as string,
          action: isRename ? EAction.RENAME : EAction.UPDATE,
          file: targetPath,
          file_type: getLogType(targetPath, config),
          user_id: auth?.user.user_id!,
        });

        clearImages();
        toast.success(
          isRename
            ? tFeedback("rename_success")
            : isDraft
              ? tFeedback("draft_success")
              : tFeedback("publish_success"),
        );
        setShowCommitModal(false);

        socket?.emit("commit", {
          org_id: params.orgId as string,
          project_id: params.projectId as string,
          file: filePath,
          action: isRename ? EAction.RENAME : EAction.UPDATE,
          user_id: auth?.user.user_id,
          user_name: auth?.user.full_name,
        });

        // Silently trigger Vercel Sandbox sync in the background if an active session is running
        // Notify sandbox-preview hook (if wired) so it can pull commits + restart
        // the dev server. Decoupled via callback — this hook stays git-only.
        onCommitSuccess?.();

        if (isRename && onRenameComplete) {
          onRenameComplete(targetPath);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      newPath,
      updateFiles,
      state,
      pageContent,
      storeRef,
      setState,
      onReplaceContentRef,
      onRenameComplete,
      provider,
      config,
      params,
      auth,
      clearImages,
      addLog,
      dispatch,
      setShowCommitModal,
      getProcessedStateData,
      updateSavedBaseline,
      onCommitSuccess,
    ],
  );

  const prepareCommit = useCallback(
    async (
      // e: React.FormEvent,
      shouldCommitManual = false,
      isDraft = draftRef.current,
    ) => {
      // 1. Validate required fields
      if (schema && state?.data) {
        const emptyRequiredFields = checkRequiredFields(schema, state.data);
        if (emptyRequiredFields.length > 0) {
          const fieldsStr = emptyRequiredFields.join(", ");
          try {
            toast.error(
              tCommon("errors.required_fields_empty", { fields: fieldsStr }),
            );
          } catch (e) {
            toast.error(`Please fill in all required fields: ${fieldsStr}`);
          }
          return;
        }
      }

      draftRef.current = isDraft;

      const draftField = schema.find((item) => item.name === "draft");
      const shouldAddDraft = draftField?.type === "boolean" || isDraft === true;

      let originalContent = "";
      try {
        const promise = isGitLabProvider(config.provider)
          ? dispatch(
              gitlabContentApi.endpoints.getGitLabContent.initiate(
                {
                  id: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  file_path: filePath,
                  ref: config.branch,
                  parser: false,
                },
                { forceRefetch: true },
              ),
            )
          : dispatch(
              githubContentApi.endpoints.getGitHubContent.initiate(
                {
                  owner: config.owner,
                  repo: config.repoName,
                  path: filePath,
                  ref: config.branch, // ensure we get the file from current branch
                  parser: false,
                },
                { forceRefetch: true },
              ),
            );

        // @ts-ignore
        const res = await promise.unwrap();
        if (res && typeof res.data === "string") {
          originalContent = res.data;
        }
      } catch (e) {
        // failed to fetch original content, comments might be lost
      }

      const data: CommitData = {
        path: filePath,
        content: contentFormatter({
          data: shouldAddDraft
            ? { ...revertToOriginal(getProcessedStateData()), draft: isDraft }
            : revertToOriginal(getProcessedStateData()),
          page_content: pageContent || "",
          format: fmType,
          startWith,
          originalContent,
        }),
      };

      if (shouldCommitManual) {
        setCommitData(data);
        setShowCommitModal(true);
        return;
      }

      await commitToProvider(images, data, isDraft);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filePath,
      fmType,
      schema,
      state,
      startWith,
      config,
      snippets,
      pageContent,
      commitToProvider,
      images,
      dispatch, // Added dispatch dependency
      getProcessedStateData,
    ],
  );

  const handleCommit = useCallback(
    async (commitDetails: CommitDetails) => {
      if (!commitData) return;

      await commitToProvider(
        images,
        commitData,
        draftRef.current,
        commitDetails.message,
        commitDetails.description,
      );
    },
    [commitData, images, commitToProvider],
  );

  return {
    prepareCommit,
    handleCommit,
    draftRef,
    storeRef,
    commitData,
    showCommitModal,
    setShowCommitModal,
    pending: isPending,
    getProcessedStateData,
  };
}
