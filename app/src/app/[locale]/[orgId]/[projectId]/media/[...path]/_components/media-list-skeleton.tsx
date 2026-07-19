import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function MediaListSkeleton() {
  const tMedia = useTranslations("media");
  return (
    <div className="mt-7">
      <div className="border-border mb-3 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0! hover:bg-transparent">
              <TableHead className="w-[50%]">{tMedia("image")}</TableHead>
              <TableHead className="w-[20%] text-center">
                {tMedia("last_modified")}
              </TableHead>
              <TableHead className="w-[15%] text-right">
                {tMedia("size")}
              </TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      <div className="border-border rounded-lg border">
        <Table>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell className="w-[50%] py-3">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-18.25 shrink-0 rounded-sm" />
                    <Skeleton className="hidden h-4 w-40 md:block" />
                  </div>
                </TableCell>
                <TableCell className="w-[20%]">
                  <div className="flex justify-center">
                    <Skeleton className="h-4 w-24" />
                  </div>
                </TableCell>
                <TableCell className="w-[15%]">
                  <div className="flex justify-end">
                    <Skeleton className="h-4 w-12" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
