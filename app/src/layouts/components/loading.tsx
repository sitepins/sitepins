import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type LoadingProps = {
  className?: string;
  sizeClass?: string; // e.g. "size-6"
  fullScreen?: boolean;
  center?: boolean;
  message?: string;
  ariaLabel?: string;
};

export default function Loading({
  className = "",
  sizeClass = "size-6",
  fullScreen = false,
  center = true,
  message,
  ariaLabel,
}: LoadingProps) {
  const tCommon = useTranslations("common");
  const containerClass = fullScreen
    ? "fixed left-0 top-0 flex size-full items-center justify-center"
    : center
      ? "flex items-center size-full justify-center"
      : "";

  return (
    <div className={`${containerClass} ${className}`.trim()}>
      <Loader2
        className={`${sizeClass} animate-spin`}
        aria-label={ariaLabel || tCommon("status.loading")}
      />
      {message && (
        <span className="text-muted-foreground ml-2 text-sm">{message}</span>
      )}
    </div>
  );
}
