"use client";

import { AiUpgrade } from "@/components/ai-upgrade";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useAiAccess } from "@/hooks/use-ai-access";
import { useDebounce } from "@/hooks/use-debounce";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { getDirection } from "@/lib/i18n/direction";
import {
  isWrappedValue,
  parseArrayItems,
  stringValue,
} from "@/lib/utils/frontmatter-value";
import {
  CATEGORY_KEYS,
  getSeoScore,
  KEYWORD_KEYS,
  META_DESC_KEYS,
  META_TITLE_KEYS,
  validateSEO,
  validateSeoInsights,
} from "@/lib/utils/seo-validate";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { TField, TState } from "@/types";
import { ChartSpline, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import ContentAnalysis from "./content-analysis";
import FrontmatterRenderer from "./frontmatter-renderer";
import LinkAnalysis from "./link-analysis";
import SearchPreview from "./search-preview";
import SeoAnalysis from "./seo-analysis";

function applyFieldUpdate(
  currentData: Record<string, unknown>,
  fieldName: string,
  newValue: unknown,
  schema?: TField[],
): Record<string, unknown> {
  const existing = currentData[fieldName];
  const fieldDef = schema?.find(
    (f) =>
      f.name === fieldName || f.name.toLowerCase() === fieldName.toLowerCase(),
  );
  const isArrayType =
    fieldDef?.type === "Array" ||
    fieldDef?.type === "gallery" ||
    Array.isArray(existing) ||
    (isWrappedValue(existing) && Array.isArray(existing.value)) ||
    KEYWORD_KEYS.some((k) => k.toLowerCase() === fieldName.toLowerCase()) ||
    CATEGORY_KEYS.some((k) => k.toLowerCase() === fieldName.toLowerCase()) ||
    ["tags", "tag", "categories", "category", "keywords", "keyword"].includes(
      fieldName.toLowerCase(),
    );

  let formattedValue = newValue;

  if (isArrayType) {
    const items = parseArrayItems(newValue);
    if (
      fieldDef?.type === "string" &&
      !Array.isArray(existing) &&
      typeof existing === "string"
    ) {
      formattedValue = items.join(", ");
    } else {
      formattedValue = items.map((item) => ({
        value: item,
        id: crypto.randomUUID(),
      }));
    }
  } else if (Array.isArray(newValue)) {
    formattedValue = newValue.map((item) => {
      if (isWrappedValue(item)) return item;
      return { value: item, id: crypto.randomUUID() };
    });
  }

  if (isWrappedValue(existing)) {
    return {
      ...currentData,
      [fieldName]: {
        ...existing,
        value: formattedValue,
      },
    };
  }
  return {
    ...currentData,
    [fieldName]: formattedValue,
  };
}

export default function SeoSetting({
  schema,
  data,
  setState,
  content,
  onSlugChange,
  onUpdateContent,
  resetKey,
  isSidebarOpen,
  onSidebarOpenChange,
}: {
  schema: TField[];
  data: TState["data"];
  setState: Dispatch<SetStateAction<TState | undefined>>;
  content: string;
  onSlugChange?: (newSlug: string) => void;
  onUpdateContent?: (content: string) => void;
  resetKey?: number;
  isSidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
}) {
  const tEditorSeo = useTranslations("editor.seo");
  const locale = useLocale();
  const isRtl = getDirection(locale) === "rtl";
  const {
    projectId,
    orgId,
    file: fileParams,
  } = useParams() as {
    projectId: string;
    orgId: string;
    file: string[];
  };

  const { data: site } = useGetProjectQuery({
    projectId: projectId,
    orgId: orgId.slice(4),
  });

  const filename =
    fileParams?.[fileParams.length - 1]?.replace(/\.mdx?$/, "") || "";

  const baseUrl = site?.site_url ?? "";

  const [showUpgradeOrg, setShowUpgradeOrg] = useState(false);
  const [focusKeyword, setFocusKeyword] = useState("");
  const hydrated = useHydrated();
  const portalContainer = hydrated ? document.body : null;

  // The target keyphrase is a per-file editor preference, so it is kept in
  // localStorage rather than written into the user's frontmatter.
  const focusKeywordStorageKey = `sitepins:seo-focus-keyword:${orgId}/${projectId}/${
    fileParams?.join("/") ?? ""
  }`;

  // Reseeded during render when the file changes, so switching files never
  // shows the previous file's keyphrase for a frame.
  const [loadedKeywordKey, setLoadedKeywordKey] = useState<string | null>(null);
  if (hydrated && loadedKeywordKey !== focusKeywordStorageKey) {
    setLoadedKeywordKey(focusKeywordStorageKey);
    try {
      setFocusKeyword(localStorage.getItem(focusKeywordStorageKey) ?? "");
    } catch {
      setFocusKeyword("");
    }
  }

  const handleFocusKeywordChange = useCallback(
    (value: string) => {
      setFocusKeyword(value);
      try {
        if (value.trim()) {
          localStorage.setItem(focusKeywordStorageKey, value);
        } else {
          localStorage.removeItem(focusKeywordStorageKey);
        }
      } catch {
        // Storage unavailable (private mode / quota) — keep in-memory only.
      }
    },
    [focusKeywordStorageKey],
  );

  const hasSlugInFrontmatter = useMemo(() => {
    return data && Object.keys(data).some((k) => k === "slug");
  }, [data]);

  const [virtualSlug, setVirtualSlug] = useState(filename);

  const [slugResetKey, setSlugResetKey] = useState(`${filename}:${resetKey}`);
  if (slugResetKey !== `${filename}:${resetKey}`) {
    setSlugResetKey(`${filename}:${resetKey}`);
    setVirtualSlug(filename);
  }

  const displayData = useMemo(() => {
    if (hasSlugInFrontmatter) return data;
    return {
      ...data,
      slug: { value: virtualSlug, id: "00000000-0000-4000-8000-000000000000" },
    };
  }, [data, hasSlugInFrontmatter, virtualSlug]);

  const handleSetData: Dispatch<SetStateAction<TState | undefined>> =
    useCallback(
      (updater) => {
        if (!hasSlugInFrontmatter) {
          const previewNext =
            typeof updater === "function"
              ? updater({ data } as TState)
              : updater;
          if (previewNext?.data && "slug" in previewNext.data) {
            const newSlugVal = stringValue(previewNext.data.slug);
            if (newSlugVal !== undefined && newSlugVal !== virtualSlug) {
              setVirtualSlug(newSlugVal);
              onSlugChange?.(newSlugVal);
            }
          }
        }

        setState((prev) => {
          const next = typeof updater === "function" ? updater(prev) : updater;

          if (!next) return next;

          // Check if we are in "virtual slug" mode (no slug in original data)
          // and if the update is trying to add a slug
          const wasVirtual =
            !prev?.data || !Object.keys(prev.data).some((k) => k === "slug");

          if (wasVirtual && next.data && "slug" in next.data) {
            // Remove slug from the data to be saved to state
            const { slug: _slug, ...restData } = next.data;
            return { ...next, data: restData };
          }

          return next;
        });
      },
      [data, hasSlugInFrontmatter, onSlugChange, setState, virtualSlug],
    );

  // Runs with the panel closed too — the button's score badge reads from it.
  const debouncedContent = useDebounce(content, 600);

  const { checkAiAccess, isAiSeoEnabled } = useAiAccess();
  const [generatingField, setGeneratingField] = useState<string | null>(null);

  const handleApplyFix = useCallback(
    (field: string, value: unknown) => {
      if (field === "focusKeyword") {
        handleFocusKeywordChange(String(value));
        toast.success(tEditorSeo("ai.fix_applied"));
        return;
      }

      if (field === "content" || field === "body" || field === "markdown") {
        const newContent = String(value);
        onUpdateContent?.(newContent);
        window.dispatchEvent(
          new CustomEvent("sitepins:editor-content-update", {
            detail: { content: newContent, mode: "replace" },
          }),
        );
        toast.success(
          tEditorSeo("ai.content_applied") || "Content updated in editor",
        );
        return;
      }

      if (field === "slug") {
        if (!hasSlugInFrontmatter) {
          const newSlugVal = String(value);
          setVirtualSlug(newSlugVal);
          onSlugChange?.(newSlugVal);
          toast.success(tEditorSeo("ai.fix_applied"));
          return;
        }
      }

      handleSetData((prev) => {
        if (!prev) return prev;
        let nextData = { ...(prev.data || {}) };

        const normalized = field.toLowerCase();
        const isTitleField =
          normalized === "title" ||
          META_TITLE_KEYS.some((k) => k.toLowerCase() === normalized);
        const isDescField =
          normalized === "description" ||
          META_DESC_KEYS.some((k) => k.toLowerCase() === normalized);
        const isKeywordField = KEYWORD_KEYS.some(
          (k) => k.toLowerCase() === normalized,
        );
        const isCategoryField = CATEGORY_KEYS.some(
          (k) => k.toLowerCase() === normalized,
        );

        const actualKey =
          Object.keys(nextData).find((k) => {
            const kNorm = k.toLowerCase();
            if (kNorm === normalized) return true;
            if (
              isTitleField &&
              META_TITLE_KEYS.some((tk) => tk.toLowerCase() === kNorm)
            )
              return true;
            if (
              isDescField &&
              META_DESC_KEYS.some((dk) => dk.toLowerCase() === kNorm)
            )
              return true;
            if (
              isKeywordField &&
              KEYWORD_KEYS.some((kk) => kk.toLowerCase() === kNorm)
            )
              return true;
            if (
              isCategoryField &&
              CATEGORY_KEYS.some((ck) => ck.toLowerCase() === kNorm)
            )
              return true;
            return false;
          }) ||
          schema?.find((f) => {
            const fNorm = f.name.toLowerCase();
            if (fNorm === normalized) return true;
            if (
              isTitleField &&
              META_TITLE_KEYS.some((tk) => tk.toLowerCase() === fNorm)
            )
              return true;
            if (
              isDescField &&
              META_DESC_KEYS.some((dk) => dk.toLowerCase() === fNorm)
            )
              return true;
            if (
              isKeywordField &&
              KEYWORD_KEYS.some((kk) => kk.toLowerCase() === fNorm)
            )
              return true;
            if (
              isCategoryField &&
              CATEGORY_KEYS.some((ck) => ck.toLowerCase() === fNorm)
            )
              return true;
            return false;
          })?.name ||
          field;

        nextData = applyFieldUpdate(nextData, actualKey, value, schema);
        return { ...prev, data: nextData };
      });

      toast.success(tEditorSeo("ai.fix_applied"));
    },
    [
      handleSetData,
      hasSlugInFrontmatter,
      handleFocusKeywordChange,
      onSlugChange,
      onUpdateContent,
      schema,
      tEditorSeo,
    ],
  );

  const handleGenerateField = useCallback(
    async (fieldName: string) => {
      if (!isAiSeoEnabled || !checkAiAccess()) {
        return;
      }

      setGeneratingField(fieldName);
      try {
        const cred = getAICredential();
        const res = await fetch("/api/ai/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: cred?.apiKey,
            provider: cred?.provider,
            model: cred?.model,
            content: content || debouncedContent || "",
            currentData: revertToOriginal(displayData),
            schema,
            filename,
            focusKeyword,
            targetField: fieldName,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || tEditorSeo("ai.error"));
        }

        const data = await res.json();
        const generatedVal =
          data.value ??
          data[fieldName] ??
          Object.values(data).find((v) => v !== undefined);

        if (generatedVal === undefined || generatedVal === null) {
          throw new Error(tEditorSeo("ai.error"));
        }

        if (fieldName === "slug") {
          if (!hasSlugInFrontmatter) {
            const newSlugVal = String(generatedVal);
            setVirtualSlug(newSlugVal);
            onSlugChange?.(newSlugVal);
            toast.success(tEditorSeo("ai.fix_applied"));
            return;
          }
        }

        handleSetData((prev) => {
          if (!prev) return prev;
          let nextData = { ...(prev.data || {}) };

          const normalized = fieldName.toLowerCase();
          const actualKey =
            Object.keys(nextData).find((k) => k.toLowerCase() === normalized) ||
            fieldName;

          nextData = applyFieldUpdate(
            nextData,
            actualKey,
            generatedVal,
            schema,
          );
          return { ...prev, data: nextData };
        });

        toast.success(tEditorSeo("ai.fix_applied"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : tEditorSeo("ai.error");
        toast.error(msg);
      } finally {
        setGeneratingField(null);
      }
    },
    [
      checkAiAccess,
      content,
      debouncedContent,
      displayData,
      filename,
      focusKeyword,
      handleSetData,
      hasSlugInFrontmatter,
      isAiSeoEnabled,
      onSlugChange,
      schema,
      tEditorSeo,
    ],
  );

  const renderFieldAction = useCallback(
    (field: TField, _value: unknown) => {
      if (!isAiSeoEnabled) return null;
      if (field.type === "boolean" || field.type === "object") return null;

      const isGenerating = generatingField === field.name;
      const labelText = tEditorSeo("ai.fix");

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={generatingField !== null}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGenerateField(field.name);
              }}
              className="text-muted-foreground hover:text-primary hover:bg-primary/10 -my-1 size-6 shrink-0 rounded-md p-0 transition-colors"
              aria-label={labelText}
            >
              {isGenerating ? (
                <Loader2 className="text-primary size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {labelText}
          </TooltipContent>
        </Tooltip>
      );
    },
    [isAiSeoEnabled, generatingField, handleGenerateField, tEditorSeo],
  );

  useEffect(() => {
    const handleAiSeo = (e: Event) => {
      e.preventDefault();
      onSidebarOpenChange(true);
    };

    window.addEventListener("sitepins:ai-seo-autofill", handleAiSeo);
    return () => {
      window.removeEventListener("sitepins:ai-seo-autofill", handleAiSeo);
    };
  }, [onSidebarOpenChange]);

  const {
    results,
    metaTitle,
    metaDescription,
    metaDate,
    seoInsights,
    wordCount,
  } = useMemo(
    () =>
      validateSEO(
        revertToOriginal(displayData),
        debouncedContent,
        baseUrl,
        tEditorSeo,
      ),
    [displayData, debouncedContent, baseUrl, tEditorSeo],
  );

  const formattedDate = metaDate
    ? new Date(metaDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : undefined;

  const filteredSchema = useMemo(
    () =>
      schema.reduce((acc, field) => {
        // Keyword/tag fields feed the analysis only — they stay in the
        // frontmatter panel, not here.
        if (KEYWORD_KEYS.includes(field.name)) return acc;
        const keys = Object.keys(results);
        if (keys.some((k) => k === field.name)) {
          if (field.type === "Date") {
            acc.push(field);
          } else {
            const maxLength = META_TITLE_KEYS.includes(field.name)
              ? 60
              : META_DESC_KEYS.includes(field.name)
                ? 160
                : 100;
            acc.push({
              ...field,
              length: results[field.name]?.length || 0,
              maxLength: maxLength,
            });
          }
        }
        return acc;
      }, [] as TField[]),
    [schema, results],
  );

  const displaySchema = useMemo(() => {
    // Check if slug exists in the defined schema (not just in the data)
    const isSlugInSchema = filteredSchema.some((f) => f.name === "slug");

    if (isSlugInSchema) return filteredSchema;

    // Inject slug BEFORE Date
    const newSchema = [...filteredSchema];
    const dateIndex = newSchema.findIndex(
      (f) =>
        f.name === "date" ||
        f.name === "publishedDate" ||
        f.name === "publishDate",
    );
    // Insert at dateIndex (pushing date down), or at 0 if no date found
    const insertIndex = dateIndex >= 0 ? dateIndex : 0;

    newSchema.splice(insertIndex, 0, {
      name: "slug",
      label: tEditorSeo("slug"),
      type: "string",
      value: filename, // Default value
      maxLength: 100,
      length: filename.length,
    });

    return newSchema;
  }, [filteredSchema, filename, tEditorSeo]);

  const { canAccessProFeatures: canAccessSeo, canAccessProPlusFeatures } =
    useOwnerPlan();

  // Computed on every plan so the score covers all checks; only the rows are gated.
  const insightsResults = useMemo(
    () =>
      validateSeoInsights(
        revertToOriginal(displayData),
        debouncedContent,
        tEditorSeo,
        focusKeyword,
      ).results,
    [displayData, debouncedContent, tEditorSeo, focusKeyword],
  );

  const seoScore = getSeoScore([results, insightsResults], wordCount);

  const scoreBadge =
    seoScore === null ? null : (
      <span
        aria-label={tEditorSeo("score_label", { score: seoScore })}
        className={`rounded-full px-1.5 py-0 text-[11px] font-semibold whitespace-nowrap sm:px-2 sm:py-0.5 sm:text-xs ${
          seoScore >= 80
            ? "bg-success/15 text-success"
            : seoScore >= 50
              ? "bg-warning/15 text-warning"
              : "bg-destructive/15 text-destructive"
        }`}
      >
        {seoScore}
      </span>
    );

  return (
    <div>
      {/* Toggle Button */}
      {!canAccessSeo ? (
        <div className="flex items-center gap-2">
          <Button
            size="default"
            variant="outline"
            className="h-9 px-2 text-xs sm:px-2.5 sm:text-sm"
            type="button"
            aria-label="SEO"
            onClick={() => setShowUpgradeOrg(true)}
          >
            <span className="hidden sm:inline-block">SEO</span>
            <ChartSpline className="size-4 sm:hidden" strokeWidth={1.5} />
            {scoreBadge}
          </Button>
          <UpgradeDialog
            open={showUpgradeOrg}
            onOpenChange={setShowUpgradeOrg}
            contextKey="seo"
          />
        </div>
      ) : (
        <Button
          size="default"
          variant="outline"
          className="h-9 px-2 text-xs sm:px-2.5 sm:text-sm"
          type="button"
          aria-label="SEO"
          onClick={() => onSidebarOpenChange(!isSidebarOpen)}
        >
          <span className="hidden sm:inline-block">SEO</span>
          <ChartSpline className="size-4 sm:hidden" strokeWidth={1.5} />
          {scoreBadge}
        </Button>
      )}
      {/* Sidebar */}
      {portalContainer &&
        createPortal(
          <AnimatePresence>
            {isSidebarOpen && (
              <>
                <motion.button
                  key="seo-backdrop"
                  type="button"
                  aria-label={tEditorSeo("close_overlay")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => onSidebarOpenChange(false)}
                  className="bg-background/20 fixed inset-x-0 top-17.25 bottom-0 z-60 cursor-pointer backdrop-blur-sm xl:inset-s-70 2xl:hidden"
                />
                <motion.div
                  key="seo-sidebar"
                  initial={{ x: isRtl ? "-100%" : "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: isRtl ? "-100%" : "100%" }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  className="bg-light border-border fixed inset-e-0 top-17.25 z-70 h-[calc(100svh-67px)] w-full max-w-105 border-s shadow-lg 2xl:z-30 2xl:shadow-none"
                >
                  <div className="dark:[&_input]:bg-input/30 dark:[&_textarea]:bg-input/30 h-full space-y-4 overflow-y-auto p-5 [&_input]:bg-white [&_textarea]:bg-white">
                    <SearchPreview
                      title={metaTitle}
                      description={metaDescription}
                      date={formattedDate}
                    />
                    <FrontmatterRenderer
                      schema={displaySchema}
                      data={displayData}
                      setData={handleSetData}
                      strictMode={true}
                      renderFieldAction={renderFieldAction}
                    />
                    <SeoAnalysis
                      results={results}
                      schema={schema}
                      insightsResults={
                        canAccessProPlusFeatures ? insightsResults : {}
                      }
                      canAccessInsights={canAccessProPlusFeatures}
                      focusKeyword={
                        canAccessProPlusFeatures ? focusKeyword : undefined
                      }
                      onFocusKeywordChange={
                        canAccessProPlusFeatures
                          ? handleFocusKeywordChange
                          : undefined
                      }
                      onApplyFix={handleApplyFix}
                      content={content || debouncedContent}
                    />
                    <div className="mt-8 space-y-3">
                      <h3 className="text-sm font-normal">
                        {tEditorSeo("content_insights")}
                      </h3>
                      <ContentAnalysis content={content} />
                      <LinkAnalysis
                        totalLinks={seoInsights?.linkQuality?.total ?? 0}
                        internalLinks={seoInsights?.internalLinks?.length ?? 0}
                        externalLinks={seoInsights?.externalLinks?.length ?? 0}
                      />
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          portalContainer,
        )}
      <AiUpgrade />
    </div>
  );
}
