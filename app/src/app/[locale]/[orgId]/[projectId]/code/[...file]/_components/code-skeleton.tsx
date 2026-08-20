import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

export default function CodeSkeleton() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      {/* Header Skeleton */}
      <div className="sticky inset-s-0 top-0 z-50 shrink-0">
        {/* Row 1: actions (matches code-editor header) */}
        <div className="border-border bg-light flex items-center justify-between border-b px-4 py-4 lg:px-6">
          {/* Left: sidebar button (xl:hidden) + back button + build status */}
          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <Skeleton className="size-8 rounded-md xl:hidden" />
            <Skeleton className="h-8 w-8 rounded-md md:w-16" />
            <Skeleton className="size-2 rounded-full md:hidden" />
            <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
          </div>

          {/* Right: preview + reset + commit */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Preview button */}
            <Skeleton className="size-9 rounded-md sm:w-24" />
            {/* Reset button */}
            <Skeleton className="size-9 rounded-md sm:w-20" />
            {/* Commit button */}
            <Skeleton className="h-9 w-22 rounded-md" />
          </div>
        </div>

        {/* Row 2: breadcrumb */}
        <div className="border-border bg-light border-b px-4 py-2">
          <div className="flex items-center overflow-x-auto text-xs whitespace-nowrap sm:text-sm">
            <Skeleton className="h-4 w-12 px-1.5" />
            <ChevronRight className="cn-rtl-flip h-3 w-3 min-w-3 opacity-40" />
            <Skeleton className="h-4 w-16 px-1.5" />
            <ChevronRight className="cn-rtl-flip h-3 w-3 min-w-3 opacity-40" />
            <Skeleton className="h-4 w-24 px-1.5" />
          </div>
        </div>
      </div>

      {/* Editor Skeleton Area */}
      <div className="bg-background border-border relative min-h-0 flex-1 overflow-hidden border-b p-4">
        <div className="flex h-full gap-4">
          {/* Line numbers */}
          <div className="hidden w-10 flex-col space-y-3 pt-1 sm:flex">
            {Array.from({ length: 21 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full opacity-20" />
            ))}
          </div>

          {/* Code lines */}
          <div className="flex-1 space-y-3 pt-1">
            {[
              70, 40, 60, 85, 30, 50, 75, 45, 90, 25, 65, 55, 80, 35, 70, 40,
              60, 85, 30, 50,
            ].map((width, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton
                  className="h-4 rounded-sm"
                  style={{ width: `${width}%`, opacity: 0.1 + (i % 5) * 0.05 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
