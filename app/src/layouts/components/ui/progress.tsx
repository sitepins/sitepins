"use client";

import { cn } from "@/lib/utils/cn";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

type ProgressProps = ProgressPrimitive.Root.Props & {
  indicatorClassName?: string;
};

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "bg-muted relative h-2.5 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Track className="relative size-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn(
            "bg-primary absolute inset-y-0 left-0 transition-[width] duration-300",
            indicatorClassName,
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
