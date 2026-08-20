import Container from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";

export function ConfigSkeleton() {
  return (
    <div className="flex flex-col pb-10">
      {/* Editor Header Skeleton */}
      <header className="border-border bg-light sticky inset-s-0 top-0 z-50 flex items-center justify-between border-b px-4 py-4 lg:px-6">
        <div className="flex w-full items-center justify-between">
          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-4">
            <Skeleton className="size-8 rounded-md xl:hidden" />

            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-md md:w-16" />
              <Skeleton className="size-2 rounded-full md:hidden" />
              <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Preview button */}
            <Skeleton className="size-9 rounded-md sm:w-24" />
            {/* Reset button */}
            <Skeleton className="size-9 rounded-md sm:w-20" />
            {/* Save button */}
            <Skeleton className="h-11 w-20 rounded-md" />
          </div>
        </div>
      </header>

      <Container>
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
