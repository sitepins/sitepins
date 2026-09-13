"use client";

import { AiUpgrade } from "@/components/ai-upgrade";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { useAiAccess } from "@/hooks/use-ai-access";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { usePresence } from "@/hooks/use-presence";
import { useSandboxPreview } from "@/hooks/use-sandbox-preview";
import { useVercelIntegration } from "@/hooks/use-vercel-integration";
import { logger } from "@/lib/logger";
import { isExplanationQuery } from "@/lib/utils/ai-intent";
import { cn } from "@/lib/utils/cn";
import {
  getDeploymentStatusClass,
  getDeploymentStatusI18nKey,
  isDisplayableDeploymentStatus,
} from "@/lib/utils/deployment-status";
import { configureMonacoLoader } from "@/lib/utils/monaco";
import { normalizePath } from "@/lib/utils/normalize-path";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import {
  applyShikiToMonaco,
  hasShikiHighlighter,
  preloadShiki,
} from "@/lib/utils/shiki";
import { selectConfig } from "@/redux/features/config/slice";
import { commitStatusState } from "@/redux/features/git/provider-adapter";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import type {
  MonacoDiffEditor as MonacoDiffEditorType,
  OnMount,
} from "@monaco-editor/react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Columns2,
  PanelLeft,
  RotateCcw,
  Save,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import path from "path";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import CommitModal from "../../../_components/commit-modal";
import PresenceAvatars from "../../../_components/presence-avatars";
import PreventNavigation from "../../../_components/prevent-navigation";
import PreviewButton from "../../../_components/preview-button";
import { CodeAiWidget } from "./code-ai-widget";
import CodeSkeleton from "./code-skeleton";
import { getLanguageFromExtension } from "./file-icons";

// Configure Monaco AMD loader to a compatible CDN version
configureMonacoLoader();

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: CodeSkeleton,
});

// Dynamically import Monaco Diff Editor for AI Review Mode
const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: CodeSkeleton,
  },
);

type MonacoRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

type CodeEditorProps = {
  filePath: string;
  content: string;
  orgId: string;
  projectId: string;
};

export default function CodeEditor({
  filePath,
  content,
  orgId,
  projectId,
}: CodeEditorProps) {
  const tCommon = useTranslations("common");
  const tEditor = useTranslations("editor");
  const tEditorHeader = useTranslations("editor.header");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const config = useSelector(selectConfig);
  const router = useRouter();
  const [updateGhFiles, { isLoading: isGhSaving }] =
    useUpdateGitHubFilesMutation();
  const [updateGlFiles, { isLoading: isGlSaving }] =
    useUpdateGitLabFilesMutation();

  const { vercelToken, vercelTeamId, vercelProjectId } =
    useVercelIntegration(orgId);

  const isSaving = isGitLabProvider(config.provider) ? isGlSaving : isGhSaving;

  const { canAccessProFeatures } = useOwnerPlan();
  const { useGitCommitStatus } = useGitProvider();

  const [statusState, setStatusState] = useState<string | undefined>(undefined);
  const pollingInterval = useDeploymentStatusPollingInterval(statusState);

  const { data: rawStatus, refetch: refetchStatus } = useGitCommitStatus({
    skip: !config.owner || !config.branch || !canAccessProFeatures,
    pollingInterval,
  });
  const statusStateFromData = commitStatusState(rawStatus);

  const prevSavingRef = useRef(isSaving);
  useEffect(() => {
    if (prevSavingRef.current && !isSaving) {
      setStatusState(undefined);
      if (canAccessProFeatures) refetchStatus();
    }
    prevSavingRef.current = isSaving;
  }, [isSaving, canAccessProFeatures, refetchStatus]);

  if (statusState !== statusStateFromData) {
    setStatusState(statusStateFromData);
  }

  const deploymentStatus = statusStateFromData;

  const [value, setValue] = useState(content);
  const [savedContent, setSavedContent] = useState(content);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [shikiReady, setShikiReady] = useState(false);

  useEffect(() => {
    preloadShiki()
      .catch((err) => {
        logger.warn("Failed to preload Shiki:", err);
      })
      .finally(() => {
        setShikiReady(true);
      });
  }, []);

  const monacoEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoModuleRef = useRef<Parameters<OnMount>[1] | null>(null);
  const previewWindowRef = useRef<Window | null>(null);

  const language = getLanguageFromExtension(filePath);
  const fileName = path.basename(filePath);
  const { activeUsers } = usePresence(orgId, projectId, filePath);

  const { resolvedTheme } = useTheme();
  // Derive monacoTheme: use Shiki theme if ready and available, else fall back to built-in vs/vs-dark
  const monacoTheme =
    shikiReady && hasShikiHighlighter()
      ? resolvedTheme === "dark"
        ? "dark-plus"
        : "light-plus"
      : resolvedTheme === "dark"
        ? "vs-dark"
        : "vs";

  const hasChanges = value !== savedContent;

  // Reload the editor when a different file (or a new revision) arrives,
  // without discarding in-progress edits to the same content.
  const [loadedContent, setLoadedContent] = useState(content);
  if (loadedContent !== content) {
    setLoadedContent(content);
    setSavedContent(content);
    setValue(content);
  }

  // Keep a ref to the latest value so getUncommittedFile doesn't close over stale state.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const getUncommittedFile = useCallback(
    () => ({ path: filePath, content: valueRef.current }),
    [filePath],
  );

  const { triggerCommitSync } = useSandboxPreview({
    contentVersion: value,
    getUncommittedFile,
    previewWindowRef,
    vercelToken,
    vercelTeamId,
    vercelProjectId,
    spProjectId: projectId,
  });

  const { checkAiAccess, isCodeAiEnabled, isAiCommitEnabled } = useAiAccess();
  const isCodeAiEnabledRef = useRef(isCodeAiEnabled);
  useEffect(() => {
    isCodeAiEnabledRef.current = isCodeAiEnabled;
  }, [isCodeAiEnabled]);

  const isAiCommitEnabledRef = useRef(isAiCommitEnabled);
  useEffect(() => {
    isAiCommitEnabledRef.current = isAiCommitEnabled;
  }, [isAiCommitEnabled]);

  // Commit Modal state (Option D)
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [autoGenerateCommitAi, setAutoGenerateCommitAi] = useState(false);

  // AI Inline Copilot states (Option A)
  const [isAiWidgetOpen, setIsAiWidgetOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGeneratedCode, setAiGeneratedCode] = useState<string | null>(null);
  const [aiSelectedText, setAiSelectedText] = useState("");
  const [aiTargetRange, setAiTargetRange] = useState<MonacoRange | null>(null);
  const [diffSideBySide, setDiffSideBySide] = useState(false);
  const [preAiOriginalCode, setPreAiOriginalCode] = useState("");
  const preAiCodeRef = useRef<string>("");
  const currentStreamingRangeRef = useRef<MonacoRange | null>(null);
  const diffEditorRef = useRef<MonacoDiffEditorType | null>(null);

  // Derived visible state (closed if Code AI is disabled)
  const isAiWidgetVisible = isCodeAiEnabled && isAiWidgetOpen;

  // AI Code Explain states
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationText, setExplanationText] = useState("");

  const handleOpenAiWidget = useCallback(
    (initialPrompt = "") => {
      if (!isCodeAiEnabledRef.current || !checkAiAccess()) return;

      const editor = monacoEditorRef.current;
      let selected = "";
      let range = null;

      if (editor) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          selected = editor.getModel()?.getValueInRange(selection) || "";
          range = selection;
        }
      }

      setAiSelectedText(selected);
      setAiTargetRange(range);
      setAiInitialPrompt(initialPrompt);
      setAiGeneratedCode(null);
      setIsAiWidgetOpen(true);
    },
    [checkAiAccess],
  );

  const handleOpenAiWidgetRef = useRef(handleOpenAiWidget);
  useEffect(() => {
    handleOpenAiWidgetRef.current = handleOpenAiWidget;
  }, [handleOpenAiWidget]);

  useEffect(() => {
    const handleAiCommit = (e: Event) => {
      if (!isAiCommitEnabledRef.current) return;
      e.preventDefault();
      setAutoGenerateCommitAi(true);
      setShowCommitModal(true);
    };
    const handleAiCopilot = (e: Event) => {
      if (!isCodeAiEnabledRef.current) return;
      e.preventDefault();
      handleOpenAiWidget();
    };

    window.addEventListener("sitepins:ai-commit", handleAiCommit);
    window.addEventListener("sitepins:ai-copilot-open", handleAiCopilot);
    return () => {
      window.removeEventListener("sitepins:ai-commit", handleAiCommit);
      window.removeEventListener("sitepins:ai-copilot-open", handleAiCopilot);
    };
  }, [handleOpenAiWidget, setShowCommitModal]);

  const handleExplainCode = useCallback(
    async (codeToExplain?: string, customInstruction?: string) => {
      if (!checkAiAccess()) return;
      const editor = monacoEditorRef.current;
      let targetCode = codeToExplain;

      if (!targetCode && editor) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          targetCode = editor.getModel()?.getValueInRange(selection);
          setAiSelectedText(targetCode || "");
          setAiTargetRange(selection);
        } else {
          targetCode = editor.getValue();
          setAiSelectedText("");
          setAiTargetRange(null);
        }
      }

      if (!targetCode || !targetCode.trim()) {
        toast.error(tEditor("code.ai.no_code_to_explain"));
        return;
      }

      // Everything happens directly inside the AI Copilot sidebar
      setIsAiWidgetOpen(true);
      setIsExplaining(true);
      setExplanationText("");

      try {
        const cred = getAICredential();
        const response = await fetch("/api/ai/code-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: targetCode,
            filePath,
            language,
            framework: config.framework,
            apiKey: cred?.apiKey,
            provider: cred?.provider,
            model: cred?.model,
            instruction: customInstruction,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Failed to explain code");
        }

        if (!response.body) throw new Error("No response stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(chunk, { stream: true });
          setExplanationText(accumulated);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to analyze code";
        toast.error(msg);
      } finally {
        setIsExplaining(false);
      }
    },
    [checkAiAccess, config.framework, filePath, language, tEditor],
  );

  const handleExplainCodeRef = useRef(handleExplainCode);
  useEffect(() => {
    handleExplainCodeRef.current = handleExplainCode;
  }, [handleExplainCode]);

  const handleAiGenerate = async (
    instruction: string,
    scopeOverride?: "selection" | "file",
  ) => {
    if (!checkAiAccess()) return;

    // Check if the user is asking an informational/explanation question rather than requesting a code edit
    if (isExplanationQuery(instruction)) {
      const editor = monacoEditorRef.current;
      let targetCode: string | undefined;
      const effectiveScope =
        scopeOverride || (aiSelectedText ? "selection" : "file");
      if (effectiveScope === "selection" && aiSelectedText) {
        targetCode = aiSelectedText;
      } else if (editor) {
        targetCode = editor.getValue();
      }
      return handleExplainCode(targetCode, instruction);
    }

    const effectiveScope =
      scopeOverride || (aiSelectedText ? "selection" : "file");
    setIsAiGenerating(true);
    setAiGeneratedCode(null);
    setExplanationText("");
    setIsExplaining(false);

    const isSelectionScope =
      effectiveScope === "selection" && Boolean(aiSelectedText);

    const editor = monacoEditorRef.current;
    const monaco = monacoModuleRef.current;
    const model = editor?.getModel();

    // Snapshot pre-AI baseline code ONLY once per AI session for accurate diff and rollback
    if (!preAiCodeRef.current) {
      const initialCode = editor ? editor.getValue() : value;
      preAiCodeRef.current = initialCode;
      setPreAiOriginalCode(initialCode);
    }

    if (editor && monaco && model) {
      if (isSelectionScope && aiTargetRange) {
        currentStreamingRangeRef.current = aiTargetRange;
      } else {
        currentStreamingRangeRef.current = model.getFullModelRange();
      }
    }

    try {
      const cred = getAICredential();
      const response = await fetch("/api/ai/code-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          selectedCode: isSelectionScope ? aiSelectedText : undefined,
          fullContent: isSelectionScope ? undefined : value,
          filePath,
          language,
          framework: config.framework,
          apiKey: cred?.apiKey,
          provider: cred?.provider,
          model: cred?.model,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate code edit");
      }

      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(chunk, { stream: true });
        setAiGeneratedCode(accumulated);

        // Stream code directly into the Monaco editor in real time
        if (editor && monaco && model && currentStreamingRangeRef.current) {
          const range = currentStreamingRangeRef.current;
          const startLine = range.startLineNumber;
          const startCol = range.startColumn;

          editor.executeEdits("ai-streaming", [
            {
              range,
              text: accumulated,
              forceMoveMarkers: true,
            },
          ]);

          const lines = accumulated.split("\n");
          const endLine = startLine + lines.length - 1;
          const endCol =
            lines.length === 1
              ? startCol + lines[0].length
              : lines[lines.length - 1].length + 1;

          currentStreamingRangeRef.current = new monaco.Range(
            startLine,
            startCol,
            endLine,
            endCol,
          );

          editor.revealLine(endLine);
          setValue(model.getValue());
        }
      }

      if (!accumulated.trim()) {
        throw new Error(
          "No code was generated. The request may have exceeded provider token limits or was interrupted.",
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "AI code generation failed";
      toast.error(msg);

      // Restore editor to original pre-AI content on failure
      if (editor && preAiCodeRef.current !== undefined) {
        const currentModel = editor.getModel();
        if (currentModel) {
          currentModel.setValue(preAiCodeRef.current);
          setValue(preAiCodeRef.current);
        }
      }
      setAiGeneratedCode(null);
      setPreAiOriginalCode("");
      currentStreamingRangeRef.current = null;
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAiAccept = () => {
    const acceptedCode = value;
    setValue(acceptedCode);

    const editor = monacoEditorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== acceptedCode) {
        model.setValue(acceptedCode);
      }
      editor.focus();
    }

    setAiGeneratedCode(null);
    setIsAiGenerating(false);
    preAiCodeRef.current = "";
    setPreAiOriginalCode("");
    setAiInitialPrompt("");
    currentStreamingRangeRef.current = null;
    diffEditorRef.current = null;
    toast.success(tEditor("code.ai.changes_applied"));
  };

  const handleAiDiscard = () => {
    const revertedCode = preAiCodeRef.current || value;
    setValue(revertedCode);

    const editor = monacoEditorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== revertedCode) {
        model.setValue(revertedCode);
      }
      editor.focus();
    }

    preAiCodeRef.current = "";
    setPreAiOriginalCode("");
    setAiGeneratedCode(null);
    setIsAiGenerating(false);
    setAiInitialPrompt("");
    currentStreamingRangeRef.current = null;
    diffEditorRef.current = null;
    toast(tEditor("code.discard_success"));
  };

  const handleSave = () => {
    if (!hasChanges) {
      toast(tEditor("code.no_changes_save"));
      return;
    }
    setShowCommitModal(true);
  };

  const handleCommitConfirm = async (details: {
    message: string;
    description: string;
    createPullRequest: boolean;
  }) => {
    try {
      const commitTitle =
        details.message.trim() || tEditor("code.update_message", { fileName });
      const fullMessage = details.description?.trim()
        ? `${commitTitle}\n\n${details.description.trim()}`
        : commitTitle;

      if (isGitLabProvider(config.provider)) {
        await updateGlFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          files: [{ path: filePath, content: value }],
          message: fullMessage,
        }).unwrap();
      } else {
        await updateGhFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          files: [{ path: filePath, content: value }],
          message: fullMessage,
        }).unwrap();
      }

      setSavedContent(value);
      setShowCommitModal(false);
      toast.success(tEditor("code.update_success", { fileName }));
      triggerCommitSync();
    } catch (error) {
      logger.error("Save error:", error);
      toast.error(tEditor("code.save_error"));
    }
  };

  const handleReset = () => {
    setValue(savedContent);
  };

  const handleDiscardWithConfirmation = () => {
    if (!hasChanges) {
      toast(tEditor("code.no_changes_discard"));
      return;
    }
    setShowDiscardDialog(true);
  };

  const confirmDiscard = () => {
    handleReset();
    setShowDiscardDialog(false);
    toast.success(tEditor("code.discard_success"));
  };

  const handleEditorDidMount: OnMount = (monacoEditor, monaco) => {
    monacoEditorRef.current = monacoEditor;
    monacoModuleRef.current = monaco;

    setTimeout(() => setIsEditorReady(true), 100);

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      handleDiscardWithConfirmation();
    });

    // Monaco Actions for Context Menu & Shortcuts (only when Code AI is enabled)
    if (isCodeAiEnabledRef.current) {
      monacoEditor.addAction({
        id: "sitepins-ai-copilot",
        label: "Edit with AI Copilot",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
        contextMenuGroupId: "1_ai",
        contextMenuOrder: 1,
        run: () => {
          handleOpenAiWidgetRef.current();
        },
      });

      monacoEditor.addAction({
        id: "sitepins-ai-explain",
        label: "Explain Code with AI",
        contextMenuGroupId: "1_ai",
        contextMenuOrder: 2,
        run: () => {
          handleExplainCodeRef.current();
        },
      });

      monacoEditor.addAction({
        id: "sitepins-ai-fix-bugs",
        label: "Find & Fix Bugs with AI",
        contextMenuGroupId: "1_ai",
        contextMenuOrder: 3,
        run: () => {
          handleOpenAiWidgetRef.current(
            "Find and fix any syntax errors, unclosed tags, or bugs in this code",
          );
        },
      });

      monacoEditor.addAction({
        id: "sitepins-ai-refactor",
        label: "Refactor & Optimize with AI",
        contextMenuGroupId: "1_ai",
        contextMenuOrder: 4,
        run: () => {
          handleOpenAiWidgetRef.current(
            "Refactor and optimize this code for readability and performance",
          );
        },
      });

      monacoEditor.addAction({
        id: "sitepins-ai-comments",
        label: "Add Documentation Comments",
        contextMenuGroupId: "1_ai",
        contextMenuOrder: 5,
        run: () => {
          handleOpenAiWidgetRef.current(
            "Add clear, concise documentation comments explaining this code",
          );
        },
      });
    }

    const resizeObserver = new ResizeObserver(() => monacoEditor.layout());
    const container = monacoEditor.getContainerDomNode();
    if (container) resizeObserver.observe(container);
  };

  const repo = config.repoName?.includes("/")
    ? config.repoName
    : `${config.owner}/${config.repoName}`;

  return (
    <div
      className={cn(
        "flex h-full max-h-screen flex-col transition-[margin] duration-300",
        isAiWidgetVisible && "2xl:me-105",
      )}
    >
      <PreventNavigation isDirty={hasChanges} resetData={handleReset} />

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <TriangleAlert className="text-destructive me-2" />
              {tEditor("code.discard_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon("confirm.are_you_sure")}{" "}
              {tCommon("confirm.cannot_be_undone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              {tEditor("code.discard_button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Header ── */}
      <div className="bg-background sticky inset-s-0 top-0 z-50 shrink-0">
        {/* Row 1: actions — matches content editor header style */}
        <header className="border-border bg-light flex items-center justify-between border-b px-2.5 py-2.5 sm:px-4 sm:py-4 lg:px-6">
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              onClick={() => {
                const sidebar = document.getElementById(
                  "mobile-header-trigger",
                );
                if (sidebar) sidebar.click();
              }}
              variant="ghost"
              size="icon-lg"
              className="size-9 p-0 sm:size-auto sm:px-2.5 xl:hidden"
              type="button"
            >
              <PanelLeft className="cn-rtl-flip size-4.5 sm:size-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon-lg"
              className="flex size-9 items-center gap-1.5 p-0 sm:size-auto sm:px-2.5"
              type="button"
              onClick={router.back}
            >
              <ArrowLeft className="cn-rtl-flip size-4" />
              <span className="hidden md:inline">
                {tCommon("actions.back")}
              </span>
            </Button>

            {canAccessProFeatures &&
              isDisplayableDeploymentStatus(deploymentStatus) && (
                <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                  {/* Mobile: dot */}
                  <div className="flex items-center md:hidden">
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className={`size-2 rounded-full ${getDeploymentStatusClass(deploymentStatus)}`}
                      />
                      <TooltipContent className="text-xs">
                        {tEditorHeader(
                          getDeploymentStatusI18nKey(deploymentStatus),
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Desktop: badge */}
                  <span
                    className={`hidden rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap md:inline-flex ${getDeploymentStatusClass(deploymentStatus)}`}
                  >
                    {tEditorHeader(
                      getDeploymentStatusI18nKey(deploymentStatus),
                    )}
                  </span>
                </div>
              )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <PresenceAvatars users={activeUsers} />

            {config.repoName && config.branch && config.token && (
              <PreviewButton
                repository={repo}
                branch={config.branch}
                token={config.token}
                provider={config.provider}
                generator={config.framework}
                getUncommittedFile={getUncommittedFile}
                previewWindowRef={previewWindowRef}
                vercelToken={vercelToken}
                vercelTeamId={vercelTeamId}
                vercelProjectId={vercelProjectId}
                spProjectId={projectId}
              />
            )}

            {isCodeAiEnabled && (
              <Button
                variant="outline"
                size="icon-lg"
                type="button"
                onClick={() => {
                  if (isAiWidgetVisible) {
                    setIsAiWidgetOpen(false);
                  } else {
                    handleOpenAiWidget();
                  }
                }}
                className={cn(
                  "size-9 gap-1.5 p-0 sm:size-auto sm:h-9 sm:px-2.5",
                  isAiWidgetVisible &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">
                  {tEditor("code.ai.copilot_button")}
                </span>
              </Button>
            )}

            <Button
              variant="outline"
              size="icon-lg"
              className="size-9 gap-1.5 p-0 sm:size-auto sm:h-9 sm:px-2.5"
              type="button"
              onClick={handleDiscardWithConfirmation}
              disabled={!hasChanges || isSaving}
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">
                {tCommon("actions.reset")}
              </span>
            </Button>

            <Button
              size="default"
              className="h-9 px-2.5 text-xs font-medium sm:px-3 sm:text-sm"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!hasChanges}
            >
              <Save className="size-4" />
              {tEditor("code.commit")}
            </Button>
          </div>
        </header>

        {/* Row 2: breadcrumb */}
        <div className="bg-light border-border border-b px-4 py-2">
          <div className="flex items-center overflow-x-auto text-xs whitespace-nowrap sm:text-sm">
            {filePath.split("/").map((segment, index, array) => {
              const isLast = index === array.length - 1;
              const pathToSegment = array.slice(0, index + 1).join("/");
              return (
                <div key={index} className="flex items-center">
                  {index > 0 && (
                    <ChevronRight className="cn-rtl-flip h-3 w-3 min-w-3 opacity-40" />
                  )}
                  {isLast ? (
                    <span className="max-w-30 truncate px-1.5 font-semibold sm:max-w-none">
                      {segment}
                    </span>
                  ) : (
                    <Link
                      href={`/${orgId}/${projectId}/code/${normalizePath(pathToSegment)}`}
                      className={buttonVariants({
                        variant: "link",
                        className: "h-auto! px-1.5! py-0!",
                      })}
                    >
                      {segment}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="bg-background border-border relative min-h-0 flex-1 overflow-hidden border-b">
        {!isEditorReady && (
          <div className="absolute inset-0 flex gap-4 p-4">
            <div className="hidden w-10 flex-col space-y-3 pt-1 sm:flex">
              {Array.from({ length: 21 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full opacity-20" />
              ))}
            </div>
            <div className="flex-1 space-y-3 pt-1">
              {[
                70, 40, 60, 85, 30, 50, 75, 45, 90, 25, 65, 55, 80, 35, 70, 40,
                60, 85, 30, 50,
              ].map((width, i) => (
                <Skeleton
                  key={i}
                  className="h-4 rounded-sm"
                  style={{ width: `${width}%`, opacity: 0.1 + (i % 5) * 0.05 }}
                />
              ))}
            </div>
          </div>
        )}

        <div
          dir="ltr"
          className={cn(
            "h-full w-full text-left transition-opacity duration-300",
            isEditorReady ? "opacity-100" : "opacity-0",
          )}
        >
          {shikiReady &&
            resolvedTheme &&
            (aiGeneratedCode !== null && !isAiGenerating ? (
              <div className="flex h-full flex-col">
                {/* Diff & Review Mode Header */}
                <div className="bg-light/95 border-border/80 flex shrink-0 items-center justify-between border-b px-4 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground flex items-center gap-1.5 font-medium">
                      <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                      {tEditor("code.ai.review_title")}
                    </span>
                    <span className="text-muted-foreground hidden text-[11px] sm:inline">
                      {tEditor("code.ai.review_desc")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      type="button"
                      onClick={() => setDiffSideBySide((prev) => !prev)}
                      className="hidden h-6.5 cursor-pointer gap-1.5 px-2 text-[11px] sm:flex"
                    >
                      <Columns2 className="size-3" />
                      <span>
                        {diffSideBySide
                          ? tEditor("code.ai.diff_inline")
                          : tEditor("code.ai.diff_split")}
                      </span>
                    </Button>
                    {/* On small screens (< 2xl) where the sidebar is hidden, show inline accept/discard */}
                    {isCodeAiEnabled && !isAiWidgetVisible && (
                      <>
                        <Button
                          variant="ghost"
                          size="xs"
                          type="button"
                          onClick={() => setIsAiWidgetOpen(true)}
                          className="h-6.5 cursor-pointer gap-1.5 px-2 text-[11px] 2xl:hidden"
                        >
                          <Sparkles className="size-3" />
                          <span className="xs:inline hidden">
                            {tEditor("code.ai.copilot_button")}
                          </span>
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          type="button"
                          onClick={handleAiDiscard}
                          className="text-muted-foreground hover:text-foreground h-6.5 cursor-pointer gap-1.5 px-2 text-[11px] 2xl:hidden"
                        >
                          <RotateCcw className="size-3" />
                          <span>{tEditor("code.ai.discard")}</span>
                        </Button>
                        <Button
                          size="xs"
                          type="button"
                          onClick={handleAiAccept}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 h-6.5 cursor-pointer gap-1.5 px-2 text-[11px] font-medium 2xl:hidden"
                        >
                          <Check className="size-3" />
                          <span>{tEditor("code.ai.accept")}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Monaco Native Diff Editor */}
                <div className="min-h-0 flex-1">
                  <MonacoDiffEditor
                    key={`diff-${filePath}-${diffSideBySide ? "split" : "inline"}`}
                    original={preAiOriginalCode || value}
                    modified={value}
                    language={language}
                    theme={monacoTheme}
                    beforeMount={(monaco) =>
                      applyShikiToMonaco(monaco, monacoTheme)
                    }
                    options={{
                      renderSideBySide: diffSideBySide,
                      readOnly: false,
                      originalEditable: false,
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      lineHeight: 21,
                      diffWordWrap: "on",
                      wordWrap: "on",
                      lineNumbers: isMobile ? "off" : "on",
                      minimap: { enabled: !isMobile },
                      automaticLayout: true,
                      renderIndicators: true,
                      padding: { top: 16, bottom: 16 },
                      scrollbar: {
                        verticalScrollbarSize: isMobile ? 0 : 14,
                        horizontalScrollbarSize: isMobile ? 0 : 14,
                        useShadows: false,
                        vertical: isMobile ? "hidden" : "auto",
                        horizontal: isMobile ? "hidden" : "auto",
                      },
                    }}
                    onMount={(diffEditor) => {
                      diffEditorRef.current = diffEditor;
                      const modEditor = diffEditor.getModifiedEditor();
                      const modModel = modEditor.getModel();
                      if (modModel) {
                        modModel.onDidChangeContent(() => {
                          const updated = modModel.getValue();
                          setAiGeneratedCode(updated);
                          setValue(updated);
                        });
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              <MonacoEditor
                path={filePath}
                height="100%"
                width="100%"
                beforeMount={(monaco) =>
                  applyShikiToMonaco(monaco, monacoTheme)
                }
                onMount={handleEditorDidMount}
                options={{
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  insertSpaces: true,
                  accessibilitySupport: "off",
                  codeLens: true,
                  wordWrap: "on",
                  minimap: {
                    enabled: !isMobile,
                    scale: 1,
                    showSlider: "mouseover",
                    renderCharacters: true,
                    maxColumn: 120,
                  },
                  fontSize: 14,
                  lineHeight: 21,
                  formatOnPaste: true,
                  formatOnType: true,
                  fixedOverflowWidgets: true,
                  folding: !isMobile,
                  renderLineHighlight: "line",
                  scrollbar: {
                    verticalScrollbarSize: isMobile ? 0 : 14,
                    horizontalScrollbarSize: isMobile ? 0 : 14,
                    useShadows: false,
                    verticalHasArrows: false,
                    horizontalHasArrows: false,
                    alwaysConsumeMouseWheel: false,
                    vertical: isMobile ? "hidden" : "auto",
                    horizontal: isMobile ? "hidden" : "auto",
                  },
                  lineNumbers: isMobile ? "off" : "on",
                  rulers: [],
                  bracketPairColorization: { enabled: true },
                  renderWhitespace: "none",
                  smoothScrolling: true,
                  cursorBlinking: "blink",
                  cursorStyle: "line",
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  overviewRulerBorder: false,
                  hideCursorInOverviewRuler: true,
                  overviewRulerLanes: 0,
                  renderValidationDecorations: "off",
                  links: true,
                  occurrencesHighlight: "singleFile",
                  selectionHighlight: true,
                  find: {
                    addExtraSpaceOnTop: false,
                    autoFindInSelection: "multiline",
                    seedSearchStringFromSelection: "selection",
                  },
                }}
                language={language}
                value={value}
                onChange={(newValue) => {
                  if (newValue !== undefined) setValue(newValue);
                }}
                theme={monacoTheme}
                loading={null}
              />
            ))}
        </div>

        <CodeAiWidget
          isOpen={isAiWidgetVisible}
          onClose={() => {
            setIsAiWidgetOpen(false);
          }}
          hasSelection={Boolean(aiSelectedText)}
          selectedText={aiSelectedText}
          isGenerating={isAiGenerating}
          generatedCode={aiGeneratedCode}
          onGenerate={handleAiGenerate}
          onAccept={handleAiAccept}
          onDiscard={handleAiDiscard}
          initialPrompt={aiInitialPrompt}
          filePath={filePath}
          language={language}
          totalLines={value ? value.split("\n").length : 1}
          onExplain={() => handleExplainCode()}
          explanation={explanationText}
          isExplaining={isExplaining}
          onClearExplanation={() => {
            setExplanationText("");
            setIsExplaining(false);
          }}
        />

        {/* Status bar */}
        <div className="border-border bg-light shrink-0 border-t px-4 py-2">
          <div className="text-text-default flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span>{tEditor("code.encoding")}</span>
              <span>
                {language.charAt(0).toUpperCase() + language.slice(1)}
              </span>
              <span>
                {tEditor("code.line", {
                  line: value
                    .substr(0, value.indexOf(value.split("\n")[0]))
                    .split("\n").length,
                })}
                , {tEditor("code.column", { column: 1 })}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>
                {tEditor("code.lines_count", {
                  count: value.split("\n").length,
                })}
              </span>
              <span>
                {tEditor("code.characters_count", { count: value.length })}
              </span>
              {hasChanges && (
                <span className="text-destructive">
                  {tEditor("code.unsaved")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <CommitModal
        isOpen={showCommitModal}
        onClose={() => {
          setShowCommitModal(false);
          setAutoGenerateCommitAi(false);
        }}
        onCommit={handleCommitConfirm}
        isLoading={isSaving}
        filePath={filePath}
        getUncommittedContent={() => ({ path: filePath, content: value })}
        getBaselineContent={() => ({ path: filePath, content: savedContent })}
        autoGenerateAi={autoGenerateCommitAi}
      />

      <AiUpgrade />
    </div>
  );
}
