import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { getSeoStatus, type TSeoStatus } from "@/lib/utils/seo-validate";
import { TField } from "@/types";
import {
  AlertTriangle,
  CheckCircle,
  Lock,
  MinusCircle,
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
  name: string;
  status: TSeoStatus;
  valid?: boolean;
  value?: any;
  length?: number;
  percentage?: number;
  tip?: string;
};

export default function SeoAnalysis({
  results,
  schema,
  insightsResults = {},
  canAccessInsights = true,
}: {
  results: Record<string, any>;
  schema: TField[];
  insightsResults?: Record<string, any>;
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

  const getStatusIcon = (status: TSeoStatus) => {
    if (status === "pass")
      return <CheckCircle className="text-success size-4" />;
    if (status === "fail")
      return <XCircle className="text-destructive size-4" />;
    if (status === "na")
      return <MinusCircle className="text-muted-foreground size-4" />;
    return <AlertTriangle className="text-warning size-4" />;
  };

  const getProgressBarColor = (status: TSeoStatus) => {
    if (status === "pass") return "bg-success";
    if (status === "fail") return "bg-destructive";
    if (status === "na") return "bg-muted-foreground/40";
    return "bg-warning";
  };

  return (
    <Card className="border-border bg-background max-w-sm border p-4 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="px-0 pt-0 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-normal">
          <span>{tEditorSeo("analysis_summary")}</span>
        </CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {categories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Accordion key={category.id} type="single" collapsible>
              <AccordionItem
                value={category.id}
                className={`border-border rounded-lg border ${category.borderColor} ${category.bgColor} px-4 last:border-b`}
              >
                <AccordionTrigger className="text-sm font-medium hover:no-underline">
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
                <AccordionContent>
                  <div className="space-y-3 pb-1">
                    {category.results.map((result, index) => (
                      <div
                        key={result.key || `result-${index}`}
                        className="bg-card border-border rounded-md border p-3 shadow-sm"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            {getStatusIcon(result.status)}
                            <span className="text-card-foreground truncate text-sm font-medium">
                              {result.name}
                            </span>
                          </div>
                        </div>

                        {result.value !== undefined && result.value !== "" && (
                          <div className="mb-2">
                            <span className="text-muted-foreground text-xs font-medium">
                              {tEditorSeo("current")}
                            </span>
                            <div className="bg-muted/50 text-card-foreground wrap-break-words mt-1 rounded-md p-2 text-xs">
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
                          <div className="bg-muted/40 text-muted-foreground border-l-border rounded-md border-l-2 p-2 text-xs">
                            <span className="font-medium">
                              💡 {tEditorSeo("recommendation")}
                            </span>
                            <p className="wrap-break-words mt-1">
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
    </Card>
  );
}
