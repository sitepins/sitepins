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
    <CaptionTextareaPrimitive
      {...props}
      className={cn(
        props.className,
        "focus:ring-border mt-2 w-full resize-none rounded-sm border-none bg-inherit px-3 py-1 font-[inherit] text-inherit",
        "focus:outline-none focus:placeholder:opacity-0",
        "print:placeholder:text-transparent",
      )}
    />
  );
}

export const CaptionButton = createPrimitiveComponent(Button)({
  propsHook: useCaptionButton,
  stateHook: useCaptionButtonState,
});
