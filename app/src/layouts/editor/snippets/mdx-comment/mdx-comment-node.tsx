"use client";

import { cn } from "@/lib/utils/cn";
import { PlateElement, useFocused, useSelected, withRef } from "platejs/react";
import type { MdxCommentSlateElement } from "./mdx-comment-serialization";

const SHARED =
  "rounded-md border border-dashed border-slate-300 bg-slate-50/80 font-mono text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300";

const BADGE =
  "rounded-sm bg-slate-400 px-1 py-px text-[9px] font-bold tracking-wider text-white uppercase dark:bg-slate-600";

/**
 * Comments are annotations, not content: muted and dashed so they read as
 * apart from the prose, rather than as another snippet chip.
 */
function useRingClass() {
  const selected = useSelected();
  const focused = useFocused();
  return selected && focused ? "ring-2 ring-slate-400 ring-offset-2" : "";
}

export const MdxCommentBlockElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children, element } = props;
    const value = (element as MdxCommentSlateElement).value || "";
    const ring = useRingClass();

    return (
      <PlateElement
        ref={ref}
        className={cn(
          SHARED,
          "my-2 flex items-start gap-2 px-3 py-2 text-sm",
          ring,
          className,
        )}
        {...props}
      >
        <span className={cn(BADGE, "mt-px shrink-0")} contentEditable={false}>
          comment
        </span>
        <span className="whitespace-pre-wrap" contentEditable={false}>
          {value}
        </span>
        <span className="hidden">{children}</span>
      </PlateElement>
    );
  },
);

export const MdxCommentInlineElement = withRef<typeof PlateElement>(
  ({ className, ...props }, ref) => {
    const { children, element } = props;
    const value = (element as MdxCommentSlateElement).value || "";
    const ring = useRingClass();

    return (
      <PlateElement
        ref={ref}
        className={cn(
          SHARED,
          "inline-flex items-center gap-1.5 px-2 py-0.5 align-middle text-xs leading-none",
          ring,
          className,
        )}
        {...props}
      >
        <span className={BADGE} contentEditable={false}>
          comment
        </span>
        <span className="whitespace-pre" contentEditable={false}>
          {value}
        </span>
        <span className="hidden">{children}</span>
      </PlateElement>
    );
  },
);
