import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function McpConnectionSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-36" descriptionClassName="w-96" />

      <CardContent>
        <div className="divide-border border-border divide-y rounded-xl border">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="grid w-full grid-cols-[auto_1fr] gap-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-full max-w-36" />
                  <Skeleton className="h-3 w-full max-w-56" />
                  <Skeleton className="h-3 w-full max-w-72" />
                </div>
              </div>
              <Skeleton className="h-8 w-full md:w-16" />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-9 w-full sm:w-36" />
      </CardFooter>
    </Card>
  );
}
