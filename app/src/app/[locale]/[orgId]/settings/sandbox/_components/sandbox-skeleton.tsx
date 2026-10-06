import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function SandboxSettingsSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-36" descriptionClassName="w-96" />
      <CardContent>
        <div className="border-border flex items-center gap-3 rounded-lg border p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-x-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </CardFooter>
    </Card>
  );
}
