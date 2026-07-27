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
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePresence } from "@/hooks/use-presence";
import { useSandboxPreview } from "@/hooks/use-sandbox-preview";
import { useVercelIntegration } from "@/hooks/use-vercel-integration";
import { cn } from "@/lib/utils/cn";
import { configureMonacoLoader } from "@/lib/utils/monaco";
import { normalizePath } from "@/lib/utils/normalize-path";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { applyShikiToMonaco, preloadShiki } from "@/lib/utils/shiki";
import { selectConfig } from "@/redux/features/config/slice";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import {
  ArrowLeft,
  ChevronRight,
  RotateCcw,
  Save,
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
import { toast } from "sonner";
import PresenceAvatars from "../../../_components/presence-avatars";
import PreventNavigation from "../../../_components/prevent-navigation";
import PreviewButton from "../../../_components/preview-button";
import CodeSkeleton from "./code-skeleton";
import { getFileIcon, getLanguageFromExtension } from "./file-icons";

// Configure Monaco AMD loader to a compatible CDN version
configureMonacoLoader();

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: CodeSkeleton,
});

interface CodeEditorProps {
  filePath: string;
  content: string;
  orgId: string;
  projectId: string;
}

export default function CodeEditor({
  filePath,
  content,
  orgId,
  projectId,
}: CodeEditorProps) {
  const tCommon = useTranslations("common");
  const tEditor = useTranslations("editor");
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

  const [value, setValue] = useState(content);
  const [originalContent] = useState(content);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [shikiReady, setShikiReady] = useState(false);

  useEffect(() => {
    preloadShiki().then(() => setShikiReady(true));
  }, []);

  const monacoEditorRef = useRef<any>(null);
  const monacoModuleRef = useRef<any>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const debouncedValue = useDebounce(value, 300);

  const language = getLanguageFromExtension(filePath);
  const fileName = path.basename(filePath);
  const fileIcon = getFileIcon(filePath);
  const { activeUsers } = usePresence(orgId, projectId, filePath);

  const { resolvedTheme } = useTheme();
  // Derive monacoTheme only when resolvedTheme is known. While undefined
  // (server render + first hydration pass), Monaco is not rendered at all so
  // the skeleton fills the gap — no light-flash on dark-mode hard reload.
  const monacoTheme = resolvedTheme === "dark" ? "dark-plus" : "light-plus";

  useEffect(() => {
    setHasChanges(debouncedValue !== originalContent);
  }, [debouncedValue, originalContent]);

  useEffect(() => {
    setValue(content);
  }, [content]);

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

  const handleSave = async () => {
    if (!hasChanges) {
      toast(tEditor("code.no_changes_save"));
      return;
    }

    try {
      if (isGitLabProvider(config.provider)) {
        await updateGlFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          files: [{ path: filePath, content: value }],
          message: tEditor("code.update_message", { fileName }),
        }).unwrap();
      } else {
        await updateGhFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          files: [{ path: filePath, content: value }],
          message: tEditor("code.update_message", { fileName }),
        }).unwrap();
      }

      setHasChanges(false);
      toast.success(tEditor("code.update_success", { fileName }));
      triggerCommitSync();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(tEditor("code.save_error"));
    }
  };

  const handleReset = () => {
    setValue(originalContent);
    setHasChanges(false);
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

  function handleEditorDidMount(monacoEditor: any, monaco: any) {
    monacoEditorRef.current = monacoEditor;
    monacoModuleRef.current = monaco;

    setTimeout(() => setIsEditorReady(true), 100);

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      handleDiscardWithConfirmation();
    });

    const resizeObserver = new ResizeObserver(() => monacoEditor.layout());
    const container = monacoEditor.getContainerDomNode();
    if (container) resizeObserver.observe(container);
  }

  const repo = config.repoName?.includes("/")
    ? config.repoName
    : `${config.owner}/${config.repoName}`;

  return (
    <div className="flex h-full max-h-screen flex-col">
      <PreventNavigation isDirty={hasChanges} resetData={handleReset} />

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <TriangleAlert className="text-destructive mr-2" />
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
      <div className="bg-background sticky top-0 z-50 shrink-0">
        {/* Row 1: actions — matches content editor header style */}
        <header className="border-border bg-light flex items-center justify-between border-b px-4 py-4 lg:px-6">
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

            <div className="flex items-center space-x-2">
              {fileIcon}
              <h1 className="text-text-dark max-w-55 truncate text-base font-bold sm:max-w-none sm:text-lg">
                {fileName}
              </h1>
              {hasChanges && (
                <span className="text-muted-foreground text-xs sm:text-sm">
                  {tEditor("code.edited")}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
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

            <Button
              variant="outline"
              className="bg-transparent"
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
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!hasChanges}
            >
              <Save className="size-4" />
              <span className="hidden sm:inline">{tEditor("code.commit")}</span>
            </Button>
          </div>
        </header>

        {/* Row 2: breadcrumb */}
        <div className="bg-light border-border border-b px-4 py-2">
          <div className="flex flex-wrap items-center overflow-x-auto text-xs whitespace-nowrap sm:text-sm">
            {filePath.split("/").map((segment, index, array) => {
              const isLast = index === array.length - 1;
              const pathToSegment = array.slice(0, index + 1).join("/");
              return (
                <div key={index} className="flex items-center">
                  {index > 0 && <ChevronRight className="h-3 w-3 min-w-3" />}
                  {isLast ? (
                    <span className="max-w-30 truncate font-semibold sm:max-w-none">
                      {segment}
                    </span>
                  ) : (
                    <Link
                      href={`/${orgId}/${projectId}/code/${normalizePath(pathToSegment)}`}
                      className={buttonVariants({
                        variant: "link",
                        className: "h-auto! px-1! py-1!",
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
          <div className="absolute inset-0 flex space-x-4 p-4">
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

        {/* Gate on shikiReady + resolvedTheme: Monaco initializes once Shiki
            is pre-loaded so applyShikiToMonaco runs synchronously in
            beforeMount — no light-flash while the async highlighter loads. */}
        <div
          className={cn(
            "h-full w-full transition-opacity duration-300",
            isEditorReady ? "opacity-100" : "opacity-0",
          )}
        >
          {shikiReady && resolvedTheme && (
            <MonacoEditor
              path={filePath}
              height="100%"
              width="100%"
              beforeMount={(monaco) => applyShikiToMonaco(monaco, monacoTheme)}
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
          )}
        </div>

        {/* Status bar */}
        <div className="border-border bg-light shrink-0 border-t px-4 py-2">
          <div className="text-text flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
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
            <div className="flex items-center space-x-4">
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
    </div>
  );
}
