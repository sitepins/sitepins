import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
};

export default {
  env: process.env.NODE_ENV,
  database_uri: process.env.MONGO_URI,
  port: process.env.PORT,
  better_auth_secret: process.env.BETTER_AUTH_SECRET,
  // bcrypt cost factor. Falls back to 10 when SALT is unset/invalid so a
  // missing env var never silently produces NaN rounds.
  salt: Number(process.env.SALT) || 10,
  jwt_secret: process.env.JWT_SECRET,
  jwt_expire: process.env.JWT_TOKEN_EXPIRE,

  // Session cookie domain. Leave unset for single-host deploys (the browser
  // then scopes the cookie to the exact host). Only set this to a leading-dot
  // domain (e.g. ".example.com") when the app and API live on different
  // subdomains of the same site and must share the session cookie.
  cookie_domain: process.env.COOKIE_DOMAIN,

  // Number of proxies in front of the app (Vercel, DO App Platform, nginx…).
  // Needed so Express reads the real client IP and protocol from the
  // X-Forwarded-* headers. Default 1 in production.
  trust_proxy:
    process.env.TRUST_PROXY ??
    (process.env.NODE_ENV === "production" ? "1" : "false"),

  // Require a verified email before a credentials account can sign in. Turn
  // off (REQUIRE_EMAIL_VERIFICATION=false) for instances with no mail provider.
  require_email_verification: bool(
    process.env.REQUIRE_EMAIL_VERIFICATION,
    true,
  ),

  // ---- Media storage (S3-compatible: AWS S3, Cloudflare R2, MinIO,
  // Backblaze B2, DigitalOcean Spaces) ----
  s3_endpoint: process.env.S3_ENDPOINT,
  s3_region: process.env.S3_REGION,
  s3_access_key: process.env.S3_ACCESS_KEY,
  s3_secret_key: process.env.S3_SECRET_KEY,
  s3_bucket_name: process.env.S3_BUCKET_NAME,
  s3_force_path_style: bool(process.env.S3_FORCE_PATH_STYLE, false),

  // Optional anti-abuse email validation at signup (https://reoon.com).
  // Unset = skipped. Fails open if the service is unreachable.
  reoon_api_key: process.env.REOON_API_KEY,

  // ---- Transactional email ----
  // Provider: "brevo" | "smtp" | "console". Unset = auto-detect: Brevo if
  // BREVO_API_KEY is set, else SMTP if SMTP_HOST is set, else "console"
  // (logs the message + OTP/link to stdout).
  mail_provider: process.env.MAIL_PROVIDER,
  mail_from_name: process.env.MAIL_FROM_NAME || "Sitepins",
  mail_from_email: process.env.MAIL_FROM_EMAIL || "noreply@example.com",

  // Brevo
  brevo_api_key: process.env.BREVO_API_KEY,

  // SMTP (used when MAIL_PROVIDER=smtp or auto-detected)
  smtp_host: process.env.SMTP_HOST,
  smtp_port: Number(process.env.SMTP_PORT) || 587,
  smtp_secure: bool(process.env.SMTP_SECURE, false),
  smtp_user: process.env.SMTP_USER,
  smtp_pass: process.env.SMTP_PASS,

  // Internal server-to-server secret (used by the web app's API routes)
  internal_secret: process.env.INTERNAL_API_SECRET,

  // AES-256-GCM key for encrypting sandbox tokens at rest (64-char hex)
  sandbox_encryption_key: process.env.SANDBOX_ENCRYPTION_KEY,
};
