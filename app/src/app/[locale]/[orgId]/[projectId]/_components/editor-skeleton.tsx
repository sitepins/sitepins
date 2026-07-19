import { Skeleton } from "@/components/ui/skeleton";
import { Image } from "lucide-react";

export default function EditorSkeleton() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {/* Editor Header Skeleton */}
      <header className="border-border bg-light sticky top-0 left-0 z-50 flex items-center justify-between border-b px-4 py-5 lg:px-6">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Back Button Placeholder */}
            <div className="flex items-center space-x-2">
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>

            {/* Status Badge Placeholder */}
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          <div className="flex items-center space-x-2">
            {/* Action Buttons Placeholder */}
            <Skeleton className="hidden h-7 w-20 rounded-md sm:block" />
            <div className="border-border flex h-7 items-center overflow-hidden rounded-md border">
              <Skeleton className="h-full w-20 rounded-none" />
              <div className="bg-border h-full w-px" />
              <Skeleton className="h-full w-8 rounded-none" />
            </div>
            <Skeleton className="hidden h-7 w-20 rounded-md sm:block" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden 2xl:flex-row">
        {/* tab skeleton */}
        <div className="px-5 pt-5 2xl:hidden">
          <div className="border-border flex h-8 w-full gap-x-1 overflow-hidden rounded-md border p-1 sm:h-9">
            <Skeleton className="h-full flex-1 rounded-sm" />
            <Skeleton className="h-full flex-1 rounded-sm" />
          </div>
        </div>

        {/* Left Side: Frontmatter */}
        <div className="border-border w-full overflow-y-auto border-r p-5 2xl:w-[40%]">
          <div className="space-y-6">
            {/* Title Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            {/* Meta Title Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            {/* Description Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>

            {/* Image Field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <div className="border-border bg-light/50 relative flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-lg border border-dashed">
                <Image className="text-muted size-12 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Editor (Desktop Only) */}
        <div className="bg-background hidden flex-1 flex-col p-5 2xl:flex">
          <div className="border-border flex-1 rounded-lg border">
            {/* Editor Toolbar Skeleton */}
            <div className="border-border mb-4 flex items-center justify-between gap-x-2 border-b p-1">
              <div className="flex items-center gap-x-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className={`h-7 rounded ${i === 0 ? "w-24" : "w-10"}`}
                  />
                ))}
              </div>
              {/* <div className="bg-border mx-2 h-6 w-px" /> */}
              <div className="flex items-center gap-x-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i + 10} className="h-7 w-16 rounded" />
                ))}
              </div>
            </div>

            {/* Editor Content Skeleton */}
            <div className="space-y-6 px-10 pt-4">
              {/* Heading + Text */}
              <div className="space-y-4">
                <Skeleton className="h-8 w-1/3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>

              {/* List Skeleton */}
              <div className="space-y-3 pl-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Skeleton className="size-2 shrink-0 rounded-full" />
                    <Skeleton
                      className={`h-4 ${i === 2 ? "w-1/2" : "w-2/3"}`}
                    />
                  </div>
                ))}
              </div>

              {/* More Text */}
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
