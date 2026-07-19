import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function LanguagePreferenceSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
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
