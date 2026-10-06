import { Card, CardContent } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function ThemePreferenceSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-32" descriptionClassName="w-72" />
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border-muted flex flex-col items-center justify-between rounded-xl border-2 p-4"
            >
              <Skeleton className="mb-2 size-6" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
