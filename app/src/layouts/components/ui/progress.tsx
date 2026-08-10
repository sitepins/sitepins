"use client";

import { cn } from "@/lib/utils/cn";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "bg-muted relative flex h-1 w-full items-center overflow-x-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Track className="size-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary transition-all"
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
