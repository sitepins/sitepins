import { cn } from "@/lib/utils/cn";
import { Toolbar } from "./toolbar";

export function FixedToolbar(props: React.ComponentProps<typeof Toolbar>) {
  return (
    <Toolbar
      {...props}
      className={cn(
        "scrollbar-hide bg-background/95 supports-backdrop-blur:bg-background/60 border-border sticky top-0 left-0 z-50 w-full justify-between overflow-x-auto rounded-t-lg border border-b p-1 backdrop-blur-sm",
        props.className,
      )}
    />
  );
}
