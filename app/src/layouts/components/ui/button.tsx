import { cn } from "@/lib/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:ring-destructive/40 aria-invalid:border-destructive aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-[3px] aria-invalid:ring-[3px] [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground bg-input/30 hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive! text-destructive-foreground! hover:bg-destructive/80 focus-visible:ring-destructive/20 focus-visible:ring-destructive/40 focus-visible:border-destructive/40 hover:bg-destructive/80",
        warning:
          "bg-warning! text-warning-foreground! hover:bg-warning/80 focus-visible:ring-warning/20 focus-visible:ring-warning/40 focus-visible:border-warning/40 hover:bg-warning/80",
        success:
          "bg-success! text-success-foreground! hover:bg-success/90 border-success hover:border-success/90",
        link: "text-primary underline-offset-4 hover:underline",
        basic: "border-transparent",
      },
      size: {
        default:
          "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xl: "h-12 gap-1.5 px-4.5 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Show a loading spinner and disable the button */
  isLoading?: boolean;
}

function Button({
  className,
  variant = "default",
  size = "lg",
  asChild = false,
  isLoading = false,
  children,
  ...props
}: React.ComponentProps<"button"> & ButtonProps) {
  const Comp = (asChild ? Slot.Root : "button") as any;

  // If loading, ensure button is disabled
  const mergedDisabled = Boolean(props.disabled) || Boolean(isLoading);

  const content = isLoading ? (
    <>
      {children}
      <Loader2 className="ml-2 size-4 animate-spin" />
    </>
  ) : (
    children
  );

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={mergedDisabled}
      {...props}
    >
      {content}
    </Comp>
  );
}

export { Button, buttonVariants };
