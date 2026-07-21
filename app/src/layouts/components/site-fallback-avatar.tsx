import Avatar from "@/components/avatar";
import { getFaviconUrl } from "@/lib/utils/favicon";
import { useTranslations } from "next-intl";

export default function SiteFallbackAvatar({ siteUrl }: { siteUrl: string }) {
  // Same-origin favicon URL (proxied) to avoid cross-origin CORS errors.
  const faviconUrl = getFaviconUrl(siteUrl);

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
