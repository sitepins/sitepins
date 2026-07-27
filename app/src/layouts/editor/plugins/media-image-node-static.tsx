import { cn } from "@/lib/utils/cn";
import type { TCaptionProps, TImageElement, TResizableProps } from "platejs";
import { NodeApi } from "platejs";
import { SlateElement, SlateElementProps } from "platejs/static";

export function ImageElementStatic(
  props: SlateElementProps<TImageElement & TCaptionProps & TResizableProps>,
) {
  const { align = "center", caption, url, width } = props.element;

  return (
    <SlateElement {...props} className="py-2.5">
      <figure className="group relative m-0 inline-block" style={{ width }}>
        <div
          className="relative max-w-full min-w-[92px]"
          style={{ textAlign: align }}
        >
          <img
            className={cn(
              "w-full max-w-full cursor-default object-cover px-0",
              "rounded-sm",
            )}
            alt={(props.attributes as any).alt}
            src={url}
          />
          {caption && (
            <figcaption className="mx-auto mt-2 h-6 max-w-full">
              {NodeApi.string(caption[0])}
            </figcaption>
          )}
        </div>
      </figure>
      {props.children}
    </SlateElement>
  );
}
