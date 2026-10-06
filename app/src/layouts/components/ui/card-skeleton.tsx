import {
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

function SkeletonText({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("inline-block h-[1em] max-w-full align-middle", className)}
    />
  );
}

type TCardHeaderSkeletonProps = {
  titleClassName?: string;
  descriptionClassName?: string;
  className?: string;
  children?: ReactNode;
};

// Renders through the real header primitives so spacing can't drift from live cards.
function CardHeaderSkeleton({
  titleClassName = "w-40",
  descriptionClassName = "w-72",
  className,
  children,
}: TCardHeaderSkeletonProps) {
  return (
    <CardHeader className={className}>
      <CardTitle>
        <SkeletonText className={titleClassName} />
      </CardTitle>
      <CardDescription>
        <SkeletonText className={descriptionClassName} />
      </CardDescription>
      {children && <CardAction>{children}</CardAction>}
    </CardHeader>
  );
}

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="text-sm leading-snug">
        <SkeletonText className="w-32" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function FieldGroupSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: count }, (_, i) => (
        <FieldSkeleton key={i} />
      ))}
    </div>
  );
}

export { CardHeaderSkeleton, FieldGroupSkeleton, FieldSkeleton, SkeletonText };
