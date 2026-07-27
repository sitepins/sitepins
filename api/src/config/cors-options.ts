import { CorsOptions } from "cors";

// Origins allowed in production. Configure via CORS_ORIGINS as a
// comma-separated list, e.g. CORS_ORIGINS="https://cms.example.com"
const baseProductionOrigins: string[] = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const baseLocalOrigins: string[] = [
  "http://localhost:3000",
  "http://localhost:4000",
];

export const allowedOrigins: string[] =
  process.env.NODE_ENV === "development"
    ? baseLocalOrigins
    : baseProductionOrigins;

const sharedCorsConfig: Omit<CorsOptions, "origin"> = {
  methods: "GET,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-enhanced-security",
    "x-request-time",
    "User-Agent",
    "Accept",
    "X-App-Context",
  ],
};

export const corsProtectedOptions: CorsOptions = {
  ...sharedCorsConfig,
  origin: allowedOrigins,
};

// Access-token (bearer) API surface. Reachable from any origin because it's
// consumed server-to-server / by external API clients — but it authenticates
// via the Authorization header, never cookies, so credentials must be OFF.
// (An open origin combined with credentials:true would expose cookie-authed
// data to any site.) The token routes themselves live in the cloud edition.
export const corsUnprotectedOptions: CorsOptions = {
  ...sharedCorsConfig,
  origin: true,
  credentials: false,
};
