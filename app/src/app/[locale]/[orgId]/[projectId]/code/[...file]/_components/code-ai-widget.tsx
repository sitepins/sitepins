"use client";

import { AiMarkdown } from "@/components/ai-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { getDirection } from "@/lib/i18n/direction";
import { cn } from "@/lib/utils/cn";
import {
  BookOpen,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Eye,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import path from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CodeAiWidgetProps = {
  isOpen: boolean;
  onClose: () => void;
  hasSelection: boolean;
  selectedText?: string;
  isGenerating: boolean;
  generatedCode: string | null;
  onGenerate: (instruction: string, scope?: "selection" | "file") => void;
  onAccept: () => void;
  onDiscard: () => void;
  initialPrompt?: string;
  filePath?: string;
  language?: string;
  totalLines?: number;
  onExplain?: () => void;
  explanation?: string;
  isExplaining?: boolean;
  onClearExplanation?: () => void;
};

export function CodeAiWidget({
  isOpen,
  onClose,
  hasSelection,
  selectedText = "",
  isGenerating,
  generatedCode,
  onGenerate,
  onAccept,
  onDiscard,
  initialPrompt = "",
  filePath = "",
  language = "plaintext",
  totalLines = 1,
  onExplain,
  explanation = "",
  isExplaining = false,
  onClearExplanation,
}: CodeAiWidgetProps) {
  const tEditor = useTranslations("editor");
  const locale = useLocale();
  const isRtl = getDirection(locale) === "rtl";
  const hydrated = useHydrated();
  const portalContainer = hydrated ? document.body : null;

  const [prompt, setPrompt] = useState(initialPrompt);
  const [prevInitialPrompt, setPrevInitialPrompt] = useState(initialPrompt);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevHasSelection, setPrevHasSelection] = useState(hasSelection);
  const [scope, setScope] = useState<"selection" | "file">(
    hasSelection ? "selection" : "file",
  );
  const [copied, setCopied] = useState(false);
  const [copiedExplanation, setCopiedExplanation] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prevIsGenerating, setPrevIsGenerating] = useState(isGenerating);
  if (prevIsGenerating !== isGenerating) {
    setPrevIsGenerating(isGenerating);
    if (!isGenerating && generatedCode !== null) {
      setPrompt("");
    }
  }

  // Sync initialPrompt changes
  if (initialPrompt !== prevInitialPrompt) {
    setPrevInitialPrompt(initialPrompt);
    setPrompt(initialPrompt);
  }

  // Update scope when open or selection changes during render
  if (isOpen !== prevIsOpen || hasSelection !== prevHasSelection) {
    setPrevIsOpen(isOpen);
    setPrevHasSelection(hasSelection);
    setScope(hasSelection ? "selection" : "file");
  }

  // Focus textarea when panel opens without generated code
  useEffect(() => {
    if (isOpen && generatedCode === null && !isGenerating && !isExplaining) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, generatedCode, isGenerating, isExplaining]);

  // Wire keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Review mode: Cmd+Enter to accept, Esc to discard
      if (generatedCode !== null) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          setPrompt("");
          onAccept();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setPrompt("");
          onDiscard();
        }
      } else {
        // Input mode: Esc to dismiss explanation or close panel
        if (e.key === "Escape") {
          e.preventDefault();
          if (explanation && onClearExplanation) {
            onClearExplanation();
          } else {
            onClose();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    generatedCode,
    onAccept,
    onDiscard,
    onClose,
    explanation,
    onClearExplanation,
  ]);

  const handleSubmit = (instructionText?: string) => {
    const text = (instructionText ?? prompt).trim();
    if (!text || isGenerating || isExplaining) return;
    setPrompt("");
    onGenerate(text, scope);
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignore
    }
  };

  const handleCopyExplanation = async () => {
    if (!explanation) return;
    try {
      await navigator.clipboard.writeText(explanation);
      setCopiedExplanation(true);
      setTimeout(() => setCopiedExplanation(false), 2000);
    } catch {
      // Fallback ignore
    }
  };

  const displayFileName = useMemo(
    () => (filePath ? path.basename(filePath) : "Code Editor"),
    [filePath],
  );

  const selectedLinesCount = useMemo(() => {
    if (!selectedText) return 0;
    return selectedText.split("\n").length;
  }, [selectedText]);

  const generatedLines = useMemo(() => {
    if (!generatedCode) return [];
    return generatedCode.split("\n");
  }, [generatedCode]);

  const quickPrompts = [
    {
      label: tEditor("code.ai.quick_explain"),
      text: "Explain what this code does, its architecture, and key functions step-by-step",
      icon: BookOpen,
      action: onExplain,
    },
    {
      label: tEditor("code.ai.quick_fix"),
      text: "Find and fix any syntax errors, type issues, unclosed tags, or runtime bugs in this code",
      icon: Bug,
    },
    {
      label: tEditor("code.ai.quick_comments"),
      text: "Add clear, comprehensive documentation comments and JSDoc explaining this code",
      icon: Code2,
    },
    {
      label: tEditor("code.ai.quick_refactor"),
      text: "Refactor and optimize this code for readability, clean architecture, and performance",
      icon: Wand2,
    },
  ];

  if (!portalContainer) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop on screens < 2xl (matching responsive drawer pattern) */}
          <motion.button
            key="ai-copilot-backdrop"
            type="button"
            aria-label={tEditor("seo.close_overlay")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="bg-background/10 fixed inset-0 z-60 cursor-pointer xl:inset-s-70 2xl:hidden"
          />

          {/* Right Slide-in Side Panel */}
          <motion.div
            key="ai-copilot-sidebar"
            initial={{ x: isRtl ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: isRtl ? "-100%" : "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="bg-light border-border fixed inset-e-0 top-0 z-70 flex h-svh w-full max-w-105 flex-col border-s shadow-lg 2xl:z-30 2xl:shadow-none"
          >
            {/* Header - flush at top-0 matching editor header height */}
            <div className="border-border flex h-[69px] shrink-0 items-center justify-between border-b px-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-foreground truncate text-sm leading-none font-semibold">
                      {tEditor("code.ai.inline_title")}
                    </h2>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-[11px]">
                    {displayFileName} • {language}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground size-7 cursor-pointer rounded-md"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Scope Toggle & Context info */}
            <div className="border-border bg-muted/30 shrink-0 border-b px-4 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Target Scope:
                </span>
                {hasSelection ? (
                  <div className="bg-background border-border inline-flex rounded-md border p-0.5">
                    <button
                      type="button"
                      onClick={() => setScope("selection")}
                      className={cn(
                        "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                        scope === "selection"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tEditor("code.ai.target_selection")} (
                      {tEditor("code.lines_count", {
                        count: selectedLinesCount,
                      })}
                      )
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("file")}
                      className={cn(
                        "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                        scope === "file"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tEditor("code.ai.target_file")} (
                      {tEditor("code.lines_count", { count: totalLines })})
                    </button>
                  </div>
                ) : (
                  <span className="text-foreground text-[11px] font-medium">
                    {tEditor("code.ai.target_file")} (
                    {tEditor("code.lines_count", { count: totalLines })})
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* Generating Animation Banner */}
              {isGenerating && (
                <div className="border-primary/20 bg-primary/5 space-y-2 rounded-xl border p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="text-primary size-4 animate-spin" />
                    <span className="text-foreground text-xs font-semibold">
                      Generating directly in editor
                    </span>
                  </div>
                  {generatedCode && (
                    <p className="text-muted-foreground text-[11px]">
                      Streaming {generatedLines.length}{" "}
                      {tEditor("code.lines_count", {
                        count: generatedLines.length,
                      })}{" "}
                      into {displayFileName}...
                    </p>
                  )}
                </div>
              )}

              {/* Review Mode: Raw Snippet */}
              {generatedCode !== null && (
                <div className="border-border bg-muted/20 rounded-lg border">
                  <div className="flex w-full items-center justify-between px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setShowRawOutput((prev) => !prev)}
                      className="text-muted-foreground hover:text-foreground flex flex-1 cursor-pointer items-center gap-1.5 py-1 text-[11px] font-medium transition-colors"
                    >
                      <Eye className="size-3.5" />
                      <span>View raw output snippet</span>
                      {showRawOutput ? (
                        <ChevronUp className="ms-1 size-3.5" />
                      ) : (
                        <ChevronDown className="ms-1 size-3.5" />
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        className="text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-[10px]"
                      >
                        {copied ? (
                          <>
                            <Check className="text-primary size-3" />
                            <span>{tEditor("code.ai.copied")}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>{tEditor("code.ai.copy")}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {showRawOutput && (
                    <div className="border-border max-h-56 overflow-y-auto border-t p-3 font-mono text-[11px] leading-relaxed">
                      <pre className="whitespace-pre-wrap">{generatedCode}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* Code Explanation Section */}
              {(isExplaining || Boolean(explanation)) && (
                <div className="border-border bg-card/70 space-y-3 rounded-xl border p-3.5 shadow-2xs">
                  <div className="border-border/60 flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="text-primary size-4" />
                      <h3 className="text-foreground text-xs font-semibold">
                        {tEditor("code.ai.explain_title")}
                      </h3>
                      {isExplaining && (
                        <Loader2 className="text-primary size-3 animate-spin" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {explanation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyExplanation}
                          className="text-muted-foreground hover:text-foreground h-6 cursor-pointer gap-1 px-2 text-[10px]"
                          title={tEditor("code.ai.copy")}
                        >
                          {copiedExplanation ? (
                            <>
                              <Check className="text-primary size-3" />
                              <span>{tEditor("code.ai.copied")}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>{tEditor("code.ai.copy")}</span>
                            </>
                          )}
                        </Button>
                      )}
                      {onClearExplanation && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={onClearExplanation}
                          className="text-muted-foreground hover:text-foreground size-6 cursor-pointer rounded-md"
                          title="Close explanation"
                        >
                          <X className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExplaining && !explanation && (
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2.5 py-8 text-center">
                      <Loader2 className="text-primary size-5 animate-spin" />
                      <p className="text-xs">
                        {tEditor("code.ai.explain_loading")}
                      </p>
                    </div>
                  )}

                  {explanation && (
                    <div className="space-y-3">
                      <div className="overflow-x-auto text-xs leading-relaxed">
                        <AiMarkdown content={explanation} />
                      </div>
                      {isExplaining && (
                        <div className="text-muted-foreground flex items-center gap-2 pt-1 text-xs">
                          <Loader2 className="text-primary size-3.5 animate-spin" />
                          <span>{tEditor("code.ai.generating")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Action Prompts */}
              <div className="space-y-2">
                <p className="text-muted-foreground text-[11px] font-medium">
                  Quick Actions:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {quickPrompts.map((chip, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={isGenerating || isExplaining}
                      onClick={() => {
                        if (chip.action) {
                          chip.action();
                        } else {
                          handleSubmit(chip.text);
                        }
                      }}
                      className="border-border text-foreground hover:border-primary/40 hover:bg-primary/5 bg-background flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <chip.icon className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="truncate">{chip.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Docked Area */}
            <div className="border-border bg-light shrink-0 border-t p-3">
              {generatedCode !== null ? (
                /* Review Controls: Sleek header bar above Refine Textarea */
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
                      <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                      <span>
                        {tEditor("code.ai.review_title", {
                          defaultValue: "Review changes",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setPrompt("");
                          onDiscard();
                        }}
                        className="text-muted-foreground hover:text-foreground h-7 cursor-pointer gap-1 px-2.5 text-xs"
                      >
                        <RotateCcw className="size-3" />
                        <span>{tEditor("code.ai.discard")}</span>
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => {
                          setPrompt("");
                          onAccept();
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 cursor-pointer gap-1 px-3 text-xs font-medium shadow-2xs"
                      >
                        <Check className="size-3" />
                        <span>{tEditor("code.ai.accept")}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="border-border/50 space-y-1.5 border-t pt-2">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={tEditor("code.ai.inline_placeholder")}
                      disabled={isGenerating || isExplaining}
                      rows={2}
                      className="border-border bg-background resize-none text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                    />

                    <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                      <span>⌘+↵ to refine</span>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={
                          !prompt.trim() || isGenerating || isExplaining
                        }
                        className="h-7 cursor-pointer px-3 text-xs font-medium"
                      >
                        {isGenerating || isExplaining ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>{tEditor("code.ai.generating")}</span>
                          </>
                        ) : (
                          "Update"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Input Mode: Clean Bottom Prompt Box */
                <div className="space-y-2">
                  <Textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={tEditor("code.ai.inline_placeholder")}
                    disabled={isGenerating || isExplaining}
                    rows={3}
                    className="border-border bg-background resize-none text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />

                  <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                    <span>⌘+↵ to run</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSubmit()}
                      disabled={!prompt.trim() || isGenerating || isExplaining}
                      className="h-7 gap-1.5 px-3 text-xs font-medium"
                    >
                      {isGenerating || isExplaining ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>{tEditor("code.ai.generating")}</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="size-3.5" />
                          <span>{tEditor("code.ai.run")}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    portalContainer,
  );
}
