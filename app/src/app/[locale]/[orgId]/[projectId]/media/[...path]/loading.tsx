"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { selectMediaInfo } from "@/redux/features/media/slice";
import { useSelector } from "react-redux";

import MediaListSkeleton from "./_components/media-list-skeleton";

export default function MediaSkeleton() {
  const { view } = useSelector(selectMediaInfo);

  if (view === "list") {
    return <MediaListSkeleton />;
  }

  return (
    <div className="relative mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, index) => index).map((index) => {
        return (
          <div
            key={index}
            className="border-border flex flex-col space-y-3 overflow-hidden rounded-lg border"
          >
            <Skeleton className="mb-0 aspect-4/3 rounded-b-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-full max-w-3/4 rounded-md" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
