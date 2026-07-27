import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function GeneralSettingsSkeleton() {
  return (
    <>
      {/* Organization Thumbnail Card */}
      <Card>
        <CardContent className="flex flex-col-reverse justify-between gap-3 sm:gap-4 md:flex-row">
          <div className="space-y-2.5">
            <Skeleton className="h-6 w-52 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="size-20 rounded-full" />
        </CardContent>
      </Card>

      {/* Organization Name Card */}
      <Card>
        <CardContent>
          <div className="space-y-2.5">
            <Skeleton className="h-6 w-44 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="mt-8 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-8 w-full sm:w-20" />
        </CardFooter>
      </Card>

      {/* Archive Organization Card */}
      <Card>
        <CardContent>
          <div className="space-y-2.5">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="h-4 w-xl max-w-full" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-8 w-full sm:w-44" />
        </CardFooter>
      </Card>
    </>
  );
}
