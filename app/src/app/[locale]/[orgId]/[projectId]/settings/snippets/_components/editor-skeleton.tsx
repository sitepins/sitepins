import { Skeleton } from "@/layouts/components/ui/skeleton";

export function EditorSkeleton() {
  return (
    <div className="border-border bg-muted/5 relative h-[200px] w-full overflow-hidden rounded border p-4 shadow-lg">
      <div className="flex h-full space-x-4">
        {/* Fake gutter */}
        <div className="hidden w-6 flex-col space-y-3 pt-1 sm:flex">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full opacity-20" />
          ))}
        </div>

        {/* Fake code lines */}
        <div className="flex-1 space-y-3 pt-1">
          {[60, 80, 40].map((width, i) => (
            <div key={i} className="flex space-x-2">
              <Skeleton
                className="h-3 rounded-sm"
                style={{
                  width: `${width}%`,
                  opacity: 0.1 + (i % 5) * 0.05,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
