import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import readingTime from "@/lib/utils/reading-time";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ContentAnalysis({ content }: { content: string }) {
  const tEditorSeo = useTranslations("editor.seo");
  const wordCount = content?.split(" ").length;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value="content-analysis"
        className="border-border rounded-lg border px-4 last:border-b"
      >
        <AccordionTrigger className="text-sm font-normal hover:no-underline">
          <div className="flex items-center">
            <span className="mr-2 inline-block">
              <FileTextIcon className="size-4" />
            </span>
            <span className="font-medium">
              {tEditorSeo("content_analysis")}
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 pb-4">
            <p className="text-text flex items-center justify-between text-sm font-medium">
              <span>{tEditorSeo("word_count")}</span>
              <span className="bg-light rounded-md px-2 py-1">{wordCount}</span>
            </p>
            <p className="text-text flex items-center justify-between text-sm font-medium">
              <span>{tEditorSeo("reading_time")}</span>
              <span>~{readingTime(content)}</span>
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
