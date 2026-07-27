import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { extractLinks } from "@/lib/utils/link-analyzer";
import { LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface LinkAnalysisResult {
  internalLinks: number;
  externalLinks: number;
  totalLinks: number;
  internalUrls: string[];
  externalUrls: string[];
}

// Function to analyze markdown content and count internal/external links
export function analyzeMarkdownLinks(
  markdownContent: string,
  baseUrl?: string,
): LinkAnalysisResult {
  const result: LinkAnalysisResult = {
    internalLinks: 0,
    externalLinks: 0,
    totalLinks: 0,
    internalUrls: [],
    externalUrls: [],
  };

  if (!markdownContent) return result;

  const links = extractLinks(markdownContent, baseUrl);

  result.totalLinks = links.length;

  links.forEach((link) => {
    if (link.isInternal) {
      result.internalLinks++;
      result.internalUrls.push(link.url);
    } else {
      result.externalLinks++;
      result.externalUrls.push(link.url);
    }
  });

  return result;
}

export default function LinkAnalysis({
  totalLinks,
  internalLinks,
  externalLinks,
}: {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
}) {
  const tEditorSeo = useTranslations("editor.seo");

  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value="content-analysis"
        className="border-border rounded-lg border px-4 last:border-b"
      >
        <AccordionTrigger className="text-sm font-normal hover:no-underline">
          <div className="flex items-center">
            <span className="mr-2 inline-block">
              <LinkIcon className="size-4" />
            </span>
            <span className="font-medium">{tEditorSeo("link_analysis")}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 pb-4">
            <p className="flex items-center justify-between text-sm font-medium">
              <span>{tEditorSeo("total_links")}</span>
              <span className="bg-light rounded-md px-2 py-1">
                {totalLinks}
              </span>
            </p>
            <p className="flex items-center justify-between text-sm font-medium">
              <span>{tEditorSeo("internal_links")}</span>
              <span className="text-success bg-success/10 rounded-md px-2 py-1">
                {internalLinks}
              </span>
            </p>
            <p className="flex items-center justify-between text-sm font-medium">
              <span>{tEditorSeo("external_links")}</span>
              <span className="bg-accent/10 text-accent rounded-md px-2 py-1">
                {externalLinks}
              </span>
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
