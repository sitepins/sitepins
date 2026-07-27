import { useInView } from "@/hooks/use-in-view";
import { useGitProvider } from "@/hooks/use-git-provider";
import { cn } from "@/lib/utils/cn";
import { cleanMediaPath } from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import { useMediaState } from "@platejs/media/react";
import path from "path";
import { isUrl } from "platejs";
import { useEffect, useRef, useState } from "react";
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
  const { branch } = config;
  const { useGitImage } = useGitProvider();
  const imageRef = useRef<HTMLImageElement>(null);
  const isInView = useInView(imageRef, { once: true });
  const [imgSrc, setImgSrc] = useState(PLACEHOLDER_IMAGE);

  const isAbsoluteUrl = isUrl(image_url);

  const {
    data: image,
    isLoading,
    error,
    isUninitialized,
  } = useGitImage(cleanMediaPath(config.media, image_url), {
    ref: branch,
    skip: !isInView || isAbsoluteUrl,
  });

  useEffect(() => {
    // If the image is an absolute URL, set it directly
    if (isAbsoluteUrl) {
      setImgSrc(image_url);
      return;
    }
    // If query hasn't started yet (uninitialized), show placeholder
    if (isUninitialized) {
      setImgSrc(PLACEHOLDER_IMAGE);
      return;
    }

    // If actively loading, show placeholder
    if (isLoading) {
      setImgSrc(PLACEHOLDER_IMAGE);
      return;
    }

    // If there's an error, show fallback
    if (error) {
      setImgSrc(FALLBACK_IMAGE);
      return;
    }

    // If we have image data, process it
    if (image) {
      // Prioritize base64 content since download_url tokens expire quickly
      if (image.content) {
        const mimeType = path.extname(image_url).slice(1);
        if (mimeType) {
          const dataUrl = `data:image/${mimeType};base64,${image.content}`;
          setImgSrc(dataUrl);
        } else {
          // Fallback to download_url if no mime type
          if (image.download_url) {
            setImgSrc(image.download_url);
          } else {
            setImgSrc(FALLBACK_IMAGE);
          }
        }
      } else if (image.download_url) {
        setImgSrc(image.download_url);
      } else {
        setImgSrc(FALLBACK_IMAGE);
      }
    }
  }, [image, isLoading, error, isUninitialized, image_url, isAbsoluteUrl]);

  return (
    <figure className="group relative m-0 max-w-96" contentEditable={false}>
      <img
        src={imgSrc}
        onError={() => setImgSrc(FALLBACK_IMAGE)}
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
