"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  Caption as CaptionPrimitive,
  CaptionTextarea as CaptionTextareaPrimitive,
  useCaptionButton,
  useCaptionButtonState,
} from "@platejs/caption/react";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { createPrimitiveComponent } from "platejs/react";

const captionVariants = cva("max-w-full", {
  defaultVariants: {
    align: "center",
  },
  variants: {
    align: {
      center: "mx-auto",
      left: "mr-auto",
      right: "ml-auto",
    },
  },
});

export function Caption({
  align,
  className,
  ...props
}: React.ComponentProps<typeof CaptionPrimitive> &
  VariantProps<typeof captionVariants>) {
  return (
    <CaptionPrimitive
      {...props}
      className={cn(captionVariants({ align }), className)}
    />
  );
}

export function CaptionTextarea(
  props: React.ComponentProps<typeof CaptionTextareaPrimitive>,
) {
  return (
    <div className="border-border/60 bg-muted/30 focus-within:border-border/60 mt-2 flex items-start gap-1.5 rounded-md border border-dashed px-2 py-1">
      <span className="text-muted-foreground/70 mt-0.5 shrink-0 font-mono text-[10px] font-semibold tracking-wider uppercase select-none">
        Alt
      </span>
      <CaptionTextareaPrimitive
        {...props}
        className={cn(
          props.className,
          "text-muted-foreground w-full resize-none border-none bg-transparent px-0 py-0 text-xs italic",
          "focus:ring-0 focus:outline-none focus:placeholder:opacity-0",
          "print:placeholder:text-transparent",
        )}
      />
    </div>
  );
}

export const CaptionButton = createPrimitiveComponent(Button)({
  propsHook: useCaptionButton,
  stateHook: useCaptionButtonState,
});
