import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TField } from "@/types";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function SeoAnalysis({
  results,
  schema,
}: {
  results: Record<string, any>;
  schema: TField[];
}) {
  const tEditorSeo = useTranslations("editor.seo");

  const resultsArray = Object.keys(results).map((key) => {
    return {
      name: schema.find((field) => field.name === key)?.label || key,
      ...results[key],
    };
  });

  const goodResults = resultsArray.filter((result) => result.valid === true);
  const improvements = resultsArray.filter(
    (result) => result.valid === undefined,
  );
  const issues = resultsArray.filter((result) => result.valid === false);

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
  ];

  const getStatusIcon = (valid: boolean | undefined) => {
    if (valid === true) return <CheckCircle className="text-success size-4" />;
    if (valid === false) return <XCircle className="text-destructive size-4" />;
    return <AlertTriangle className="text-warning size-4" />;
  };

  const getProgressBarColor = (valid: boolean | undefined) => {
    if (valid === true) return "bg-success";
    if (valid === false) return "bg-destructive";
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
                            {getStatusIcon(result.valid)}
                            <span className="text-card-foreground truncate text-sm font-medium">
                              {result.name}
                            </span>
                          </div>
                        </div>

                        {result.value && (
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
                                  className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(result.valid)}`}
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
      </div>
    </Card>
  );
}
