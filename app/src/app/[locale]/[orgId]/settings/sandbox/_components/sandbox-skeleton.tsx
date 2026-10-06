import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function SandboxSettingsSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-36" descriptionClassName="w-96" />
      <CardContent>
        <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-[22px] w-20 rounded-full" />
        </div>
      </CardContent>
      <CardFooter className="gap-x-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </CardFooter>
    </Card>
  );
}
