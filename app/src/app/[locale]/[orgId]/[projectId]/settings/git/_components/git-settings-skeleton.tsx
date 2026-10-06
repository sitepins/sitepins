import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function GitSettingsSkeleton() {
  return (
    <>
      <Card>
        <CardHeaderSkeleton titleClassName="w-32" descriptionClassName="w-72" />
        <CardContent>
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-9 w-28" />
        </CardFooter>
      </Card>

      <Card>
        <CardHeaderSkeleton titleClassName="w-32" descriptionClassName="w-80" />
        <CardContent>
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-9 w-32" />
        </CardFooter>
      </Card>
    </>
  );
}
