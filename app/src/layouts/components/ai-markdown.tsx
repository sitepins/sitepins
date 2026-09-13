"use client";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils/cn";
import { Check, Copy } from "lucide-react";
import React, { useMemo, useState } from "react";

interface AiMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Lightweight, zero-dependency Markdown renderer for CMS AI Copilot and Code Assistant responses:
 * - Headings (h1, h2, h3, h4)
 * - Tables
 * - Fenced code blocks with language tag and 1-click copy
 * - Inline code, bold, italic, and external links
 * - Blockquotes and callouts
 * - Ordered and unordered lists
 * - Horizontal separators
 */
export function AiMarkdown({ content, className }: AiMarkdownProps) {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    const normalizedContent = content.replace(/\r\n/g, "\n");
    const lines = normalizedContent.split("\n");
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableRows: string[][] = [];
    let listItems: string[] = [];
    let listType: "ul" | "ol" | null = null;
    let inCodeBlock = false;
    let codeLanguage = "";
    let codeLines: string[] = [];

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const key = `list-${elements.length}`;
        if (listType === "ul") {
          elements.push(
            <ul
              key={key}
              className="text-foreground my-2 flex list-inside list-disc flex-col gap-1 text-xs leading-relaxed"
            >
              {listItems.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {parseInlineMarkdown(item)}
                </li>
              ))}
            </ul>,
          );
        } else {
          elements.push(
            <ol
              key={key}
              className="text-foreground my-2 flex list-inside list-decimal flex-col gap-1 text-xs leading-relaxed"
            >
              {listItems.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {parseInlineMarkdown(item)}
                </li>
              ))}
            </ol>,
          );
        }
        listItems = [];
        listType = null;
      }
    };

    const flushTable = () => {
      if (tableRows.length > 0) {
        const key = `table-${elements.length}`;
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(1).filter((row) => {
          return !row.every((cell) => {
            const trimmedCell = cell.trim();
            return /^:?-+:?$/.test(trimmedCell) || trimmedCell === "";
          });
        });

        elements.push(
          <div
            key={key}
            className="border-border bg-card my-2.5 overflow-x-auto rounded-lg border shadow-xs"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-border bg-muted/60 text-muted-foreground border-b font-medium">
                <tr>
                  {headerRow.map((h, i) => (
                    <th
                      key={i}
                      className="border-border/50 text-foreground border-r px-3 py-2 font-semibold whitespace-nowrap last:border-r-0"
                    >
                      {parseInlineMarkdown(h.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border/60 bg-card divide-y">
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-muted/30 odd:bg-muted/10 transition-colors"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="border-border/40 text-foreground/90 border-r px-3 py-2 align-top leading-relaxed last:border-r-0"
                      >
                        {parseTableCellContent(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        tableRows = [];
        inTable = false;
      }
    };

    const flushCodeBlock = () => {
      if (inCodeBlock) {
        const key = `codeblock-${elements.length}`;
        const fullCode = codeLines.join("\n");
        elements.push(
          <CodeBlockItem key={key} language={codeLanguage} code={fullCode} />,
        );
        codeLines = [];
        inCodeBlock = false;
        codeLanguage = "";
      }
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const trimmed = line.trim();

      // Fenced code block ```
      if (trimmed.startsWith("```")) {
        flushList();
        flushTable();
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Table row
      if (
        trimmed.startsWith("|") &&
        (trimmed.endsWith("|") || trimmed.includes("|"))
      ) {
        flushList();
        inTable = true;
        let rowString = trimmed;
        if (rowString.startsWith("|")) rowString = rowString.slice(1);
        if (rowString.endsWith("|")) rowString = rowString.slice(0, -1);
        const cells = rowString.split("|").map((c) => c.trim());
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Empty lines
      if (!trimmed) {
        flushList();
        continue;
      }

      // Horizontal separator
      if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        flushList();
        elements.push(
          <Separator key={`sep-${index}`} className="border-border my-3" />,
        );
        continue;
      }

      // Headings
      if (trimmed.startsWith("# ")) {
        flushList();
        elements.push(
          <h1
            key={`h1-${index}`}
            className="text-foreground mt-4 mb-2 text-base font-bold tracking-tight sm:text-lg"
          >
            {parseInlineMarkdown(trimmed.slice(2))}
          </h1>,
        );
        continue;
      }

      if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h2
            key={`h2-${index}`}
            className="border-border/70 text-foreground mt-3.5 mb-1.5 border-b pb-1 text-sm font-semibold tracking-tight sm:text-base"
          >
            {parseInlineMarkdown(trimmed.slice(3))}
          </h2>,
        );
        continue;
      }

      if (trimmed.startsWith("### ")) {
        flushList();
        elements.push(
          <h3
            key={`h3-${index}`}
            className="text-foreground mt-3 mb-1 text-xs font-semibold sm:text-sm"
          >
            {parseInlineMarkdown(trimmed.slice(4))}
          </h3>,
        );
        continue;
      }

      if (trimmed.startsWith("#### ")) {
        flushList();
        elements.push(
          <h4
            key={`h4-${index}`}
            className="text-foreground mt-2.5 mb-1 text-xs font-semibold tracking-wider uppercase"
          >
            {parseInlineMarkdown(trimmed.slice(5))}
          </h4>,
        );
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith("> ")) {
        flushList();
        elements.push(
          <blockquote
            key={`quote-${index}`}
            className="border-primary bg-muted/30 text-muted-foreground my-2 rounded-e border-s-2 py-1.5 ps-3 pe-3 text-xs italic"
          >
            {parseInlineMarkdown(trimmed.slice(2))}
          </blockquote>,
        );
        continue;
      }

      // Lists
      if (
        trimmed.startsWith("- ") ||
        trimmed.startsWith("* ") ||
        trimmed.startsWith("• ")
      ) {
        if (listType !== "ul") {
          flushList();
          listType = "ul";
        }
        listItems.push(trimmed.slice(2));
        continue;
      }

      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        if (listType !== "ol") {
          flushList();
          listType = "ol";
        }
        listItems.push(numMatch[2]);
        continue;
      }

      // Regular Paragraph
      flushList();
      elements.push(
        <p
          key={`p-${index}`}
          className="text-foreground my-1.5 text-xs leading-relaxed select-text"
        >
          {parseInlineMarkdown(trimmed)}
        </p>,
      );
    }

    flushList();
    flushTable();
    flushCodeBlock();

    return elements;
  }, [content]);

  return (
    <div
      className={cn(
        "text-foreground flex flex-col gap-0.5 font-sans leading-normal break-words",
        className,
      )}
    >
      {renderedElements}
    </div>
  );
}

function CodeBlockItem({
  language,
  code,
}: {
  language?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-border bg-muted/40 relative my-2 overflow-hidden rounded-lg border font-mono text-xs">
      <div className="border-border bg-muted/70 text-muted-foreground flex items-center justify-between border-b px-3 py-1 text-[11px]">
        <span>{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-foreground flex cursor-pointer items-center gap-1 rounded p-0.5"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="text-success size-3" />
              <span className="text-success text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="text-foreground overflow-x-auto p-2.5 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseTableCellContent(cell: string): React.ReactNode {
  const lines = cell.split(/<br\s*\/?>/i);

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
          const bulletText = trimmed.replace(/^[•-]\s*/, "");
          return (
            <div key={lIdx} className="flex items-start gap-1.5">
              <span className="text-primary shrink-0 leading-tight font-bold">
                •
              </span>
              <span className="leading-tight">
                {parseInlineMarkdown(bulletText)}
              </span>
            </div>
          );
        }

        return (
          <div key={lIdx} className="leading-tight">
            {parseInlineMarkdown(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/);
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/);
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*(.*)$/);

    const matches: Array<{
      type: "link" | "code" | "bold" | "italic";
      index: number;
      full: RegExpMatchArray;
    }> = [];

    if (linkMatch && linkMatch.index !== undefined) {
      matches.push({
        type: "link",
        index: linkMatch[1].length,
        full: linkMatch,
      });
    }
    if (codeMatch && codeMatch.index !== undefined) {
      matches.push({
        type: "code",
        index: codeMatch[1].length,
        full: codeMatch,
      });
    }
    if (boldMatch && boldMatch.index !== undefined) {
      matches.push({
        type: "bold",
        index: boldMatch[1].length,
        full: boldMatch,
      });
    }
    if (italicMatch && italicMatch.index !== undefined) {
      matches.push({
        type: "italic",
        index: italicMatch[1].length,
        full: italicMatch,
      });
    }

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    const prefix = earliest.full[1];
    if (prefix) {
      parts.push(prefix);
    }

    if (earliest.type === "link") {
      const label = earliest.full[2];
      const href = earliest.full[3]?.trim() || "";
      const isSafe =
        href.startsWith("/") ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:");

      if (isSafe) {
        const isExternal =
          href.startsWith("http://") || href.startsWith("https://");
        parts.push(
          <a
            key={`link-${keyIndex++}`}
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer noopener" : undefined}
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
      remaining = earliest.full[4];
    } else if (earliest.type === "code") {
      const target = earliest.full[2];
      parts.push(
        <code
          key={`code-${keyIndex++}`}
          className="border-border bg-muted text-foreground rounded border px-1 py-0.5 font-mono text-[11px] font-medium"
        >
          {target}
        </code>,
      );
      remaining = earliest.full[3];
    } else if (earliest.type === "bold") {
      const target = earliest.full[2];
      parts.push(
        <strong
          key={`bold-${keyIndex++}`}
          className="text-foreground font-semibold"
        >
          {target}
        </strong>,
      );
      remaining = earliest.full[3];
    } else if (earliest.type === "italic") {
      const target = earliest.full[2];
      parts.push(
        <em key={`italic-${keyIndex++}`} className="text-foreground/80 italic">
          {target}
        </em>,
      );
      remaining = earliest.full[3];
    }
  }

  return <>{parts}</>;
}
