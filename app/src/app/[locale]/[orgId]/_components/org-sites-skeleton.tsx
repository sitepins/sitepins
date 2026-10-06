import Container from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgSitesSkeleton() {
  return (
    <Container className="space-y-0">
      {/* Search Header Skeleton */}
      <div className="mb-10 flex items-center justify-between gap-4">
        {/* Search Bar Skeleton */}
        <Skeleton className="h-10 flex-1 rounded-lg" />
        {/* Add New Site Button Skeleton */}
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="border-border flex min-h-24 items-stretch gap-4 overflow-hidden rounded-lg border pe-2 lg:pe-4"
          >
            <div className="flex shrink-0 items-center ps-4 lg:ps-0">
              <Skeleton className="h-12 w-12 rounded-full lg:h-full lg:w-32 lg:rounded-none" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 py-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="hidden w-52 shrink-0 items-center lg:flex">
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="hidden w-28 shrink-0 items-center lg:flex">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="hidden w-44 shrink-0 items-center lg:flex">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex shrink-0 items-center">
              <Skeleton className="size-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
