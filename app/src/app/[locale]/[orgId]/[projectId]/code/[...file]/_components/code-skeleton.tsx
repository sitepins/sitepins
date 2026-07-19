import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

export default function CodeSkeleton() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-50 shrink-0">
        {/* Row 1: actions (matches new header) */}
        <div className="border-border bg-light flex items-center justify-between border-b px-4 py-4 lg:px-6">
          {/* Left: back button + file icon + name */}
          <div className="flex items-center space-x-3">
            <Skeleton className="h-8 w-16 rounded-md" /> {/* Back button */}
            <Skeleton className="size-5 rounded-sm" /> {/* File icon */}
            <Skeleton className="h-5 w-36 sm:w-52" /> {/* File name */}
          </div>

          {/* Right: preview + reset + save */}
          <div className="flex items-center space-x-3">
            <Skeleton className="h-9 w-24 rounded-md" /> {/* Preview */}
            <Skeleton className="h-9 w-20 rounded-md" /> {/* Reset */}
            <Skeleton className="h-9 w-20 rounded-md" /> {/* Save */}
          </div>
        </div>

        {/* Row 2: breadcrumb */}
        <div className="border-border bg-light border-b px-4 py-2">
          <div className="flex items-center space-x-2 overflow-x-auto py-1">
            <Skeleton className="h-4 w-12" />
            <ChevronRight className="text-muted-foreground h-3 w-3" />
            <Skeleton className="h-4 w-16" />
            <ChevronRight className="text-muted-foreground h-3 w-3" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      {/* Editor Skeleton Area */}
      <div className="bg-background border-border relative min-h-0 flex-1 overflow-hidden border-b p-4">
        <div className="flex h-full space-x-4">
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
              <div key={i} className="flex space-x-2">
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
