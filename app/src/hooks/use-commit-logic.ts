import { useAddLog } from "@/hooks/use-add-log";
import { MdxSnippet } from "@/editor/utils/plate-types";
import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useImages } from "@/hooks/use-images";
import { authClient } from "@/lib/auth/auth-client";
import { contentFormatter, format } from "@/lib/utils/content-serializer";
import { getLogType } from "@/lib/utils/project-log-type-detector";
import { selectConfig } from "@/redux/features/config/slice";
import { EAction } from "@/redux/features/project-log/type";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TField, TState } from "@/types";
import { useTranslations } from "next-intl";
import {
  arrayValue,
  recordValue,
  unwrapValue,
} from "@/lib/utils/frontmatter-value";
import { useParams } from "next/navigation";
import type { Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  socket?: Socket | null;
  state: TState | undefined;
  setState: React.Dispatch<React.SetStateAction<TState | undefined>>;
  filePath: string;
  fmType: format;
  schema: TField[];
  snippets: MdxSnippet[];
  startWith?: string;
  setBaseline?: (next: TState | undefined) => void;
  pageContent: string;
  onReplaceContentRef: (content: string) => void;
  newPath?: string;
  onRenameComplete?: (newPath: string) => void;
  /** Fired once after a successful commit. Used to trigger sandbox commit-sync. */
  onCommitSuccess?: () => void;
}

function checkRequiredFields(
  schemaFields: TField[],
  currentData: TState["data"] | undefined,
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
          } else if (arrayValue(fieldEntry)) {
            if (arrayValue(fieldEntry)?.length === 0) {
              isEmpty = true;
            }
          } else {
            isEmpty = true;
          }
        } else {
          const val = unwrapValue(fieldEntry);

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
        const objectData = recordValue(fieldEntry);
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
  setBaseline,
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
  const [addLog] = useAddLog();
  const { updateFiles, isPending, adapter } = useGitProvider();

  const draftRef = useRef(false);
  const [commitData, setCommitData] = useState<CommitData | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);

  const updateSavedBaseline = useCallback(() => {
    const clonedState = (() => {
      if (!state) return state;
      try {
        return JSON.parse(JSON.stringify(state)) as TState;
      } catch {
        return state;
      }
    })();

    if (clonedState) {
      clonedState.page_content = pageContent;
    }

    setBaseline?.(clonedState);

    if (setState) {
      setState(clonedState);
    }

    if (onReplaceContentRef) {
      onReplaceContentRef(pageContent);
    }
  }, [state, pageContent, setBaseline, setState, onReplaceContentRef]);

  const updateSavedBaselineRef = useRef(updateSavedBaseline);

  useEffect(() => {
    updateSavedBaselineRef.current = updateSavedBaseline;
  }, [updateSavedBaseline]);

  useEffect(() => {
    if (!socket) return;

    const onCommitCompleted = (payload: { user_name?: string }) => {
      toast.success(`Saved by ${payload.user_name}`);
      updateSavedBaselineRef.current();
    };

    const onCommitError = (payload: { message?: string }) => {
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
        const current = processedData[field.name];
        if (current) {
          processedData[field.name] = {
            ...(recordValue(current) ?? {}),
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

      const res = await updateFiles({
        files: actions,
        message: finalMessage,
        description,
      });

      if (!res.error?.message) {
        // update saved baseline (deep clone to avoid reference aliasing)
        updateSavedBaseline();

        // Optimistic update
        const committedPath = isRename ? targetPath : filePath;

        adapter.updateContentCache(
          dispatch,
          adapter.contentArgs(config, committedPath, { parser: true }),
          (draft) => {
            draft.commitDate = new Date().toString();
            draft.data = {
              ...revertToOriginal(getProcessedStateData()!),
              draft: isDraft,
            };
            draft.content = pageContent;
          },
        );

        adapter.invalidateCommit(dispatch, committedPath);

        await addLog({
          project_id: params.projectId as string,
          action: isRename ? EAction.RENAME : EAction.UPDATE,
          file: targetPath,
          file_type: getLogType(targetPath, config),
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

        const rawOrgId = params.orgId as string;
        socket?.emit("commit", {
          org_id: rawOrgId?.startsWith("org-") ? rawOrgId.slice(4) : rawOrgId,
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
      setBaseline,
      setState,
      onReplaceContentRef,
      onRenameComplete,
      adapter,
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
          } catch {
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
        const res = await adapter.fetchContent(
          dispatch,
          adapter.contentArgs(config, filePath, { parser: false }),
        );
        if (typeof res?.data === "string") {
          originalContent = res.data;
        }
      } catch {
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
    commitData,
    showCommitModal,
    setShowCommitModal,
    pending: isPending,
    getProcessedStateData,
  };
}
