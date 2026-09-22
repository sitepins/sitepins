import { useInView } from "@/hooks/use-in-view";
import { useGitProvider } from "@/hooks/use-git-provider";
import { cn } from "@/lib/utils/cn";
import { cleanMediaPath } from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import { useMediaState } from "@platejs/media/react";
import { ImageIcon, ImageOff, RotateCw } from "lucide-react";
import path from "path";
import { isUrl } from "platejs";
import { useRef, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { Caption, CaptionTextarea } from "./caption";

export function LoadImage({
  image_url,
  alt,
}: {
  image_url: string;
  alt?: string;
}) {
  const { align = "left", focused, readOnly, selected } = useMediaState();

  const config = useSelector(selectConfig);
  const { branch: _branch } = config;
  const { useGitImage } = useGitProvider();
  const containerRef = useRef<HTMLElement>(null);
  const isInView = useInView(containerRef, { once: true });

  const isAbsoluteUrl = isUrl(image_url);

  const {
    data: image,
    isLoading,
    error,
    isUninitialized,
  } = useGitImage(cleanMediaPath(config.media, image_url), {
    skip: !isInView || isAbsoluteUrl,
  });

  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const resolvedSrc = useMemo(() => {
    if (isAbsoluteUrl) return image_url;
    if (isUninitialized || isLoading) return null;
    if (error) return null;
    if (!image) return null;

    if (image.content) {
      const mimeType = path.extname(image_url).slice(1);
      if (mimeType) return `data:image/${mimeType};base64,${image.content}`;
    }

    return image.download_url || null;
  }, [image, isLoading, error, isUninitialized, image_url, isAbsoluteUrl]);

  const isFailed =
    !!error || (resolvedSrc !== null && failedSrc === resolvedSrc);
  const isFetching =
    !isAbsoluteUrl && (isUninitialized || isLoading || (!image && !error));

  return (
    <figure
      ref={containerRef}
      className="group relative m-0 max-w-96"
      contentEditable={false}
    >
      {isFailed ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFailedSrc(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFailedSrc(null);
            }
          }}
          className={cn(
            "border-border bg-muted/30 hover:bg-muted/50 relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed p-4 text-center transition-colors",
            focused && selected && "ring-ring ring-2 ring-offset-2",
          )}
          title="Click to retry loading image"
        >
          <div className="flex flex-col items-center gap-1.5 px-3">
            <ImageOff className="text-muted-foreground size-7 stroke-[1.5]" />
            <span className="text-foreground text-xs font-medium">
              Image failed to load
            </span>
            <span className="text-muted-foreground max-w-[280px] truncate text-[11px]">
              {image_url}
            </span>
            <span className="border-border bg-background text-muted-foreground mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium shadow-xs">
              <RotateCw className="size-2.5" /> Retry
            </span>
          </div>
        </div>
      ) : isFetching || !resolvedSrc ? (
        <div
          className={cn(
            "border-border/60 bg-muted/40 text-muted-foreground relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-md border",
            "animate-pulse",
            focused && selected && "ring-ring ring-2 ring-offset-2",
          )}
        >
          <div className="flex flex-col items-center gap-1.5">
            <ImageIcon className="text-muted-foreground/60 size-7 stroke-[1.5]" />
            <span className="text-muted-foreground/60 text-[11px] font-medium">
              Loading image...
            </span>
          </div>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={resolvedSrc}
          onError={() => setFailedSrc(resolvedSrc)}
          className={cn(
            "block cursor-pointer object-contain px-0",
            "rounded-sm duration-200 ease-in-out",
            focused && selected && "ring-ring ring-2 ring-offset-2",
          )}
          alt={(alt || "Image") as string}
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
  );
}
