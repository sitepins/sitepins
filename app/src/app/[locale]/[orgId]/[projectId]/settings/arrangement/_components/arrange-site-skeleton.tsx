import { CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArrangeSiteSkeleton() {
  return (
    <>
      <CardContent>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-b-border flex items-center border-b px-2 py-2 pl-2 last:border-b-0"
          >
            {/* Drag handle skeleton */}
            <Skeleton className="mr-1 size-6 shrink-0 rounded" />

            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center">
                {/* Icon skeleton */}
                <Skeleton className="mr-2 size-6 shrink-0 rounded" />
                {/* Label skeleton */}
                <Skeleton className="h-4 w-32" />
              </div>

              <div className="hidden sm:flex sm:items-center sm:gap-x-2">
                <Skeleton className="size-5 rounded-md" />
                <Skeleton className="size-5 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Skeleton className="h-8 w-full sm:w-32" />
      </CardFooter>
    </>
  );
}
