import { AiMarkdown } from "@/components/ai-markdown";
import { AiUpgrade } from "@/components/ai-upgrade";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { useAiAccess } from "@/hooks/use-ai-access";
import {
  getSeoStatus,
  type TSeoResults,
  type TSeoStatus,
} from "@/lib/utils/seo-validate";
import { TField } from "@/types";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Info,
  Loader2,
  Lock,
  MinusCircle,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

// Team+ (SEO Insights) checks, in display order. Rows come from
// validateSeoInsights and are only populated for Pro+ plans; otherwise the
// merged card shows just the base analysis-summary results plus a teaser.
const INSIGHT_KEYS = [
  "readability",
  "sentence_length",
  "paragraph_length",
  "passive_voice",
  "transition_words",
  "repeated_sentence_start",
  "em_dash_overuse",
  "heading_structure",
  "subheading_distribution",
  "toc_present",
  "media_count",
  "slug_length",
  "keyword_first_paragraph",
  "keyphrase_in_title",
  "keyphrase_in_description",
  "keyphrase_in_slug",
  "keyphrase_in_subheadings",
  "keyphrase_in_alt",
  "title_has_number",
  "title_power_word",
  "title_sentiment",
] as const;

// Base-result keys with no matching schema field — either synthetic, or
// tracked as "not applicable" precisely because the frontmatter lacks them.
const BASE_LABEL_KEYS: Record<string, string> = {
  Content: "content",
  "Alt Text": "alt_text",
  slug: "slug",
  metaTitle: "meta_title",
  metaDescription: "meta_description",
  keywords: "keywords",
  openGraph: "open_graph",
  canonicalUrl: "canonical_url",
  structuredData: "structured_data",
  lastUpdated: "last_updated",
};

type Row = {
  key: string;
  metricKey: string;
  name: string;
  status: TSeoStatus;
  valid?: boolean;
  value?: unknown;
  length?: number;
  percentage?: number;
  tip?: string;
};

const METRIC_EXPLANATION_KEYS: Record<string, string> = {
  content: "content",
  alttext: "alt_text",
  slug: "slug",
  metatitle: "meta_title",
  title: "meta_title",
  metadescription: "meta_description",
  description: "meta_description",
  metadesc: "meta_description",
  keywords: "keywords",
  opengraph: "open_graph",
  canonicalurl: "canonical_url",
  structureddata: "structured_data",
  robots: "robots",
  lastupdated: "last_updated",
  date: "last_updated",
  updatedat: "last_updated",
  modifiedat: "last_updated",
  lastmodified: "last_updated",
  datemodified: "last_updated",
  dateupdated: "last_updated",
  readability: "readability",
  sentencelength: "sentence_length",
  paragraphlength: "paragraph_length",
  passivevoice: "passive_voice",
  transitionwords: "transition_words",
  repeatedsentencestart: "repeated_sentence_start",
  emdashoveruse: "em_dash_overuse",
  headingstructure: "heading_structure",
  subheadingdistribution: "subheading_distribution",
  tocpresent: "toc_present",
  mediacount: "media_count",
  sluglength: "slug_length",
  keywordfirstparagraph: "keyword_first_paragraph",
  keyphraseintitle: "keyphrase_in_title",
  keyphraseindescription: "keyphrase_in_description",
  keyphraseinslug: "keyphrase_in_slug",
  keyphraseinsubheadings: "keyphrase_in_subheadings",
  keyphraseinalt: "keyphrase_in_alt",
  titlehasnumber: "title_has_number",
  titlepowerword: "title_power_word",
  titlesentiment: "title_sentiment",
};

const getMetricExplanationKey = (key: string) => {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const exactMatch = METRIC_EXPLANATION_KEYS[normalized];

  if (exactMatch) return exactMatch;
  if (normalized.includes("title")) return "meta_title";
  if (normalized.includes("description") || normalized.includes("desc")) {
    return "meta_description";
  }
  if (normalized.includes("keyword") || normalized.includes("tag")) {
    return "keywords";
  }
  if (
    normalized.includes("updated") ||
    normalized.includes("modified") ||
    normalized === "date"
  ) {
    return "last_updated";
  }

  return "general";
};

export default function SeoAnalysis({
  results,
  schema,
  insightsResults = {},
  canAccessInsights = true,
  focusKeyword,
  onFocusKeywordChange,
  onApplyFix,
  content,
}: {
  results: TSeoResults;
  schema: TField[];
  insightsResults?: TSeoResults;
  canAccessInsights?: boolean;
  focusKeyword?: string;
  onFocusKeywordChange?: (value: string) => void;
  onApplyFix?: (field: string, value: unknown) => void;
  content?: string;
}) {
  const tEditorSeo = useTranslations("editor.seo");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { checkAiAccess, isAiSeoEnabled } = useAiAccess();

  type AiFixItem = {
    loading: boolean;
    suggestion?: string;
    fieldToUpdate?: string | null;
    explanation?: string;
    copied?: boolean;
    applied?: boolean;
  };

  const [fixes, setFixes] = useState<Record<string, AiFixItem>>({});

  const handleTriggerFix = async (result: Row) => {
    if (!isAiSeoEnabled || !checkAiAccess()) {
      return;
    }

    setFixes((prev) => ({
      ...prev,
      [result.key]: { loading: true },
    }));

    try {
      const cred = getAICredential();
      const res = await fetch("/api/ai/seo-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: cred?.apiKey,
          provider: cred?.provider,
          model: cred?.model,
          metricKey: result.metricKey,
          metricName: result.name,
          currentValue: result.value,
          recommendation: result.tip,
          focusKeyword,
          content: content || "",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || tEditorSeo("ai.error"));
      }

      const data = await res.json();
      let resolvedField = data.fieldToUpdate;
      if (!resolvedField) {
        const normKey = (result.metricKey || "").toLowerCase();
        const normName = (result.name || "").toLowerCase();
        if (
          normKey === "tags" ||
          normKey === "keywords" ||
          normKey === "tag" ||
          normKey === "keyword" ||
          normName.includes("tag") ||
          normName.includes("keyword")
        ) {
          resolvedField = result.metricKey || "tags";
        } else if (normKey.includes("title") || normName.includes("title")) {
          resolvedField = "title";
        } else if (normKey.includes("desc") || normName.includes("desc")) {
          resolvedField = "description";
        } else if (normKey.includes("slug") || normName.includes("slug")) {
          resolvedField = "slug";
        } else if (
          normKey === "content" ||
          normName === "content" ||
          normKey.includes("sentence") ||
          normKey.includes("paragraph") ||
          normKey.includes("readability")
        ) {
          resolvedField = "content";
        }
      }

      setFixes((prev) => ({
        ...prev,
        [result.key]: {
          loading: false,
          suggestion: data.suggestion,
          fieldToUpdate: resolvedField,
          explanation: data.explanation,
        },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tEditorSeo("ai.error");
      toast.error(msg);
      setFixes((prev) => {
        const next = { ...prev };
        delete next[result.key];
        return next;
      });
    }
  };

  const handleCopyFix = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setFixes((prev) => ({
      ...prev,
      [key]: { ...prev[key], copied: true },
    }));
    setTimeout(() => {
      setFixes((prev) => ({
        ...prev,
        [key]: { ...prev[key], copied: false },
      }));
    }, 2000);
  };

  const handleApplyFixClick = (
    key: string,
    field: string,
    suggestion: string,
  ) => {
    if (!onApplyFix) return;
    onApplyFix(field, suggestion);
    setFixes((prev) => ({
      ...prev,
      [key]: { ...prev[key], applied: true },
    }));
    setTimeout(() => {
      setFixes((prev) => ({
        ...prev,
        [key]: { ...prev[key], applied: false },
      }));
    }, 2000);
  };

  // Base analysis-summary rows (Pro), labelled via the content schema, then
  // by a built-in label for keys the schema does not define.
  const baseRows: Row[] = Object.keys(results).map((key, index) => {
    const labelKey = BASE_LABEL_KEYS[key];
    return {
      key: `base-${key || index}`,
      metricKey: key,
      name:
        schema.find((field) => field.name === key)?.label ||
        (labelKey ? tEditorSeo(`base_labels.${labelKey}`) : key),
      ...results[key],
      status: getSeoStatus(results[key]),
    };
  });

  // Team+ insight rows, labelled via the insights i18n namespace.
  const insightRows: Row[] = INSIGHT_KEYS.filter(
    (key) => insightsResults[key],
  ).map((key) => ({
    key: `insight-${key}`,
    metricKey: key,
    name: tEditorSeo(`insights.labels.${key}`),
    ...insightsResults[key],
    status: getSeoStatus(insightsResults[key]),
  }));

  const resultsArray = [...baseRows, ...insightRows];

  const byStatus = (status: TSeoStatus) =>
    resultsArray.filter((result) => result.status === status);

  const goodResults = byStatus("pass");
  const improvements = byStatus("warn");
  const issues = byStatus("fail");
  const notApplicable = byStatus("na");

  const categories = [
    {
      id: "good-results",
      title: tEditorSeo("good_results"),
      count: goodResults.length,
      icon: CheckCircle,
      iconColor: "text-success",
      bgColor: "bg-success/10",
      borderColor: "border-success/20",
      results: goodResults,
    },
    {
      id: "improvements",
      title: tEditorSeo("improvements"),
      count: improvements.length,
      icon: AlertTriangle,
      iconColor: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/20",
      results: improvements,
    },
    {
      id: "issues",
      title: tEditorSeo("issues"),
      count: issues.length,
      icon: XCircle,
      iconColor: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      results: issues,
    },
    // Checks with nothing to measure. Listed so the reason is visible, but
    // they carry no weight in the score.
    {
      id: "not-applicable",
      title: tEditorSeo("not_applicable"),
      count: notApplicable.length,
      icon: MinusCircle,
      iconColor: "text-muted-foreground",
      bgColor: "bg-neutral-200/60 dark:bg-muted/40",
      borderColor: "border-neutral-300 dark:border-border",
      results: notApplicable,
    },
  ];

  const getProgressBarColor = (status: TSeoStatus) => {
    if (status === "pass") return "bg-success";
    if (status === "fail") return "bg-destructive";
    if (status === "na") return "bg-muted-foreground/40";
    return "bg-warning";
  };

  return (
    <div className="mt-8 space-y-3">
      <h3 className="text-sm font-normal">{tEditorSeo("analysis_summary")}</h3>
      {focusKeyword !== undefined && onFocusKeywordChange && (
        <div className="border-border dark:bg-background bg-background/50 rounded-lg border p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="seo-focus-keyword">
              {tEditorSeo("focus_keyword_label")}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={tEditorSeo("view_explanation")}
                  className="text-muted-foreground hover:text-foreground -mt-1 inline-flex size-4 items-center justify-center rounded-md transition-colors"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-64 text-start">
                {tEditorSeo("focus_keyword_help")}
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="seo-focus-keyword"
            value={focusKeyword}
            autoComplete="off"
            placeholder={tEditorSeo("focus_keyword_placeholder")}
            onChange={(e) => onFocusKeywordChange(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-2">
        {categories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Accordion key={category.id}>
              <AccordionItem
                value={category.id}
                className={`overflow-hidden rounded-lg border ${category.borderColor} last:border-b ${category.id === "not-applicable" ? "dark:bg-muted/40 bg-neutral-200/60" : ""}`}
              >
                <AccordionTrigger
                  className={`rounded-none px-4 py-3 text-sm font-medium hover:no-underline ${category.bgColor} aria-expanded:border-b-0`}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <IconComponent className={`size-4 ${category.iconColor}`} />
                    <span>{category.title}</span>
                    <Badge
                      variant="muted"
                      className="bg-background/80 text-text-default ms-auto text-xs font-normal"
                    >
                      {category.count}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-background/40 px-4 pt-4">
                  <div className="space-y-4 pb-1">
                    {category.results.map((result, index) => {
                      const currentFix = fixes[result.key];
                      return (
                        <div
                          key={result.key || `result-${index}`}
                          className="border-border/60 border-t pt-4 first:border-t-0 first:pt-0"
                        >
                          <div className="mb-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-card-foreground text-sm font-medium">
                                {result.name}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={tEditorSeo("view_explanation")}
                                    className="text-muted-foreground hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
                                  >
                                    <Info className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="left"
                                  className="max-w-64 text-start"
                                >
                                  {tEditorSeo(
                                    `explanations.${getMetricExplanationKey(result.metricKey)}`,
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          {result.value !== undefined &&
                            result.value !== "" && (
                              <div className="mb-2">
                                <span className="text-muted-foreground text-xs font-medium">
                                  {tEditorSeo("current")}
                                </span>
                                <div className="text-card-foreground wrap-break-words mt-1 text-xs">
                                  {result.value instanceof Date
                                    ? result.value.toLocaleDateString()
                                    : String(result.value)}
                                </div>
                              </div>
                            )}

                          {result.length !== undefined && (
                            <div className="mb-2">
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-medium">
                                  {tEditorSeo("length", {
                                    length: result.length,
                                  })}
                                </span>
                              </div>
                              {!!result.percentage && (
                                <div className="bg-muted/30 h-1.5 overflow-hidden rounded-full">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(result.status)}`}
                                    style={{
                                      width: `${Math.min(result.percentage, 100)}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {result.tip && (
                            <div className="text-muted-foreground border-border/60 mt-3 border-s-2 ps-3 text-xs">
                              <span className="font-medium not-italic">
                                {tEditorSeo("recommendation")}
                              </span>
                              <p className="wrap-break-words mt-1 leading-relaxed italic">
                                {result.tip}
                              </p>
                            </div>
                          )}

                          {isAiSeoEnabled &&
                            (result.status === "warn" ||
                              result.status === "fail") && (
                              <div className="mt-3 flex items-center justify-between">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 gap-1 px-2 text-[11px] font-medium"
                                  onClick={() => handleTriggerFix(result)}
                                  disabled={currentFix?.loading}
                                >
                                  {currentFix?.loading ? (
                                    <>
                                      <Loader2 className="size-3 animate-spin" />
                                      <span>{tEditorSeo("ai.fixing")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="size-3" />
                                      <span>{tEditorSeo("ai.fix")}</span>
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}

                          {isAiSeoEnabled && currentFix?.suggestion
                            ? (() => {
                                const suggestionText = currentFix.suggestion;
                                const targetField = currentFix.fieldToUpdate;
                                return (
                                  <div className="border-border bg-muted/40 mt-2.5 space-y-2 rounded-md border p-2.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                                        <Sparkles className="size-3.5" />
                                        {tEditorSeo("ai.suggestion")}
                                      </span>
                                      {targetField && (
                                        <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                                          {targetField}
                                        </span>
                                      )}
                                    </div>
                                    {targetField === "content" ? (
                                      <div className="text-foreground bg-background/90 border-border/40 max-h-64 overflow-y-auto rounded border p-2.5 text-xs leading-relaxed select-text">
                                        <AiMarkdown content={suggestionText} />
                                      </div>
                                    ) : (
                                      <div className="text-foreground bg-background/90 border-border/40 rounded border p-2 text-xs leading-relaxed whitespace-pre-wrap select-text">
                                        {suggestionText}
                                      </div>
                                    )}
                                    {currentFix.explanation && (
                                      <p className="text-muted-foreground text-[11px] italic">
                                        {currentFix.explanation}
                                      </p>
                                    )}
                                    <div className="flex items-center justify-end gap-2 pt-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[11px]"
                                        onClick={() =>
                                          handleCopyFix(
                                            result.key,
                                            suggestionText,
                                          )
                                        }
                                      >
                                        {currentFix.copied ? (
                                          <>
                                            <Check className="text-success me-1 size-3" />
                                            {tEditorSeo("ai.copied")}
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="me-1 size-3" />
                                            {tEditorSeo("ai.copy_fix")}
                                          </>
                                        )}
                                      </Button>
                                      {targetField && onApplyFix && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-6 px-2 text-[11px]"
                                          onClick={() => {
                                            handleApplyFixClick(
                                              result.key,
                                              targetField,
                                              suggestionText,
                                            );
                                          }}
                                        >
                                          {currentFix.applied ? (
                                            <>
                                              <Check className="text-success me-1 size-3" />
                                              {tEditorSeo("ai.applied") ||
                                                "Applied"}
                                            </>
                                          ) : (
                                            <>
                                              <Wand2 className="me-1 size-3" />
                                              {targetField === "content"
                                                ? tEditorSeo(
                                                    "ai.apply_to_editor",
                                                  ) || "Apply to Editor"
                                                : tEditorSeo("ai.apply_fix")}
                                            </>
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            : null}
                        </div>
                      );
                    })}

                    {category.results.length === 0 && (
                      <div className="py-4 text-center">
                        <p className="text-muted-foreground text-xs">
                          {tEditorSeo("no_results_found", {
                            title: category.title.toLowerCase(),
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        })}

        {!canAccessInsights && (
          <>
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              className="border-border bg-light/50 hover:bg-light flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-start text-sm transition-colors"
            >
              <Lock className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0">
                <span className="text-text-default block font-medium">
                  {tEditorSeo("insights.teaser", {
                    count: INSIGHT_KEYS.length,
                  })}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {tEditorSeo("insights.teaser_scored")}
                </span>
              </span>
            </button>
            <UpgradeDialog
              open={showUpgrade}
              onOpenChange={setShowUpgrade}
              contextKey="seo_insights"
            />
          </>
        )}
        <AiUpgrade />
      </div>
    </div>
  );
}
