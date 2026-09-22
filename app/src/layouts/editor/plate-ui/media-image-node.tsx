"use client";

import { Badge } from "@/components/ui/badge";
import { useImages } from "@/hooks/use-images";
import { cn } from "@/lib/utils/cn";
import { generatePath } from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import { ImagePlugin, useMediaState } from "@platejs/media/react";
import { ImageOff, RotateCw } from "lucide-react";
import { TImageElement } from "platejs";
import { PlateElement, PlateElementProps } from "platejs/react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { Caption, CaptionTextarea } from "./caption";
import { LoadImage } from "./load-image";
import { MediaToolbar } from "./media-toolbar";

export const extractBase64 = (dataUrl: string): string => {
  const index = dataUrl.indexOf(",");
  if (index === -1) return ""; // no comma = invalid data URL
  return dataUrl.slice(index + 1);
};

export const ImageElement = (props: PlateElementProps<TImageElement>) => {
  const { align = "left", focused, readOnly, selected } = useMediaState();
  const image_url = props.element.url;

  const config = useSelector(selectConfig);

  const { images } = useImages();

  const imageItem = images?.find(
    (item) =>
      "/" + generatePath(config.media, item.path, config.public) === image_url,
  );

  const [hasError, setHasError] = useState(false);

  return (
    <MediaToolbar plugin={ImagePlugin}>
      <PlateElement {...props} className="py-2.5">
        {imageItem ? (
          <figure
            className="group relative m-0 max-w-96"
            contentEditable={false}
          >
            <Badge className="absolute top-2 left-2 z-10" variant="success">
              Pasted
            </Badge>
            {hasError ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setHasError(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHasError(false);
                  }
                }}
                className={cn(
                  "border-border bg-muted/30 hover:bg-muted/50 relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed p-4 text-center transition-colors",
                  focused && selected && "ring-ring ring-2 ring-offset-2",
                )}
                title="Click to retry"
              >
                <div className="flex flex-col items-center gap-1.5 px-3">
                  <ImageOff className="text-muted-foreground size-7 stroke-[1.5]" />
                  <span className="text-foreground text-xs font-medium">
                    Pasted image failed to load
                  </span>
                  <span className="border-border bg-background text-muted-foreground mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium shadow-xs">
                    <RotateCw className="size-2.5" /> Retry
                  </span>
                </div>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`data:image/*;base64,${imageItem?.content}`}
                onError={() => setHasError(true)}
                className={cn(
                  "block cursor-pointer object-contain px-0",
                  "rounded-sm duration-200 ease-in-out",
                  focused && selected && "ring-ring ring-2 ring-offset-2",
                )}
                alt={(props?.attributes?.alt || "Image") as string}
              />
            )}
            <Caption align={align}>
              <CaptionTextarea
                readOnly={readOnly}
                onFocus={(e) => {
                  e.preventDefault();
                }}
                placeholder="Set a alt text"
              />
            </Caption>
          </figure>
        ) : (
          <LoadImage image_url={image_url} />
        )}
        {props.children}
      </PlateElement>
    </MediaToolbar>
  );
};
