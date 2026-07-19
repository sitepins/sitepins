import { cn } from "@/lib/utils/cn";
import { forwardRef, useEffect, useState } from "react";

type Props = {
  src?: string;
  alt?: string;
  isFetching?: boolean;
  className?: string;
};

const VideoThumbnail = forwardRef<HTMLImageElement, Props>(
  ({ src, alt = "video", isFetching, className }, ref) => {
    const [thumb, setThumb] = useState<string | null>(null);
    const [error, setError] = useState(false);

    const PLACEHOLDER = "/images/placeholder.png";
    const FALLBACK = "/images/fallback.png";

    useEffect(() => {
      let cancelled = false;

      async function generate() {
        setError(false);
        setThumb(null);

        if (!src) {
          return;
        }

        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.preload = "metadata";
        video.muted = true;
        video.src = src;

        try {
          await new Promise<void>((resolve, reject) => {
            const onLoaded = () => resolve();
            const onError = () => reject(new Error("Video load error"));
            video.addEventListener("loadedmetadata", onLoaded, { once: true });
            video.addEventListener("error", onError, { once: true });
          });

          const time = Math.min(1, (video.duration && video.duration / 2) || 1);
          // set currentTime may throw if not allowed; guard in try/catch
          try {
            video.currentTime = time;
            await new Promise<void>((resolve, reject) => {
              const onSeeked = () => resolve();
              const onError = () => reject(new Error("Video seek error"));
              video.addEventListener("seeked", onSeeked, { once: true });
              video.addEventListener("error", onError, { once: true });
            });
          } catch (e) {
            // If seeking fails, continue — we'll try to capture whatever is available
          }

          const canvas = document.createElement("canvas");
          const ratio =
            video.videoWidth && video.videoHeight
              ? video.videoWidth / video.videoHeight
              : 16 / 9;
          const width = Math.min(800, video.videoWidth || 640);
          const height = Math.round(width / ratio);
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            try {
              ctx.drawImage(video, 0, 0, width, height);
              // toDataURL can throw for tainted canvas (CORS). Catch and fallback.
              const dataUrl = canvas.toDataURL("image/png");
              if (!cancelled) setThumb(dataUrl);
            } catch (err) {
              if (!cancelled) setError(true);
            }
          }
        } catch (err) {
          if (!cancelled) setError(true);
        } finally {
          // cleanup
          try {
            video.src = "";
          } catch {}
        }
      }

      generate();

      return () => {
        cancelled = true;
      };
    }, [src]);

    const [isLoadingImg, setLoadingImg] = useState(true);

    let imageSrc = PLACEHOLDER;
    if (error) imageSrc = FALLBACK;
    else if (thumb && !isFetching) imageSrc = thumb;

    // when a new generated thumb becomes available, mark image as loading
    useEffect(() => {
      setLoadingImg(true);
    }, [thumb, isFetching, error]);

    return (
      <img
        ref={ref}
        src={imageSrc}
        alt={alt}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        className={cn(
          `absolute inset-0 inline h-full w-full object-contain duration-700 ease-in-out lg:group-hover:opacity-70`,
          (isLoadingImg || isFetching) && !error
            ? "scale-100 blur-xl grayscale-0"
            : "blur-0 scale-100 grayscale-0",
          className,
        )}
        onLoad={() => {
          if (imageSrc) {
            setLoadingImg(false);
          }
        }}
        onError={() => {
          setError(true);
          setLoadingImg(false);
        }}
      />
    );
  },
);

export default VideoThumbnail;
