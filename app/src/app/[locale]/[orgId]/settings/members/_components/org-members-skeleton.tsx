import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MembersSettingsSkeleton() {
  return (
    <>
      <Card>
        {/* Card Header */}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="hidden h-7 w-28 md:block" />
        </CardHeader>

        {/* Card Content - Member List */}
        <CardContent className="pt-0">
          <div className="divide-border border-border divide-y rounded-xl border">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                {/* Avatar + Name/Email */}
                <div className="grid w-full grid-cols-[auto_1fr] gap-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-full max-w-32" />
                    <Skeleton className="h-3 w-full max-w-48" />
                  </div>
                </div>

                {/* Role Badge + Actions */}
                <div className="flex items-center justify-between gap-4 md:justify-end">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="md:hidden">
          <Skeleton className="h-7 w-full" />
        </CardFooter>
      </Card>
    </>
  );
}
