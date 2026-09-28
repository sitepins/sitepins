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
    "inline rounded-md border [box-decoration-break:clone] px-1 py-px align-baseline font-mono whitespace-nowrap text-[0.875em] transition-shadow [-webkit-box-decoration-break:clone]",
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
      className={cn("mx-px inline align-baseline", className)}
      {...props}
    >
      <span
        contentEditable={false}
        className={cn(pillClass(theme), isActive && "ring-primary/40 ring-2")}
      >
        {!hideBadge && (
          <span
            className={cn(
              "font-primary relative top-[-0.08em] rounded-[3px] px-1 py-px align-middle text-[9px] font-bold tracking-wider text-white uppercase select-none",
              theme.badge,
            )}
          >
            {theme.type}
          </span>
        )}
        <SnippetControls element={element} isBlock={false} />
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
        "font-semibold whitespace-nowrap select-none",
        theme.tagText,
      )}
    >
      {children}
    </span>
  </span>
);
