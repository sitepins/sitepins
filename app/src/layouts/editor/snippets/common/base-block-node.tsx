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

const TypeBadge = ({
  theme,
  label,
}: {
  theme: SnippetTheme;
  label?: string;
}) => {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        theme.badge,
        "text-white",
      )}
      contentEditable={false}
    >
      {label || theme.type}
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
          "relative block w-full max-w-full min-w-0 overflow-hidden rounded-lg border-2 font-mono text-sm shadow-sm",
          hideContent ? "my-1 p-3" : "my-3 p-4",
          theme.bg,
          theme.border,
          theme.text,
          selected && focused && "ring-primary ring-2 ring-offset-2", // Generalized ring color or use theme
          className,
        )}
        {...props}
      >
        <SnippetControls
          element={element}
          extraControls={snippetExtraControls}
        />

        {rightControls}

        <div className={cn(!hideContent && "mb-3")}>
          <div className="mb-2 flex items-center gap-2" contentEditable={false}>
            <TypeBadge theme={theme} label={theme.type} />
            {label && (
              <span className="text-[10px] tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {label}
              </span>
            )}
            {titleExtra && (
              <div className="ml-auto" contentEditable={false}>
                {titleExtra}
              </div>
            )}
          </div>
          {getHeaderContent(headerContent)}
        </div>

        <div
          className={cn(
            "my-3 w-full overflow-hidden border-l-2 pl-2",
            theme.border,
            contentClassName,
            hideContent && "hidden",
          )}
        >
          <div className="flex w-full min-w-0 flex-col items-start">
            {children}
          </div>
        </div>
        {footerContent && (
          <div className="w-full min-w-0">
            <div className="flex w-full min-w-0 flex-col items-start">
              {footerContent}
            </div>
          </div>
        )}
      </PlateElement>
    );
  },
);

function getHeaderContent(content: React.ReactNode) {
  if (!content) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-col items-start">{content}</div>
    </div>
  );
}
