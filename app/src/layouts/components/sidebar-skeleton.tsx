import { Skeleton } from "@/components/ui/skeleton";

export function SidebarSkeleton() {
  return (
    <aside className="border-e-border bg-light/40 sticky inset-s-0 top-0 flex h-svh w-full max-w-70 flex-col border-e xl:fixed xl:inset-s-0 xl:top-0 xl:z-20 xl:h-screen">
      {/* Header */}
      <div className="hidden px-4 py-3 xl:block">
        <div className="flex w-full items-center justify-center rounded-lg py-2.5">
          <Skeleton className="h-7 w-full" />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col px-4 pt-4 xl:pt-1">
          <ul className="flex-1 space-y-1">
            {[...Array(5)].map((_, i) => (
              <li key={i}>
                <div className="flex w-full items-center rounded-lg px-2 py-2.5">
                  <Skeleton className="me-1.5 size-6" />
                  <Skeleton className="h-6 flex-1" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Footer - User Menu */}
      <div className="p-4">
        <div className="flex flex-col">
          {/* Profile Button Skeleton */}
          <div className="hover:bg-background flex h-12 w-full items-center justify-between gap-1 rounded-lg">
            <div className="flex flex-1 items-center justify-between gap-2 text-start">
              <Skeleton className="size-8 rounded-full" />
              <span className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </span>
            </div>
          </div>
          {/* Upgrade Button Skeleton */}
          <Skeleton className="mt-2 h-8 w-full rounded-md" />
        </div>
      </div>
    </aside>
  );
}
