import { allowedOrigins } from "@/config/cors-options";

/** Public origin of the web app, from APP_URL or the first CORS origin. */
export const getAppUrl = (): string | undefined => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (allowedOrigins.length > 0 && allowedOrigins[0]) {
    return allowedOrigins[0].replace(/\/+$/, "");
  }
  return undefined;
};
