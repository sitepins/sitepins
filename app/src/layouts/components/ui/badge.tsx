import { cn } from "@/lib/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  "inline-flex justify-center items-center rounded-full border px-2.5 py-0.5 text-xs focus:outline-none focus:ring-0",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary",
        success: "border-success/20 bg-success/10 text-success",
        warning: "border-warning/20 bg-warning/10 text-warning",
        accent: "border-accent/20 bg-accent/10 text-accent",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        muted: "border-muted/20 bg-muted/10 text-muted hover:bg-muted/80",
        outline: "border-border bg-transparent text-foreground",
      },
      size: {
        default: "h-[22px]",
        lg: "w-20 h-6",
        sm: "h-[18px] text-xs px-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
