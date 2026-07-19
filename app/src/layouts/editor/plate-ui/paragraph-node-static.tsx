import { cn } from "@/lib/utils/cn";
import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";

export function ParagraphElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} className={cn("m-0 px-0 py-1")}>
      {props.children}
    </SlateElement>
  );
}
