import { useInView } from "@/hooks/use-in-view";
import { useGitProvider } from "@/hooks/use-git-provider";
import { cn } from "@/lib/utils/cn";
import { cleanMediaPath } from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import { useMediaState } from "@platejs/media/react";
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

  const PLACEHOLDER_IMAGE = "/images/placeholder.png";
  const FALLBACK_IMAGE = "/images/fallback.png";
  const config = useSelector(selectConfig);
  const { branch: _branch } = config;
  const { useGitImage } = useGitProvider();
  const imageRef = useRef<HTMLImageElement>(null);
  const isInView = useInView(imageRef, { once: true });

  const isAbsoluteUrl = isUrl(image_url);

  const {
    data: image,
    isLoading,
    error,
    isUninitialized,
  } = useGitImage(cleanMediaPath(config.media, image_url), {
    skip: !isInView || isAbsoluteUrl,
  });

  // Fully derived from the query; only a load failure is local state, and it
  // is keyed to the source so a new image retries rather than staying broken.
  const resolvedSrc = useMemo(() => {
    if (isAbsoluteUrl) return image_url;
    if (isUninitialized || isLoading) return PLACEHOLDER_IMAGE;
    if (error) return FALLBACK_IMAGE;
    if (!image) return PLACEHOLDER_IMAGE;

    if (image.content) {
      const mimeType = path.extname(image_url).slice(1);
      if (mimeType) return `data:image/${mimeType};base64,${image.content}`;
    }

    return image.download_url || FALLBACK_IMAGE;
  }, [image, isLoading, error, isUninitialized, image_url, isAbsoluteUrl]);

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgSrc = failedSrc === resolvedSrc ? FALLBACK_IMAGE : resolvedSrc;

  return (
    <figure className="group relative m-0 max-w-96" contentEditable={false}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        onError={() => setFailedSrc(resolvedSrc)}
        ref={imageRef}
        className={cn(
          "block cursor-pointer object-contain px-0",
          "rounded-sm",
          focused && selected && "ring-ring ring-2 ring-offset-2",
        )}
        alt={(alt || "Image") as string}
      />
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
