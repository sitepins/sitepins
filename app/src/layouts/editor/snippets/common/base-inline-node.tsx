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
  label?: string; // e.g. "CODE", "JSX"
  value?: string;
  onValueChange?: (value: string) => void;
  rightControls?: React.ReactNode;
}

const TypeBadge = ({ theme }: { theme: SnippetTheme }) => {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        theme.badge,
      )}
      contentEditable={false}
    >
      {theme.type}
    </span>
  );
};

export const BaseInlineSnippet = withRef<
  typeof PlateElement,
  BaseInlineSnippetProps
>(({ className, theme, label = "CODE", children, ...props }, ref) => {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();

  return (
    <PlateElement
      ref={ref}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md border-2 transition-all",
        theme.border,
        theme.bg,
        "py-1 pr-10 pl-2.5 font-mono text-sm leading-none",
        selected && focused && "ring-2 ring-purple-400 ring-offset-2",
        className,
      )}
      {...props}
    >
      <SnippetControls
        element={element}
        isBlock={false}
        className="top-1/2 right-0.5 -translate-y-1/2 scale-75"
        code=""
      />

      <span
        contentEditable={false}
        className={cn(
          "self-center rounded-sm px-1 py-px text-[9px] font-bold tracking-wider text-white uppercase",
          theme.badge,
        )}
      >
        {theme.type}
      </span>

      {label && label !== "CODE" && (
        <span
          className="text-[9px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400"
          contentEditable={false}
        >
          {label}
        </span>
      )}

      <div className="inline-flex items-center leading-none whitespace-pre">
        {children}
      </div>
    </PlateElement>
  );
});
