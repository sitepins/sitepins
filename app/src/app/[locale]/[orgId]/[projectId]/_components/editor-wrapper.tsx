"use client";

import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useCommitLogic } from "@/hooks/use-commit-logic";
import { useIsChanged } from "@/hooks/use-is-changed";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useSandboxPreview } from "@/hooks/use-sandbox-preview";
import { useSaveAsDraft } from "@/hooks/use-save-as-draft";
import { useSnippets } from "@/hooks/use-snippets";
import { useVercelIntegration } from "@/hooks/use-vercel-integration";
import { contentFormatter, format } from "@/lib/utils/content-serializer";
import { isConfigFile } from "@/lib/utils/is-config-file";
import { selectConfig } from "@/redux/features/config/slice";
import { useDeleteProjectContentMutation } from "@/redux/features/project-content/project-content-api";
import { useAppSelector } from "@/redux/store";
import { TField, TState } from "@/types";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import CommitModal from "./commit-modal";
import EditorHeader from "./editor-header";
import PreventNavigation from "./prevent-navigation";
import ResponsiveEditorLayout from "./responsive-editor-layout";
import SeoSetting from "./seo-setting";

interface EditorWrapperProps {
  socket?: any;
  data: Record<string, any>;
  content: string;
  schema: TField[];
  filePath: string;
  fmType: format;
  shouldShowEditor?: boolean;
  startWith?: string;
  gitSha?: string;
  isLoadedFromDbDraft?: boolean;
  hasSavedDraft?: boolean;
}

const EditorWrapper: React.FC<EditorWrapperProps> = memo(
  ({
    socket,
    data,
    content,
    schema,
    filePath,
    fmType,
    shouldShowEditor = true,
    startWith,
    gitSha,
    isLoadedFromDbDraft = false,
    hasSavedDraft = false,
  }) => {
    // Defensive: schema can be undefined from callers; default to empty array
    const safeSchema = schema ?? [];
    const config = useAppSelector(selectConfig);
    const { snippets } = useSnippets();
    const tFeedback = useTranslations("common.feedback");
    const router = useRouter();
    const params = useParams() as { orgId: string; projectId: string };
    const orgIdSafe = params.orgId?.startsWith("org-")
      ? params.orgId.slice(4)
      : params.orgId;
    const { canAccessProFeatures } = useOwnerPlan();
    const { vercelToken, vercelTeamId, vercelProjectId } = useVercelIntegration(
      params.orgId,
    );

    const storeRef = useRef<TState | undefined>({
      data,
      page_content: content ?? "",
    });

    const [state, setState] = useState<TState | undefined>({
      data,
      page_content: content ?? "",
    });

    const isDraftRef = useRef<boolean>(state?.data?.draft?.value);
    const isResettingRef = useRef<boolean>(false);
    const previewWindowRef = useRef<Window | null>(null);

    const initRef = useRef(false);
    const [contentRef, setContentRef] = useState(content || "");
    const [markdownContent, setMarkdownContent] = useState(content || "");

    // Slug / Rename State
    const [pendingSlug, setPendingSlug] = useState<string | null>(null);

    const onSlugChange = useCallback((newSlug: string) => {
      setPendingSlug(newSlug);
    }, []);

    // Calculate new path if slug is pending
    const newPath = (() => {
      if (!pendingSlug) return undefined;
      // Construct new path from filePath dir + pendingSlug + ext
      const dir = filePath.split("/").slice(0, -1).join("/");
      const ext = filePath.split(".").pop();
      const base = pendingSlug.endsWith(`.${ext}`)
        ? pendingSlug
        : `${pendingSlug}.${ext}`;
      const constructed = dir ? `${dir}/${base}` : base;

      return constructed !== filePath ? constructed : undefined;
    })();

    const onUpdateMarkdown = useCallback((content: string) => {
      setMarkdownContent(content);
    }, []);

    const onReplaceContentRef = useCallback((content: string) => {
      // conditionally
      setContentRef(content);
      setPendingSlug(null);
      // contentRef.current = content;
    }, []);

    const onUpdateContentRef = useCallback((content: string) => {
      // only once
      if (!initRef.current) {
        setContentRef(content);
        initRef.current = true;
      }
    }, []);

    const isFrontmatterChange = useIsChanged({ data: state?.data, storeRef });
    const isContentChanged = contentRef !== markdownContent;
    // Check if slug changed (rename pending)
    const isRenamePending = !!newPath;
    const hasChanges =
      isFrontmatterChange || isContentChanged || isRenamePending;

    const onRenameComplete = useCallback(
      (targetPath: string) => {
        // Redirect to new path
        const newUrl = `/${params.orgId}/${params.projectId}/content/${targetPath}`;
        router.push(newUrl);
      },
      [params, router],
    );

    // Forward-ref so commitLogic (declared first) can call sandboxPreview's
    // trigger (declared second) once it exists, without ordering gymnastics.
    const sandboxCommitSyncRef = useRef<() => void>(() => {});
    const [deleteProjectContent] = useDeleteProjectContentMutation();

    const commitLogic = useCommitLogic({
      socket,
      state,
      setState,
      filePath,
      fmType,
      schema,
      snippets,
      startWith,
      storeRef,
      pageContent: markdownContent,
      onReplaceContentRef,
      newPath,
      onRenameComplete,
      onCommitSuccess: () => {
        sandboxCommitSyncRef.current();
        deleteProjectContent({
          projectId: params.projectId,
          orgId: orgIdSafe,
          file: filePath,
        })
          .unwrap()
          .catch((err) => console.error("Failed to delete draft:", err));
      },
    });

    const {
      prepareCommit,
      handleCommit,
      showCommitModal,
      setShowCommitModal,
      pending,
      getProcessedStateData,
    } = commitLogic;

    const getUncommittedFile = useCallback(() => {
      const formattedContent = contentFormatter({
        data: revertToOriginal(getProcessedStateData()),
        page_content: markdownContent || "",
        format: fmType,
        startWith,
        originalContent: "",
      });

      return {
        path: filePath,
        content: formattedContent,
      };
    }, [getProcessedStateData, markdownContent, fmType, startWith, filePath]);

    const { triggerCommitSync } = useSandboxPreview({
      // Debounce restarts whenever editable state changes.
      contentVersion: `${markdownContent}|${JSON.stringify(state?.data ?? null)}`,
      getUncommittedFile,
      previewWindowRef,
      vercelToken,
      vercelTeamId,
      vercelProjectId,
      spProjectId: params.projectId,
    });

    useEffect(() => {
      sandboxCommitSyncRef.current = triggerCommitSync;
    }, [triggerCommitSync]);

    const handleSubmit = useCallback(
      (isDraft?: boolean) => {
        isDraftRef.current = !!isDraft;
        const passedIsDraft = isDraftRef.current;
        const shouldCommitManual =
          config.customCommit && canAccessProFeatures;
        prepareCommit(shouldCommitManual, passedIsDraft);
      },
      [config.customCommit, canAccessProFeatures, prepareCommit],
    );

    // Push to Git as draft (replaces the old "Save as Draft" Git behaviour)
    const handlePushAsDraft = useCallback(() => {
      handleSubmit(true);
    }, [handleSubmit]);

    // Get the formatted content for DB-only save
    const getFormattedContent = useCallback(() => {
      return contentFormatter({
        data: revertToOriginal(getProcessedStateData()),
        page_content: markdownContent || "",
        format: fmType,
        startWith,
        originalContent: "",
      });
    }, [getProcessedStateData, markdownContent, fmType, startWith]);

    const { saveAsDraft: handleSaveAsDraft, isSavingDraft } = useSaveAsDraft({
      projectId: params.projectId,
      orgId: orgIdSafe,
      filePath,
      getFormattedContent,
      getGitSha: () => gitSha,
      onSuccess: useCallback(() => {
        // Sync the saved baseline so hasChanges resets to false
        const cloned = (() => {
          if (!state) return state;
          try {
            return JSON.parse(JSON.stringify(state));
          } catch {
            return state;
          }
        })();
        if (cloned) cloned.page_content = markdownContent;
        storeRef.current = cloned;
        onReplaceContentRef(markdownContent);
      }, [state, markdownContent, onReplaceContentRef]),
    });

    const [isDiscardingSavedDraft, setIsDiscardingSavedDraft] = useState(false);
    const [hasSavedDraftState, setHasSavedDraftState] = useState(hasSavedDraft);

    useEffect(() => {
      setHasSavedDraftState(hasSavedDraft);
    }, [hasSavedDraft]);

    const handleDiscardSavedDraft = useCallback(async () => {
      if (!hasSavedDraftState || isDiscardingSavedDraft) return;

      setIsDiscardingSavedDraft(true);
      try {
        await deleteProjectContent({
          projectId: params.projectId,
          orgId: orgIdSafe,
          file: filePath,
        }).unwrap();
        setHasSavedDraftState(false);
        toast.success(tFeedback("draft_discard_success"));
      } catch (err) {
        console.error("Failed to discard saved draft:", err);
        toast.error((err as any)?.data?.message || tFeedback("draft_discard_error"));
      } finally {
        setIsDiscardingSavedDraft(false);
      }
    }, [
      hasSavedDraftState,
      isDiscardingSavedDraft,
      deleteProjectContent,
      params.projectId,
      orgIdSafe,
      filePath,
      tFeedback,
    ]);

    const [resetKey, setResetKey] = useState(0);

    const handleReset = useCallback(() => {
      isResettingRef.current = true;
      setMarkdownContent(contentRef);
      setResetKey((prev) => prev + 1);
      setPendingSlug(null); // Reset pending slug

      if (storeRef.current) {
        setState(JSON.parse(JSON.stringify(storeRef.current)));
      }
    }, [contentRef]);

    const isDraft = isDraftRef.current;

    return (
      <>
        <PreventNavigation isDirty={hasChanges} resetData={handleReset} />

        <div>
          <EditorHeader
            handleSubmit={handleSubmit}
            handleSaveAsDraft={handleSaveAsDraft}
            handlePushAsDraft={handlePushAsDraft}
            isSavingDraft={isSavingDraft}
            isDiscardingSavedDraft={isDiscardingSavedDraft}
            hasSavedDraft={hasSavedDraftState}
            handleDiscardSavedDraft={handleDiscardSavedDraft}
            shouldShowEditor={shouldShowEditor}
            isDraft={isDraft}
            isLoadedFromDbDraft={isLoadedFromDbDraft && hasSavedDraftState}
            resetValue={handleReset}
            hasChanges={hasChanges}
            pending={pending}
            showDraftButton={!isConfigFile(filePath)}
            filePath={filePath}
            getUncommittedFile={getUncommittedFile}
            previewWindowRef={previewWindowRef}
          >
            {shouldShowEditor && (
              <SeoSetting
                data={state?.data!}
                schema={safeSchema.filter((field) => field.type !== "object")}
                setState={setState}
                content={markdownContent}
                onSlugChange={onSlugChange}
              />
            )}
          </EditorHeader>

          <ResponsiveEditorLayout
            key={resetKey}
            shouldShowEditor={shouldShowEditor}
            schema={safeSchema}
            data={state?.data!}
            setData={setState}
            filePath={filePath}
            onUpdateMarkdown={onUpdateMarkdown}
            markdownContent={markdownContent}
            onUpdateContentRef={onUpdateContentRef}
          />
        </div>

        <CommitModal
          isOpen={showCommitModal}
          onClose={() => setShowCommitModal(false)}
          onCommit={handleCommit}
          isLoading={pending}
        />
      </>
    );
  },
);

EditorWrapper.displayName = "EditorWrapper";

export default EditorWrapper;
