"use client";

import { Button } from "@/components/ui/button";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { revertToOriginal } from "@/editor/utils/plate-utils";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import {
  META_DESC_KEYS,
  META_TITLE_KEYS,
  validateSEO,
  validateSeoInsights,
} from "@/lib/utils/seo-validate";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { TField, TState } from "@/types";
import { Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
}: {
  schema: TField[];
  data: TState["data"];
  setState: Dispatch<SetStateAction<TState | undefined>>;
  content: string;
  onSlugChange?: (newSlug: string) => void;
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const pendingSlugUpdateRef = useRef<string | null>(null);

  useEffect(() => {
    // Set portal container on client side only
    setPortalContainer(document.body);
  }, []);

  const hasSlugInFrontmatter = useMemo(() => {
    return data && Object.keys(data).some((k) => k === "slug");
  }, [data]);

  const [virtualSlug, setVirtualSlug] = useState(filename);

  useEffect(() => {
    setVirtualSlug(filename);
  }, [filename]);

  const displayData = useMemo(() => {
    if (hasSlugInFrontmatter) return data;
    const currentSlug =
      pendingSlugUpdateRef.current !== null
        ? pendingSlugUpdateRef.current
        : virtualSlug;
    return {
      ...data,
      slug: { value: currentSlug, id: "00000000-0000-4000-8000-000000000000" },
    };
  }, [data, hasSlugInFrontmatter, virtualSlug]);

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
            const newSlugVal = next.data.slug.value;
            pendingSlugUpdateRef.current = newSlugVal;

            // Remove slug from the data to be saved to state
            const { slug, ...restData } = next.data;
            return { ...next, data: restData };
          }

          return next;
        });
      },
      [setState],
    );

  useEffect(() => {
    if (pendingSlugUpdateRef.current !== null) {
      const newSlugVal = pendingSlugUpdateRef.current;
      pendingSlugUpdateRef.current = null;
      setVirtualSlug(newSlugVal);
      onSlugChange?.(newSlugVal);
    }
  }, [displayData, onSlugChange, setVirtualSlug]);

  const SEOCallback = useCallback(() => {
    let results, summary, metaTitle, metaDescription, metaDate, seoInsights;

    if (isSidebarOpen) {
      ({ results, summary, metaTitle, metaDescription, metaDate, seoInsights } =
        validateSEO(
          revertToOriginal(displayData),
          content,
          baseUrl,
          tEditorSeo,
        ));
    } else {
      results = {};
      summary = { good: 0, improvement: 0, bad: 0 };
      metaTitle = "";
      metaDescription = "";
      metaDate = undefined;
      seoInsights = {
        linkQuality: {
          total: 0,
          descriptive: 0,
          generic: 0,
        },
        externalLinks: [],
        internalLinks: [],
        images: [],
      };
    }

    return {
      results,
      summary,
      metaTitle,
      metaDescription,
      metaDate,
      seoInsights,
    };
  }, [isSidebarOpen, displayData, content, baseUrl, tEditorSeo]);
  const { results, metaTitle, metaDescription, metaDate, seoInsights } =
    SEOCallback();

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

  const insightsResults = useMemo(() => {
    if (!isSidebarOpen || !canAccessProPlusFeatures) return {};
    return validateSeoInsights(
      revertToOriginal(displayData),
      content,
      tEditorSeo,
    ).results;
  }, [isSidebarOpen, canAccessProPlusFeatures, displayData, content, tEditorSeo]);

  return (
    <div>
      {/* Toggle Button */}
      {!canAccessSeo ? (
        <div className="flex items-center gap-2">
          <Button
            size={"lg"}
            variant={"outline"}
            type="button"
            onClick={() => setShowUpgradeOrg(true)}
          >
            <span className="mr-2 hidden sm:inline-block">SEO</span>
            <Settings2 className="size-4" strokeWidth={1.5} />
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
          onClick={() => setSidebarOpen(!isSidebarOpen)}
        >
          <span className="mr-2 hidden sm:inline-block">SEO</span>
          <Settings2 className="size-4" strokeWidth={1.5} />
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
                    insightsResults={insightsResults}
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
