import Avatar from "@/components/avatar";
import { useTranslations } from "next-intl";

export default function SiteFallbackAvatar({ siteUrl }: { siteUrl: string }) {
  // Prepare a safe favicon URL
  const normalizedSiteUrl = siteUrl
    ? siteUrl.startsWith("http")
      ? siteUrl
      : `https://${siteUrl}`
    : "";
  const faviconUrl = normalizedSiteUrl
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
        normalizedSiteUrl,
      )}&size=64`
    : "";

  const tCommon = useTranslations("common");

  return (
    <Avatar
      className="absolute top-0 left-0 size-full flex-none cursor-pointer rounded-full object-cover"
      src={faviconUrl}
      preview={!!faviconUrl}
      alt={tCommon("labels.site_favicon")}
      width={200}
      height={200}
      site_url={siteUrl}
      email={""}
    />
  );
}
