"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import {
  getSeoScore,
  META_DESC_KEYS,
  META_TITLE_KEYS,
  validateSEO,
  validateSeoInsights,
} from "@/lib/utils/seo-validate";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { TField, TState } from "@/types";
import { ChartSpline } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { stringValue } from "@/lib/utils/frontmatter-value";
import { useTranslations } from "next-intl";
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

export default function SeoSetting({
  schema,
  data,
  setState,
  content,
  onSlugChange,
  resetKey,
}: {
  schema: TField[];
  data: TState["data"];
  setState: Dispatch<SetStateAction<TState | undefined>>;
  content: string;
  onSlugChange?: (newSlug: string) => void;
  resetKey?: number;
}) {
  const tEditorSeo = useTranslations("editor.seo");
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

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [showUpgradeOrg, setShowUpgradeOrg] = useState(false);
  const [focusKeyword, setFocusKeyword] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  // State, not a ref: `displayData` reads this during render, and a memo
  // cannot depend on a ref.
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    // Set portal container on client side only
    setPortalContainer(document.body);
  }, []);

  // The target keyphrase is a per-file editor preference, so it is kept in
  // localStorage rather than written into the user's frontmatter.
  const focusKeywordStorageKey = `sitepins:seo-focus-keyword:${orgId}/${projectId}/${
    fileParams?.join("/") ?? ""
  }`;

  useEffect(() => {
    try {
      setFocusKeyword(localStorage.getItem(focusKeywordStorageKey) ?? "");
    } catch {
      setFocusKeyword("");
    }
  }, [focusKeywordStorageKey]);

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

  useEffect(() => {
    setPendingSlug(null);
    setVirtualSlug(filename);
  }, [filename, resetKey]);

  const displayData = useMemo(() => {
    if (hasSlugInFrontmatter) return data;
    const currentSlug = pendingSlug ?? virtualSlug;
    return {
      ...data,
      slug: { value: currentSlug, id: "00000000-0000-4000-8000-000000000000" },
    };
  }, [data, hasSlugInFrontmatter, virtualSlug, pendingSlug]);

  const handleSetData: Dispatch<SetStateAction<TState | undefined>> =
    useCallback(
      (updater) => {
        setState((prev) => {
          const next = typeof updater === "function" ? updater(prev) : updater;

          if (!next) return next;

          // Check if we are in "virtual slug" mode (no slug in original data)
          // and if the update is trying to add a slug
          const wasVirtual =
            !prev?.data || !Object.keys(prev.data).some((k) => k === "slug");

          if (wasVirtual && next.data && "slug" in next.data) {
            // Intercept the slug update
            const newSlugVal = stringValue(next.data.slug) ?? null;
            setPendingSlug(newSlugVal);

            // Remove slug from the data to be saved to state
            const { _slug, ...restData } = next.data;
            return { ...next, data: restData };
          }

          return next;
        });
      },
      [setState],
    );

  useEffect(() => {
    if (pendingSlug !== null) {
      setPendingSlug(null);
      setVirtualSlug(pendingSlug);
      onSlugChange?.(pendingSlug);
    }
  }, [pendingSlug, onSlugChange, setVirtualSlug]);

  // Runs with the panel closed too — the button's score badge reads from it.
  const debouncedContent = useDebounce(content, 600);

  const { results, metaTitle, metaDescription, metaDate, seoInsights } =
    useMemo(
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

  const seoScore = getSeoScore(results, insightsResults);

  const scoreBadge =
    seoScore === null ? null : (
      <span
        aria-label={tEditorSeo("score_label", { score: seoScore })}
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
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
            size={"lg"}
            variant={"outline"}
            type="button"
            aria-label={tEditorSeo("title")}
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
          size={"lg"}
          variant={"outline"}
          type="button"
          aria-label={tEditorSeo("title")}
          onClick={() => setSidebarOpen(!isSidebarOpen)}
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
              <motion.div
                key="seo-sidebar"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="bg-background border-border fixed top-17.25 right-0 z-50 h-[calc(100svh-67px)] w-full max-w-105 border-l shadow-lg"
              >
                <div className="h-full space-y-4 overflow-y-auto p-5">
                  <h5 className="mb-5 block text-lg font-semibold">
                    {tEditorSeo("title")}
                  </h5>
                  {canAccessProPlusFeatures && (
                    <div className="space-y-1.5">
                      <Label htmlFor="seo-focus-keyword">
                        {tEditorSeo("focus_keyword_label")}
                      </Label>
                      <Input
                        id="seo-focus-keyword"
                        value={focusKeyword}
                        autoComplete="off"
                        placeholder={tEditorSeo("focus_keyword_placeholder")}
                        onChange={(e) =>
                          handleFocusKeywordChange(e.target.value)
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        {tEditorSeo("focus_keyword_help")}
                      </p>
                    </div>
                  )}
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
                  />
                  <ContentAnalysis content={content} />
                  <LinkAnalysis
                    totalLinks={seoInsights?.linkQuality?.total ?? 0}
                    internalLinks={seoInsights?.internalLinks?.length ?? 0}
                    externalLinks={seoInsights?.externalLinks?.length ?? 0}
                  />
                  <SeoAnalysis
                    results={results}
                    schema={schema}
                    insightsResults={
                      canAccessProPlusFeatures ? insightsResults : {}
                    }
                    canAccessInsights={canAccessProPlusFeatures}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          portalContainer,
        )}
    </div>
  );
}
