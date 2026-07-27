import { cn } from "@/lib/utils/cn";
import React from "react";

export default function Container({
  children,
  className,
  wrapperClassName,
  fullWidth = false,
}: {
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn("p-4 md:px-6 md:py-8 lg:px-8 lg:py-12", wrapperClassName)}
    >
      <div
        className={cn(
          "mx-auto w-full space-y-6",
          fullWidth ? "max-w-full" : "max-w-7xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
