import Container from "@/components/container";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectOverviewSkeleton() {
  return (
    <Container>
      {/* Project Overview Skeleton */}
      <div className="border-border bg-card text-card-foreground grid grid-cols-1 md:grid-cols-12 rounded-lg border">
        <div className="relative flex items-center justify-center p-6 md:col-span-7 lg:col-span-6">
          <Skeleton className="aspect-video w-full rounded-md" />
        </div>
        <div className="flex flex-col justify-start px-6 pb-6 md:col-span-5 md:px-0 md:pt-6 lg:col-span-6">
          <ul className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <li key={i}>
                <Skeleton className="mb-1 h-3 w-20" />
                <Skeleton className="h-5 w-40" />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Latest Changes Skeleton */}
      <Card>
        <CardHeader className="border-border border-b p-4">
          <Skeleton className="mb-2 h-7 w-full max-w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="px-0 pb-4">
          <div className="space-y-4 px-4 py-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-start space-x-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}
