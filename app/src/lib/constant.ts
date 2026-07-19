
export const IS_DEMO = process.env.NEXT_PUBLIC_IS_DEMO === "true";
export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
export const SCHEMA_FOLDER = ".sitepins/schema";
export const SNIPPET_FOLDER = ".sitepins/snippet";
export const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export const BUCKET_URL = process.env.NEXT_PUBLIC_BUCKET_URL;
export const GITHUB_APP_NAME =
  process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "Sitepins";
export const GITLAB_APP_NAME =
  process.env.NEXT_PUBLIC_GITLAB_APP_NAME || "Sitepins";
export const GITHUB_API_VERSION = "2026-03-10";
export const GITLAB_API_VERSION = "v4";
export const POST_LOGIN_REDIRECT_KEY = "sitepins_post_login_redirect";
// Auth
export const OTP_LENGTH = 6;

// Accepted file types and size limits
export const AcceptImages = {
  "image/png": [],
  "image/jpg": [],
  "image/jpeg": [],
  "image/webp": [],
  "image/svg+xml": [".svg"],
};

export const AcceptVideos = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
};

export const AcceptMedia = {
  ...AcceptImages,
  ...AcceptVideos,
};

export const MAX_SIZE = 1000000 * 10; // 10MB for images
export const MAX_VIDEO_SIZE = 1000000 * 25; // 25MB for videos (GitHub blob API limit)
export const MAX_FILES = 10;

export type TAIProvider = {
  provider: string;
  value: string;
  models: string[];
  docsUrl: string;
};

export const aiProviders: TAIProvider[] = [
  {
    provider: "OpenAI (ChatGPT)",
    value: "openai",
    models: ["gpt-5.5", "gpt-4.1", "gpt-4o-mini"],
    docsUrl: "https://developers.openai.com/api/docs/models/all",
  },
  {
    provider: "Google (Gemini)",
    value: "gemini",
    models: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    provider: "Anthropic (Claude)",
    value: "anthropic",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    docsUrl: "https://platform.claude.com/docs/en/about-claude/models/overview",
  },
  {
    provider: "xAI (Grok)",
    value: "xai",
    models: [
      "grok-4-1",
      "grok-4-1-fast-non-reasoning",
      "grok-4.20-non-reasoning",
    ],
    docsUrl: "https://docs.x.ai/overview#models",
  },
];
