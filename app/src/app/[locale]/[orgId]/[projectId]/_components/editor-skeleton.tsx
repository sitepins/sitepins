import { Skeleton } from "@/components/ui/skeleton";
import { Image as ImageIcon } from "lucide-react";

function FrontmatterSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <div className="border-border bg-light/50 relative flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-lg border border-dashed">
          <ImageIcon className="text-muted size-12 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-background flex h-10 shrink-0 items-center justify-between overflow-hidden rounded-lg border p-1">
        <div className="flex min-w-0 items-center">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`mx-0.5 h-8 shrink-0 rounded ${i === 0 ? "w-24" : "w-10"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 pt-4 lg:pt-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
        <div className="space-y-3 ps-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className={`h-4 ${i === 2 ? "w-1/2" : "w-2/3"}`} />
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}

export default function EditorSkeleton() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="border-border bg-light sticky inset-s-0 top-0 z-50 flex items-center justify-between border-b px-4 py-4 lg:px-6">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-9 rounded-md sm:w-24" />
            <Skeleton className="h-7 w-9 rounded-md sm:w-20" />
            <Skeleton className="h-7 w-9 rounded-md sm:w-20" />
            <div className="border-border flex h-7 items-center overflow-hidden rounded-md border">
              <Skeleton className="h-full w-20 rounded-none" />
              <div className="bg-border h-full w-px" />
              <Skeleton className="h-full w-8 rounded-none" />
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col p-5 pb-0 2xl:hidden">
          <div className="border-border mb-4 flex h-8 w-full gap-x-2 overflow-hidden rounded-md border p-1 sm:h-9">
            <Skeleton className="h-full flex-1 rounded-sm" />
            <Skeleton className="h-full flex-1 rounded-sm" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-hidden">
            <FrontmatterSkeleton />
          </div>
        </div>

        <div className="hidden h-full 2xl:flex">
          <div className="border-border w-[40%] overflow-y-auto border-e p-5">
            <FrontmatterSkeleton />
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-full p-4 lg:p-6">
              <ContentSkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
