"use client";

import { cn } from "@/lib/utils/cn";
import { PlateElement, useFocused, useSelected, withRef } from "platejs/react";
import React from "react";
import { SnippetTheme } from "./base-block-node";
import { SnippetControls } from "./snippet-controls";

export interface BaseInlineSnippetProps extends React.ComponentProps<
  typeof PlateElement
> {
  theme: SnippetTheme;
  hideBadge?: boolean;
  head?: React.ReactNode;
}

const pillClass = (theme: SnippetTheme) =>
  cn(
    "inline-flex max-w-full items-baseline rounded-md border px-1 py-px align-baseline leading-[1.4] transition-shadow",
    theme.border,
    theme.bg,
  );

export const BaseInlineSnippet = withRef<
  typeof PlateElement,
  BaseInlineSnippetProps
>(({ className, theme, hideBadge, head, children, ...props }, ref) => {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();
  const isActive = selected && focused;

  return (
    <PlateElement
      ref={ref}
      as="span"
      className={cn(
        "group/snippet relative mx-px inline align-baseline",
        className,
      )}
      {...props}
      attributes={{
        ...props.attributes,
        "data-selected": isActive ? "true" : undefined,
      }}
    >
      <SnippetControls element={element} isBlock={false} code="" />

      <span
        contentEditable={false}
        className={cn(pillClass(theme), isActive && "ring-primary/40 ring-2")}
      >
        {!hideBadge && (
          // h-lh is one tag line tall, so the badge centres on the first line.
          <span className="me-1 inline-flex h-lh shrink-0 items-center self-start text-[0.875em]">
            <span
              className={cn(
                "rounded-[3px] px-1 text-[9px] leading-normal font-bold tracking-wider text-white uppercase select-none",
                theme.badge,
              )}
            >
              {theme.type}
            </span>
          </span>
        )}
        {head}
      </span>

      {children}
    </PlateElement>
  );
});

export const InlineBody = ({
  theme,
  className,
  children,
}: {
  theme: SnippetTheme;
  className?: string;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "text-text-default mx-px rounded-sm [box-decoration-break:clone] px-0.5 [-webkit-box-decoration-break:clone]",
      theme.bg,
      className,
    )}
  >
    {children}
  </span>
);

export const InlineClosingTag = ({
  theme,
  children,
}: {
  theme: SnippetTheme;
  children: React.ReactNode;
}) => (
  <span contentEditable={false} className={pillClass(theme)}>
    <span
      dir="ltr"
      className={cn(
        "font-mono text-[0.875em] font-semibold whitespace-nowrap select-none",
        theme.tagText,
      )}
    >
      {children}
    </span>
  </span>
);
