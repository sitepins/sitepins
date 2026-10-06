import { Card, CardContent } from "@/components/ui/card";
import { CardHeaderSkeleton } from "@/components/ui/card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function LanguagePreferenceSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton titleClassName="w-32" descriptionClassName="w-72" />
      <CardContent>
        <div className="grid gap-4 gap-y-1 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border-muted flex items-center gap-2 rounded-xl border-2 p-4"
            >
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
