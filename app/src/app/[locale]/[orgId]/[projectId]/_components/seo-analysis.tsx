import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import {
  getSeoStatus,
  type TSeoResults,
  type TSeoStatus,
} from "@/lib/utils/seo-validate";
import { TField } from "@/types";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Lock,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
}: {
  results: TSeoResults;
  schema: TField[];
  insightsResults?: TSeoResults;
  canAccessInsights?: boolean;
}) {
  const tEditorSeo = useTranslations("editor.seo");
  const [showUpgrade, setShowUpgrade] = useState(false);

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
      bgColor: "bg-muted/40",
      borderColor: "border-border",
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
    <div className="space-y-3">
      <h3 className="text-sm font-normal">{tEditorSeo("analysis_summary")}</h3>
      <div className="space-y-2">
        {categories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Accordion key={category.id}>
              <AccordionItem
                value={category.id}
                className={`overflow-hidden rounded-lg border ${category.borderColor} last:border-b`}
              >
                <AccordionTrigger
                  className={`rounded-none px-4 py-3 text-sm font-medium hover:no-underline ${category.bgColor} aria-expanded:border-b-0`}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <IconComponent className={`size-4 ${category.iconColor}`} />
                    <span>{category.title}</span>
                    <Badge
                      variant="muted"
                      className="bg-background/80 text-text ml-auto text-xs font-normal"
                    >
                      {category.count}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-background/40 px-4 pt-4">
                  <div className="space-y-4 pb-1">
                    {category.results.map((result, index) => (
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
                                className="max-w-64 text-left"
                              >
                                {tEditorSeo(
                                  `explanations.${getMetricExplanationKey(result.metricKey)}`,
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        {result.value !== undefined && result.value !== "" && (
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
                          <div className="text-muted-foreground border-border/60 mt-3 border-l-2 pl-3 text-xs">
                            <span className="font-medium not-italic">
                              {tEditorSeo("recommendation")}
                            </span>
                            <p className="wrap-break-words mt-1 leading-relaxed italic">
                              {result.tip}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}

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
              className="border-border bg-light/50 hover:bg-light flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-left text-sm transition-colors"
            >
              <Lock className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0">
                <span className="text-text block font-medium">
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
      </div>
    </div>
  );
}
