import { cn } from "@/lib/utils/cn";
import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";

export function HrElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props}>
      <div className="cursor-text py-6" contentEditable={false}>
        <hr
          className={cn(
            "bg-muted h-0.5 rounded-sm border-none bg-clip-content",
          )}
        />
      </div>
      {props.children}
    </SlateElement>
  );
}
