import Container from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";

export function ConfigsSkeleton() {
  return (
    <div className="flex flex-col">
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
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-10 rounded-md" />
          </div>
        </div>
      </header>

      <Container className="py-10">
        <div className="flex flex-col space-y-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="border-border flex w-full items-center justify-between rounded-lg border px-4 py-3"
            >
              <Skeleton className="h-5 w-32" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-6 rounded" />
                <Skeleton className="h-4 w-6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
