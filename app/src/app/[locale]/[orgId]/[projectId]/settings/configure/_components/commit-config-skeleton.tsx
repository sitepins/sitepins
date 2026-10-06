import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommitConfigSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-44" descriptionClassName="w-80" />
      <CardContent>
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-full max-w-1/2" />
          </div>
          <div className="flex items-center">
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-9 w-full sm:w-32" />
      </CardFooter>
    </Card>
  );
}
