import "./variables"; // loads .env before the reads below

// REQUIRED_BRAND_ENV must be set; startup fails otherwise.

/** Lowercase `[a-z0-9-]`, safe for folders, cookies, branches, issuers. */
export const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const REQUIRED_BRAND_ENV = [
  "BRAND_NAME",
  "BRAND_URL",
  "BRAND_SLUG",
  "BRAND_SUPPORT_URL",
  "GIT_APP_NAME",
] as const;

const env = (name: string) => process.env[name]?.trim() ?? "";

const missing = REQUIRED_BRAND_ENV.filter((name) =>
  name === "BRAND_SLUG" ? !toSlug(env(name)) : !env(name),
);
if (missing.length) {
  throw new Error(
    `Missing required env vars (see api/.env.example): ${missing.join(", ")}`,
  );
}

const slug = toSlug(env("BRAND_SLUG"));
const url = env("BRAND_URL").replace(/\/+$/, "");
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    throw new Error(`BRAND_URL must be an absolute URL, got "${url}"`);
  }
})();
// Same var and email format the app uses for its own GitLab commits.
const gitAppName = env("GIT_APP_NAME");

export const brand = {
  name: env("BRAND_NAME"),
  slug,
  url,
  logo_url: env("BRAND_LOGO_URL"),
  support_url: env("BRAND_SUPPORT_URL"),

  /** Author for commits where the git host has no app identity (GitLab). */
  bot_name: gitAppName,
  bot_email: `${gitAppName.toLowerCase().replace(/[^a-z0-9]/g, "")}@${host}`,

  /** Repo folder holding config.json, schema/ and snippet/. */
  config_dir: `.${slug}`,
  auth_cookie_prefix: `${slug}-app`,
  demo_cookie_prefix: `${slug}-demo`,
  commit_trailer_prefix: slug.charAt(0).toUpperCase() + slug.slice(1),
  agent_branch_prefix: `${slug}/`,
  upload_prefix: slug,
  jwt_issuer: `${slug}-api`,
};

export default brand;
