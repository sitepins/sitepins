import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  CardHeaderSkeleton,
  FieldGroupSkeleton,
} from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function GeneralSettingsSkeleton() {
  return (
    <>
      <Card>
        <CardHeaderSkeleton descriptionClassName="w-80">
          <Skeleton className="size-25 rounded-full" />
        </CardHeaderSkeleton>
      </Card>

      <Card>
        <CardHeaderSkeleton titleClassName="w-36" descriptionClassName="w-60" />
        <CardContent>
          <FieldGroupSkeleton />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-9 w-full sm:w-40" />
        </CardFooter>
      </Card>

      <Card>
        <CardHeaderSkeleton titleClassName="w-44" descriptionClassName="w-96" />
        <CardFooter>
          <Skeleton className="h-9 w-full sm:w-36" />
        </CardFooter>
      </Card>
    </>
  );
}
