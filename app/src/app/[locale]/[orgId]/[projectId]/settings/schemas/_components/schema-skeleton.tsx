import { Skeleton } from "@/components/ui/skeleton";

export default function SchemaSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border-border flex items-center justify-between rounded-lg border p-4"
        >
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="hidden h-7 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
