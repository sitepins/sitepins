"use client";

import { cn } from "@/lib/utils/cn";
import { PlateElement, useFocused, useSelected, withRef } from "platejs/react";
import React from "react";
import { SnippetControls } from "./snippet-controls";

export interface SnippetTheme {
  type: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  tagText: string;
}

export const DEFAULT_SNIPPET_THEME: SnippetTheme = {
  type: "SNIPPET",
  bg: "bg-gray-50 dark:bg-gray-900",
  border: "border-gray-200 dark:border-gray-800",
  text: "text-gray-800 dark:text-gray-200",
  badge: "bg-gray-500",
  tagText: "text-gray-600 dark:text-gray-400",
};

export interface BaseSnippetBlockProps extends React.ComponentProps<
  typeof PlateElement
> {
  theme: SnippetTheme;
  label?: string;
  rightControls?: React.ReactNode;
  titleExtra?: React.ReactNode;
  snippetExtraControls?: React.ReactNode; // extra buttons injected into the SnippetControls group
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  contentClassName?: string;
  hideContent?: boolean;
}

export const TypeBadge = ({
  theme,
  className,
}: {
  theme: SnippetTheme;
  className?: string;
}) => {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-sm px-1.5 py-px text-[10px] leading-4 font-bold tracking-wider text-white uppercase select-none",
        theme.badge,
        className,
      )}
      contentEditable={false}
    >
      {theme.type}
    </span>
  );
};

export const BaseSnippetBlock = withRef<
  typeof PlateElement,
  BaseSnippetBlockProps
>(
  (
    {
      className,
      theme,
      label,
      rightControls,
      titleExtra,
      snippetExtraControls,
      headerContent,
      footerContent,
      contentClassName,
      hideContent,
      children,
      ...props
    },
    ref,
  ) => {
    const { element } = props;
    const selected = useSelected();
    const focused = useFocused();

    return (
      <PlateElement
        ref={ref}
        className={cn(
          "group/snippet relative my-3 block w-full max-w-full min-w-0 overflow-hidden rounded-lg border shadow-xs",
          theme.bg,
          theme.border,
          "text-text-default",
          selected &&
            focused &&
            "ring-primary/40 ring-offset-background ring-2 ring-offset-1",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex min-h-9 items-center gap-2 border-b px-3 py-1.5",
            theme.border,
          )}
          contentEditable={false}
        >
          <TypeBadge theme={theme} />
          {label && (
            <span className="text-muted-foreground truncate text-[10px] font-medium tracking-wide uppercase select-none">
              {label}
            </span>
          )}
          {titleExtra}
          <SnippetControls
            element={element}
            extraControls={snippetExtraControls}
          />
          {rightControls}
        </div>

        <div className="flex min-w-0 flex-col gap-2 px-3 py-2.5">
          {headerContent && <div className="min-w-0">{headerContent}</div>}

          <div
            className={cn(
              "w-full min-w-0 border-s-2 ps-3",
              theme.border,
              contentClassName,
              hideContent && "hidden",
            )}
          >
            <div className="flex w-full min-w-0 flex-col items-stretch">
              {children}
            </div>
          </div>

          {footerContent && <div className="min-w-0">{footerContent}</div>}
        </div>
      </PlateElement>
    );
  },
);
