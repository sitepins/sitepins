import Container from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgSitesSkeleton() {
  return (
    <Container className="space-y-0">
      {/* Search Header Skeleton */}
      <div className="mb-8 flex items-center gap-4">
        {/* Search Bar Skeleton */}
        <Skeleton className="h-10 flex-1 rounded-lg" />
        {/* Add New Site Button Skeleton */}
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Table Header Skeleton - Hidden on mobile */}
      <div className="bg-light hidden grid-cols-12 rounded-lg px-8 py-2.5 md:grid">
        <Skeleton className="col-span-6 h-5 w-24" />
        <Skeleton className="col-span-4 h-5 w-28" />
        <Skeleton className="col-span-2 ml-auto h-5 w-16" />
      </div>

      {/* Site Items Skeleton */}
      <div className="mt-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="border-border/60 relative flex grid-cols-12 items-center gap-x-3 overflow-hidden rounded-lg border px-2.5 *:py-8 md:grid lg:gap-x-0 lg:px-0"
          >
            {/* Avatar + Name Section */}
            <div className="col-span-6 flex h-full items-center space-x-5 px-1 py-0!">
              {/* Avatar */}
              <Skeleton className="h-12 w-12 rounded-full lg:h-20 lg:w-47 lg:rounded-sm" />
              {/* Name - Hidden on mobile */}
              <Skeleton className="hidden h-6 w-32 md:block" />
            </div>

            {/* Repository Section */}
            <div className="col-span-4 w-full">
              {/* Mobile: Project Name + Status */}
              <div className="flex justify-between md:hidden">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              {/* Desktop: Repository Link */}
              <Skeleton className="hidden h-5 w-3/4 md:block" />
            </div>

            {/* Status Section - Hidden on mobile */}
            <div className="col-span-2 mr-6 hidden md:flex md:items-center md:justify-end">
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
