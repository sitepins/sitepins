import Container from "@/components/container";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DirectorySkeletonProps {
  isCodePath: boolean;
}

export default function DirectorySkeleton({
  isCodePath,
}: DirectorySkeletonProps) {
  return (
    <Container fullWidth>
      {/* Action Bar Skeleton */}
      <div className="flex flex-col gap-y-3 md:flex-row md:items-center md:space-x-2">
        <div className="flex-1">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <div className="flex w-full items-center gap-x-2 md:w-auto">
          <Skeleton className="h-10 flex-1 rounded-md md:w-50" />
          {!isCodePath && <Skeleton className="h-10 w-28 rounded-md" />}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Header Skeleton */}
        <div className="border-border bg-light rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="border-b-0! hover:bg-transparent">
                {isCodePath ? (
                  <>
                    <TableHead className="w-[45%]">
                      <Skeleton className="h-4 w-20" />
                    </TableHead>
                    <TableHead className="hidden w-[25%] text-left sm:table-cell">
                      <Skeleton className="h-4 w-12" />
                    </TableHead>
                    <TableHead className="hidden w-[25%] text-left sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableHead>
                    <TableHead className="w-[5%]" />
                  </>
                ) : (
                  <>
                    <TableHead className="w-[40%]">
                      <Skeleton className="h-4 w-16" />
                    </TableHead>
                    <TableHead className="hidden w-[20%] text-left sm:table-cell">
                      <Skeleton className="h-4 w-12" />
                    </TableHead>
                    <TableHead className="hidden w-[30%] text-center sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableHead>
                    <TableHead className="w-[5%] text-left">
                      <Skeleton className="h-4 w-12" />
                    </TableHead>
                    <TableHead className="w-[5%]" />
                  </>
                )}
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {/* List Rows Skeleton */}
        <div className="border-border rounded-lg border">
          <Table>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {isCodePath ? (
                    <>
                      <TableCell className="w-[45%] py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-5 shrink-0 rounded" />
                          <Skeleton className="h-4 w-full max-w-40" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden w-[25%] sm:table-cell">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell className="hidden w-[25%] sm:table-cell">
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="w-[5%]">
                        <div className="flex justify-end">
                          <Skeleton className="h-4 w-6 rounded-md" />
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="w-[40%] py-4">
                        <Skeleton className="h-4 w-full max-w-48" />
                      </TableCell>
                      <TableCell className="hidden w-[20%] sm:table-cell">
                        <Skeleton className="h-4 w-full max-w-24" />
                      </TableCell>
                      <TableCell className="hidden w-[30%] sm:table-cell">
                        <div className="flex justify-center">
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </TableCell>
                      <TableCell className="w-[5%]">
                        <Skeleton className="h-4 w-16 rounded-full" />
                      </TableCell>
                      <TableCell className="w-[5%]">
                        <div className="flex justify-end">
                          <Skeleton className="h-4 w-6 rounded-md" />
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Container>
  );
}
