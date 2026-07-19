import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GitSettingsSkeleton() {
  return (
    <>
      <Card>
        <CardHeader className="grid-cols-1">
          <CardTitle>
            <Skeleton className="h-6 w-32 max-w-full" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center space-x-3">
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
        <CardHeader className="grid-cols-1">
          <CardTitle>
            <Skeleton className="h-6 w-32 max-w-full" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-80 max-w-full" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center space-x-3">
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
