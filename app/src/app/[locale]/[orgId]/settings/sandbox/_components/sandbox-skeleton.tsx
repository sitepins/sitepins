import { Card, CardContent } from "@/components/ui/card";
import {
  CardHeaderSkeleton,
  SkeletonText,
} from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function SandboxSettingsSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-36" descriptionClassName="w-96" />
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2 text-sm">
            <div>
              <SkeletonText className="w-48" />
            </div>
            <div>
              <SkeletonText className="w-72" />
            </div>
            <div>
              <SkeletonText className="w-80" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
