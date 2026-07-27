import { Skeleton } from "@/components/ui/skeleton";

export function SnippetSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border-border flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-full max-w-32" />
            </div>
            <Skeleton className="h-3 w-full max-w-48" />
          </div>
          <Skeleton className="h-7 w-10 sm:w-16" />
        </div>
      ))}
    </div>
  );
}
