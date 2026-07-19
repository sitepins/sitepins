"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Clock, FileText, User } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

export default function AppActivity({
  projectLogQuery,
}: {
  projectLogQuery: any;
}) {
  const tProjectActivity = useTranslations("project.activity");
  const params = useParams();

  // Guard
  const logs: any[] = projectLogQuery?.data?.logs ?? [];

  // Filter: only content files with action create or update
  const recentContentFull = logs
    .filter((l: any) => {
      const fileType = String(l.file_type ?? "").toLowerCase();
      return fileType === "content";
    })
    .slice()
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );

  const [limit, setLimit] = useState(3);
  const ref = useRef<HTMLDivElement>(null);
  const displayed = recentContentFull.slice(0, limit);

  if (!projectLogQuery.isLoading && recentContentFull.length === 0) {
    return null;
  }

  return (
    <Card className="gap-0">
      <CardHeader className="border-border border-b">
        <CardTitle>{tProjectActivity("recent_file_changes")}</CardTitle>
        <CardDescription>{tProjectActivity("latest_activity")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {projectLogQuery.isLoading ? (
          <div className="px-4">
            <div className="space-y-4 py-3">
              <div className="flex items-center space-x-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div
              ref={ref}
              className="h-full overflow-x-hidden md:max-h-72.5 md:overflow-y-auto"
            >
              <ul>
                {displayed.map((log: any, idx: number) => {
                  const filePath: string = log.file || "";
                  const fileName = filePath ? filePath.split("/").pop() : "";
                  const dateObj = log.createdAt
                    ? new Date(log.createdAt)
                    : null;
                  const action = String(log.action ?? "").toLowerCase();
                  const isCreate = action === "create";
                  const isDelete = action === "delete";
                  const isRename = action === "rename";
                  const isDuplicate = action === "duplicate";

                  let badgeLabel = tProjectActivity("updated");
                  if (isCreate) badgeLabel = tProjectActivity("created");
                  if (isDelete) badgeLabel = tProjectActivity("deleted");
                  if (isRename) badgeLabel = tProjectActivity("renamed");
                  if (isDuplicate) badgeLabel = tProjectActivity("duplicated");

                  const badgeVariant = isCreate
                    ? "success"
                    : isDelete
                      ? "destructive"
                      : isRename
                        ? "warning"
                        : isDuplicate
                          ? "default"
                          : "outline";

                  // Build editor URL: /{orgId}/{projectId}/content/{filePath}
                  const href = `/${params?.orgId}/${params?.projectId}/content/${filePath}`;

                  return (
                    <li
                      key={idx}
                      className="border-b-border hover:bg-muted/50 relative flex border-b px-4 py-4 transition-colors"
                    >
                      <div className="bg-secondary hidden size-10 items-center justify-center rounded-full sm:flex md:flex">
                        <FileText className="text-muted-foreground size-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* filename row — padded right so text never bleeds under the badge */}
                        <div className="pr-20">
                          {isDelete ? (
                            <span className="text-muted-foreground block truncate font-medium line-through">
                              {fileName}
                            </span>
                          ) : (
                            <Link
                              href={href}
                              className="stretched-link block truncate font-medium hover:underline"
                            >
                              {fileName}
                            </Link>
                          )}
                        </div>

                        <Badge
                          variant={badgeVariant}
                          className="absolute top-4 right-4 text-xs"
                        >
                          {badgeLabel}
                        </Badge>

                        {filePath ? (
                          <p
                            dir="rtl"
                            className="text-muted-foreground mt-2 truncate text-left text-sm"
                          >
                            {filePath}
                          </p>
                        ) : null}

                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span>
                              {dateObj
                                ? formatDistanceToNow(dateObj, {
                                    addSuffix: true,
                                  })
                                : ""}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4 shrink-0" />
                            <span>{log.user_name}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="border-border w-full border"
          disabled={displayed.length >= recentContentFull.length}
          onClick={() => setLimit((p) => p + 5)}
        >
          {displayed.length >= recentContentFull.length
            ? tProjectActivity("no_more")
            : tProjectActivity("load_more")}
        </Button>
      </CardFooter>
    </Card>
  );
}
