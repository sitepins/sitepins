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
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { usePresence } from "@/hooks/use-presence";
import { useVercelIntegration } from "@/hooks/use-vercel-integration";
import { UpgradeDialog } from "@/layouts/components/upgrade-dialog";
import {
  getDeploymentStatusClass,
  getDeploymentStatusI18nKey,
  isDisplayableDeploymentStatus,
} from "@/lib/utils/deployment-status";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubCommitStatusQuery } from "@/redux/features/github";
import { useGetGitLabCommitStatusQuery } from "@/redux/features/gitlab";
import { useAppSelector } from "@/redux/store";
import {
  ArrowLeft,
  ChevronDown,
  Menu,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { RefObject, useEffect, useRef, useState } from "react";
import ConfigActions from "./config-actions";
import PresenceAvatars from "./presence-avatars";
import PreviewButton from "./preview-button";

export default function EditorHeader({
  shouldShowEditor,
  isDraft,
  isLoadedFromDbDraft,
  resetValue,
  hasChanges,
  pending,
  handleSubmit,
  handleSaveAsDraft,
  handlePushAsDraft,
  handleDiscardSavedDraft,
  hasSavedDraft,
  isDiscardingSavedDraft,
  isSavingDraft,
  children,
  showDraftButton = true,
  filePath,
  getUncommittedFile,
  previewWindowRef,
}: {
  shouldShowEditor: boolean;
  isDraft: boolean;
  isLoadedFromDbDraft?: boolean;
  resetValue: () => void;
  hasChanges: boolean;
  pending: boolean;
  handleSubmit: (isDraft?: boolean) => void;
  /** Saves content to the database (no Git push). */
  handleSaveAsDraft: () => void;
  /** Commits to Git with draft flag (was old "Save as Draft"). */
  handlePushAsDraft: () => void;
  /** Deletes saved DB draft for this file. */
  handleDiscardSavedDraft: () => void;
  /** Whether a saved DB draft exists for this file. */
  hasSavedDraft?: boolean;
  /** Loading state for deleting saved DB draft. */
  isDiscardingSavedDraft?: boolean;
  /** Loading state from the DB-only save — independent of `pending`. */
  isSavingDraft?: boolean;
  children: React.ReactNode;
  showDraftButton?: boolean;
  filePath: string;
  getUncommittedFile?: () => { path: string; content: string };
  previewWindowRef?: RefObject<Window | null>;
}) {
  const router = useRouter();
  const params = useParams() as { orgId: string; projectId: string };
  const config = useAppSelector(selectConfig);
  const tEditorHeader = useTranslations("editor.header");
  const tCommon = useTranslations("common");
  const { canAccessProFeatures } = useOwnerPlan();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const isDbDraftLoaded = Boolean(isLoadedFromDbDraft && hasSavedDraft);
  const canUseDraftSave = canAccessProFeatures;
  const [actionType, setActionType] = useState<"save" | "draft" | "publish">(
    isDbDraftLoaded && canUseDraftSave ? "save" : isDraft ? "draft" : "publish",
  );

  useEffect(() => {
    if (isDbDraftLoaded && canUseDraftSave) {
      setActionType("save");
      return;
    }

    setActionType(isDraft ? "draft" : "publish");
  }, [isDraft, isDbDraftLoaded, canUseDraftSave]);
  const { activeUsers } = usePresence(params.orgId, params.projectId, filePath);
  const { vercelToken, vercelTeamId, vercelProjectId } = useVercelIntegration(
    params.orgId,
  );

  const [ghStatusState, setGhStatusState] = useState<string | undefined>(
    undefined,
  );
  const [glStatusState, setGlStatusState] = useState<string | undefined>(
    undefined,
  );
  const isGitHub = isGitHubProvider(config.provider);
  const isGitLab = isGitLabProvider(config.provider);
  const ghPollingInterval = useDeploymentStatusPollingInterval(ghStatusState);
  const glPollingInterval = useDeploymentStatusPollingInterval(glStatusState);

  const { data: ghStatus, refetch: refetchGhStatus } =
    useGetGitHubCommitStatusQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        ref: config.branch,
      },
      {
        skip:
          !config.owner ||
          !config.repoName ||
          !config.branch ||
          !isGitHub ||
          !canAccessProFeatures,
        pollingInterval: ghPollingInterval,
      },
    );
  const ghStatusStateFromData =
    typeof ghStatus === "object" && ghStatus !== null
      ? (ghStatus as any).state
      : ghStatus;

  const { data: glStatus, refetch: refetchGlStatus } =
    useGetGitLabCommitStatusQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        ref: config.branch,
      },
      {
        skip:
          !config.owner ||
          !config.repoName ||
          !config.branch ||
          !isGitLab ||
          !canAccessProFeatures,
        pollingInterval: glPollingInterval,
      },
    );
  const glStatusStateFromData =
    typeof glStatus === "object" && glStatus !== null
      ? (glStatus as any).state
      : glStatus;

  // When a commit push completes (pending: true → false), force-refetch the
  // status query to bypass the RTK Query cache and pick up the new deployment.
  // Without this, the cached terminal status would immediately re-populate state
  // and stop polling before the new pending/running status is ever seen.
  const prevPendingRef = useRef(pending);
  useEffect(() => {
    if (prevPendingRef.current && !pending) {
      setGhStatusState(undefined);
      setGlStatusState(undefined);
      if (isGitHub && canAccessProFeatures) refetchGhStatus();
      if (isGitLab && canAccessProFeatures) refetchGlStatus();
    }
    prevPendingRef.current = pending;
  }, [
    pending,
    isGitHub,
    isGitLab,
    canAccessProFeatures,
    refetchGhStatus,
    refetchGlStatus,
  ]);

  useEffect(() => {
    setGhStatusState(ghStatusStateFromData);
  }, [ghStatusStateFromData]);
  useEffect(() => {
    setGlStatusState(glStatusStateFromData);
  }, [glStatusStateFromData]);

  const deploymentStatus = isGitLab
    ? glStatusStateFromData
    : ghStatusStateFromData;

  useEffect(() => {
    const classNames = [
      "px-0!",
      "py-0!",
      ...(shouldShowEditor ? ["max-h-svh"] : []),
    ];

    if (typeof window !== "undefined") {
      document.querySelector("#main")?.classList.add(...classNames);
    }
    return () => {
      document.querySelector("#main")?.classList.remove(...classNames);
    };
  }, [shouldShowEditor]);

  const handleOpenSidebar = () => {
    const sidebar = document.getElementById("mobile-header-trigger");

    if (sidebar) {
      sidebar.click();
    }
  };

  const handleResetWithConfirmation = () => {
    if (!hasChanges) {
      return;
    }
    setShowResetDialog(true);
  };

  const pathname = usePathname();
  const isConfigsPath = Boolean(pathname && pathname.includes("/configs/"));

  const confirmReset = () => {
    resetValue();
    setShowResetDialog(false);
  };

  const isSaveDisabled = !hasChanges || isSavingDraft || pending;
  const isDraftDisabled = pending || (isDraft && !hasChanges);
  const isPublishDisabled = pending || (!isDraft && !hasChanges);

  const isMainButtonDisabled =
    actionType === "save"
      ? isSaveDisabled
      : actionType === "draft"
        ? isDraftDisabled
        : isPublishDisabled;

  const effectiveActionType: "save" | "draft" | "publish" =
    (!isDbDraftLoaded || !canUseDraftSave) && actionType === "save"
      ? isDraft
        ? "draft"
        : "publish"
      : actionType;

  const handleSaveAsDraftClick = () => {
    if (!canUseDraftSave) {
      setShowUpgradeDialog(true);
      return;
    }
    handleSaveAsDraft();
  };

  const isMainButtonDisabledEffective =
    effectiveActionType === "save"
      ? isSaveDisabled
      : effectiveActionType === "draft"
        ? isDraftDisabled
        : isPublishDisabled;

  const isShowingSavedState =
    effectiveActionType === "save" && !hasChanges && !isSavingDraft;

  return (
    <>
      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
      />

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <TriangleAlert className="text-destructive mr-2" />
              {tEditorHeader("reset_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tEditorHeader("reset_dialog_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmReset}>
              {tCommon("actions.reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate handled by DuplicateConfig component */}

      <header className="border-border bg-light sticky top-0 left-0 z-50 flex items-center justify-between border-b px-4 py-4 lg:px-6">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center md:space-x-4">
            <Button
              onClick={handleOpenSidebar}
              variant="ghost"
              size="sm"
              className="xl:hidden"
              type="button"
            >
              <Menu className="size-5" />
            </Button>

            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center md:space-x-2"
                type="button"
                onClick={router.back}
              >
                <ArrowLeft className="size-4" />
                <span className="hidden md:inline">
                  {tCommon("actions.back")}
                </span>
              </Button>

              {canAccessProFeatures &&
                isDisplayableDeploymentStatus(deploymentStatus) && (
                  <div className="flex min-w-0 items-center space-x-1 sm:space-x-2">
                    {/* Mobile: Just colored dot */}
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

                    {/* Desktop: Full status badge */}
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
          </div>

          <div className="flex items-center space-x-3">
            <PresenceAvatars users={activeUsers} />
            {config.repoName && config.branch && config.token && (
              <PreviewButton
                repository={
                  config.repoName.includes("/")
                    ? config.repoName
                    : `${config.owner}/${config.repoName}`
                }
                branch={config.branch}
                token={config.token}
                provider={config.provider}
                generator={config.framework}
                getUncommittedFile={getUncommittedFile}
                previewWindowRef={previewWindowRef}
                vercelToken={vercelToken}
                vercelTeamId={vercelTeamId}
                vercelProjectId={vercelProjectId}
                spProjectId={params.projectId}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-transparent"
                  type="button"
                  onClick={handleResetWithConfirmation}
                  disabled={!hasChanges || pending}
                >
                  <RotateCcw className="size-4" />
                  <span className="hidden sm:inline">
                    {tCommon("actions.reset")}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tEditorHeader("reset_tooltip")}</TooltipContent>
            </Tooltip>
            {/* Combined Publish/Draft button with dropdown */}
            {showDraftButton ? (
              <ButtonGroup>
                <Button
                  size="lg"
                  type="button"
                  onClick={
                    effectiveActionType === "save"
                      ? handleSaveAsDraftClick
                      : effectiveActionType === "draft"
                        ? handlePushAsDraft
                        : () => handleSubmit()
                  }
                  isLoading={
                    effectiveActionType === "save" ? isSavingDraft : pending
                  }
                  disabled={isMainButtonDisabledEffective}
                >
                  {effectiveActionType === "save"
                    ? isShowingSavedState
                      ? tCommon("status.saved")
                      : tEditorHeader("save_btn")
                    : effectiveActionType === "draft"
                      ? tEditorHeader("draft_btn")
                      : tEditorHeader("publish_btn")}
                </Button>

                <ButtonGroupSeparator orientation="vertical" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label="More" size="lg">
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="[--radius:1rem]">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isDraftDisabled}
                      onSelect={() => {
                        setActionType("draft");
                        setTimeout(() => handlePushAsDraft(), 0);
                      }}
                    >
                      {tEditorHeader("push_as_draft_button")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isPublishDisabled}
                      onSelect={() => {
                        setActionType("publish");
                        setTimeout(() => handleSubmit(), 0);
                      }}
                    >
                      {tEditorHeader("publish_now_btn")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isSaveDisabled}
                      onSelect={() => {
                        if (isDbDraftLoaded && canUseDraftSave) {
                          setActionType("save");
                        }
                        setTimeout(() => handleSaveAsDraftClick(), 0);
                      }}
                    >
                      {tEditorHeader("save_as_draft_btn")}
                    </DropdownMenuItem>

                    {hasSavedDraft && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
                        disabled={
                          pending || isSavingDraft || isDiscardingSavedDraft
                        }
                        onSelect={() => {
                          setTimeout(() => handleDiscardSavedDraft(), 0);
                        }}
                      >
                        {tEditorHeader("discard_saved_btn")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            ) : (
              <Button
                isLoading={pending && !isDraft}
                disabled={!hasChanges || pending}
                size="lg"
                type="button"
                onClick={() => handleSubmit()}
              >
                {tCommon("actions.save")}
              </Button>
            )}
            {children}
            {isConfigsPath && (
              <ConfigActions
                pathname={pathname}
                config={config}
                pending={pending}
              />
            )}
          </div>
        </div>
      </header>
    </>
  );
}
