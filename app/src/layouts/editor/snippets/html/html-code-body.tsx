"use client";

import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { ContentEditableSpan } from "../common/editable-tag-line";

type TokenType = "text" | "tag" | "attr" | "eq" | "value" | "comment";

interface Token {
  type: TokenType;
  text: string;
}

const COLLAPSED_LINES = 12;

export function tokenizeHtml(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const next = end === -1 ? src.length : end + 3;
      tokens.push({ type: "comment", text: src.slice(i, next) });
      i = next;
      continue;
    }

    const open = /^<\/?[A-Za-z!][\w:.-]*/.exec(src.slice(i));
    if (open) {
      tokens.push({ type: "tag", text: open[0] });
      i += open[0].length;
      let prev = "tag" as TokenType;

      while (i < src.length) {
        const rest = src.slice(i);
        const close = /^\/?>/.exec(rest);
        if (close) {
          tokens.push({ type: "tag", text: close[0] });
          i += close[0].length;
          break;
        }

        const match = /^\s+/.exec(rest) ??
          /^"[^"]*"?/.exec(rest) ??
          /^'[^']*'?/.exec(rest) ??
          /^=/.exec(rest) ??
          /^[^\s=>"'/]+/.exec(rest) ?? [rest[0]];
        const text = match[0];
        const type: TokenType = /^\s/.test(text)
          ? "text"
          : text === "="
            ? "eq"
            : /^["']/.test(text) || prev === "eq"
              ? "value"
              : "attr";

        tokens.push({ type, text });
        if (type !== "text") prev = type;
        i += text.length;
      }
      continue;
    }

    const next = src.indexOf("<", i + 1);
    const end = next === -1 ? src.length : next;
    tokens.push({ type: "text", text: src.slice(i, end) });
    i = end;
  }

  return tokens;
}

const TOKEN_CLASS: Record<TokenType, string> = {
  text: "text-text-default",
  tag: "font-semibold text-emerald-700 dark:text-emerald-400",
  attr: "text-yellow-600 dark:text-yellow-400",
  eq: "text-slate-400 dark:text-slate-500",
  value: "text-emerald-600 dark:text-emerald-300",
  comment: "text-muted-foreground italic",
};

export const HtmlCodeBody = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const [expanded, setExpanded] = useState(false);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  const lineCount = draft.split("\n").length;
  const collapsible = lineCount > COLLAPSED_LINES + 3;
  const collapsed = collapsible && !expanded;

  return (
    <div className="w-full min-w-0" contentEditable={false} dir="ltr">
      <div
        className={cn(
          "overflow-x-auto rounded-md bg-black/3 font-mono text-[13px] leading-normal dark:bg-black/25",
          collapsed &&
            "overflow-y-hidden mask-[linear-gradient(to_bottom,black_calc(100%-3rem),transparent)]",
        )}
        style={
          collapsed ? { maxHeight: `${COLLAPSED_LINES * 1.5 + 1.5}em` } : {}
        }
      >
        <div
          className="grid w-max min-w-full px-3 py-2.5"
          style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
        >
          <span
            className="pointer-events-none whitespace-pre select-none"
            aria-hidden="true"
            style={{ gridArea: "1/1" }}
          >
            {tokenizeHtml(draft).map((token, i) => (
              <span key={i} className={TOKEN_CLASS[token.type]}>
                {token.text}
              </span>
            ))}
            {/* Keeps a trailing newline visible as an empty last line. */}
            {draft.endsWith("\n") && " "}
          </span>
          <ContentEditableSpan
            value={draft}
            multiline
            onChange={(next) => {
              setDraft(next);
              onChange(next);
            }}
            className="relative z-10 min-h-[1.5em] whitespace-pre text-transparent caret-stone-900 outline-none dark:caret-stone-100"
            style={{ gridArea: "1/1" }}
          />
        </div>
      </div>

      {collapsible && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="text-muted-foreground hover:text-text-strong mt-1.5 inline-flex items-center gap-1 font-sans text-xs transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" /> Show all {lineCount} lines
            </>
          )}
        </button>
      )}
    </div>
  );
};
