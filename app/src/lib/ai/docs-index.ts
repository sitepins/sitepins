import { logger } from "@/lib/logger";

/**
 * Public Sitepins documentation used to ground the search Copilot's "how do
 * I…" answers. Mirrors the public pages of sp-docs (never the password
 * protected `/cloud` section). Keep in sync when docs pages are added.
 */

export type TDocEntry = {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
};

export const DOCS_BASE_URL = (
  process.env.SITEPINS_DOCS_URL || "https://docs.sitepins.com"
).replace(/\/$/, "");

export const DOCS_INDEX: TDocEntry[] = [
  {
    path: "/account/preferences",
    title: "Preferences",
    description:
      "Set your interface language and theme, and choose whether commits are attributed to you or to the Sitepins bot.",
    keywords: ["language", "theme", "dark", "coauthor"],
  },
  {
    path: "/account/profile-and-security",
    title: "Profile & Security",
    description:
      "Update your name and picture, set or change your password, manage the newsletter, and delete your account.",
    keywords: ["password", "avatar", "delete account"],
  },
  {
    path: "/collaboration/branches-and-pull-requests",
    title: "Branches & Pull Requests",
    description:
      "Draft on a branch, open a pull request, and merge — without leaving Sitepins.",
    keywords: ["branch", "pr", "merge", "review"],
  },
  {
    path: "/collaboration/real-time-collaboration",
    title: "Real-Time Collaboration",
    description:
      "See who else is in a file, follow their cursor, and find out immediately when someone commits over you.",
    keywords: ["realtime", "cursor", "presence", "conflict"],
  },
  {
    path: "/collaboration/team-and-roles",
    title: "Team & Roles",
    description:
      "Invite teammates and clients by email — no Git account needed — and control what each can do.",
    keywords: ["invite", "member", "team", "role", "permission", "client"],
  },
  {
    path: "/content-structure/config-files",
    title: "Config Files",
    description:
      "Let editors change menus, theme settings, and site metadata through a form instead of a code editor.",
    keywords: [
      "config",
      "configuration",
      "menu",
      "navigation",
      "site settings",
    ],
  },
  {
    path: "/content-structure/files-and-folders",
    title: "Files & Folders",
    description:
      "Browse, sort, create, rename, duplicate, and delete content files and folders from the CMS.",
    keywords: ["create", "new post", "rename", "delete", "folder", "duplicate"],
  },
  {
    path: "/content-structure/media-library",
    title: "Media Library",
    description:
      "Upload, organize, rename, move, and reuse images and other assets — all committed to your repository.",
    keywords: ["image", "upload", "media", "asset"],
  },
  {
    path: "/content-structure/schemas",
    title: "Content Schemas",
    description:
      "Define the fields editors see — field types, dropdowns, folder matching, and inheritance.",
    keywords: ["schema", "field", "frontmatter", "dropdown"],
  },
  {
    path: "/content-structure/sidebar-arrangement",
    title: "Sidebar Arrangement",
    description:
      "Group, rename, and reorder the content sidebar without changing anything in your repository.",
    keywords: ["sidebar", "arrangement", "collection", "group"],
  },
  {
    path: "/editing/ai-assistant",
    title: "AI Assistant",
    description:
      "Multi-provider AI across writing, code editing, commit messages, and SEO. Connect Groq, OpenRouter, OpenAI, Gemini, Anthropic, or xAI.",
    keywords: ["ai", "api key", "model", "copilot"],
  },
  {
    path: "/editing/blocks-and-embeds",
    title: "Blocks & Embeds",
    description:
      "Tables, code blocks, Mermaid diagrams, math, iframe embeds, and images in the visual editor.",
    keywords: ["table", "embed", "iframe", "mermaid", "video"],
  },
  {
    path: "/editing/code-editor",
    title: "Code Editor",
    description:
      "Edit any file in your repository directly, with syntax highlighting and a commit on save.",
    keywords: ["code", "layout", "template"],
  },
  {
    path: "/editing/live-preview",
    title: "Live Preview",
    description:
      "Run your real site in a sandbox and watch uncommitted edits render as you type.",
    keywords: ["preview", "sandbox"],
  },
  {
    path: "/editing/markdown-mode",
    title: "Markdown Mode",
    description:
      "Switch to raw Markdown, keep your cursor position across the switch, and work fullscreen.",
    keywords: ["markdown", "raw", "fullscreen"],
  },
  {
    path: "/editing/rich-text-editor",
    title: "Rich Text Editor",
    description:
      "The visual editor — toolbars, the slash menu, keyboard shortcuts, formatting, and drag-and-drop blocks.",
    keywords: ["editor", "shortcut", "slash", "format"],
  },
  {
    path: "/editing/saving-and-publishing",
    title: "Saving & Publishing",
    description:
      "Publish, push as draft, save a draft without committing, and understand commit messages, validation, and build status.",
    keywords: ["publish", "save", "draft", "commit"],
  },
  {
    path: "/editing/seo-tools",
    title: "SEO Tools",
    description:
      "Preview your search result, edit the slug, and run content, link, and readability analysis on the page you're writing.",
    keywords: ["seo", "slug", "meta", "readability"],
  },
  {
    path: "/editing/snippets",
    title: "Content Snippets",
    description:
      "Save reusable shortcodes, components, and HTML blocks, then insert them anywhere with two clicks.",
    keywords: ["snippet", "shortcode", "component"],
  },
  {
    path: "/editing/version-history",
    title: "Version History & Rollback",
    description:
      "Review recent commits, undo one, or restore your site to an earlier version — without touching Git.",
    keywords: ["history", "undo", "revert", "rollback", "restore"],
  },
  {
    path: "/getting-started/add-new-site",
    title: "Add a New Site",
    description:
      "Connect an existing Git repository, clone a template, or import a purchased theme — and authorize GitHub or GitLab along the way.",
    keywords: ["add site", "connect", "repository", "import"],
  },
  {
    path: "/getting-started/configure-site",
    title: "Configure Your Site",
    description:
      "Point Sitepins at your content, media, public, and config folders, and choose how commit messages are written.",
    keywords: ["content folder", "media folder", "setup"],
  },
  {
    path: "/getting-started/global-search",
    title: "Global Search",
    description: "Jump to any file, organization, or setting with Cmd+K.",
    keywords: ["search", "cmd k"],
  },
  {
    path: "/getting-started/interface-tour",
    title: "Interface Tour",
    description:
      "Find your way around organizations, the project overview, the sidebar, and the editor layout.",
    keywords: ["interface", "navigation", "overview"],
  },
  {
    path: "/getting-started/start-from-template",
    title: "Start From a Template",
    description:
      "Browse the template gallery, fork a free starter into your own account, and unlock premium themes.",
    keywords: ["template", "theme", "starter"],
  },
  {
    path: "/organization/organizations",
    title: "Organizations",
    description:
      "Group sites and people, switch between organizations, and archive or delete one.",
    keywords: ["organization", "workspace", "switch"],
  },
  {
    path: "/organization/sandbox-settings",
    title: "Sandbox Settings",
    description:
      "Connect a Vercel access token so live preview can run your site in a sandbox.",
    keywords: ["vercel", "token", "sandbox"],
  },
  {
    path: "/project-settings/deployment",
    title: "Deployment",
    description:
      "How Sitepins commits trigger builds, one-click Vercel deployment, and reading build status.",
    keywords: ["deploy", "build", "vercel", "netlify"],
  },
  {
    path: "/project-settings/general",
    title: "General Settings",
    description:
      "Rename a site, set its URL and thumbnail, move it between organizations, archive it, or delete it.",
    keywords: ["rename site", "archive", "thumbnail"],
  },
  {
    path: "/project-settings/git-repository",
    title: "Git Repository",
    description:
      "Connect, switch, or disconnect the repository behind a project, and understand the permissions Sitepins asks for.",
    keywords: ["github", "gitlab", "disconnect", "permission"],
  },
  {
    path: "/self-hosting/overview",
    title: "Self-Hosting Overview",
    description:
      "What you get by running Sitepins yourself, prerequisites, architecture summary, and guide roadmap.",
    keywords: ["self host", "docker"],
  },
  {
    path: "/self-hosting/environment-variables",
    title: "Environment Variables",
    description:
      "Complete configuration reference for all backend (api/.env) and frontend (app/.env) variables in Sitepins Core.",
    keywords: ["env", "environment"],
  },
  {
    path: "/self-hosting/troubleshooting",
    title: "Troubleshooting & Operations",
    description:
      "Diagnostic matrices for common self-hosting issues, error resolutions, and MongoDB backup/restore procedures.",
    keywords: ["error", "troubleshoot", "backup"],
  },
];

const STOP_WORDS = new Set(
  "a an the and or of to in on for with how do i can my is are what where why when this that it be me we you your our".split(
    " ",
  ),
);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

/** Scores docs pages against a question by keyword overlap. */
export function findRelevantDocs(query: string, limit = 3): TDocEntry[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const lowerQuery = query.toLowerCase();

  const scored = DOCS_INDEX.map((doc) => {
    const title = tokenize(doc.title);
    const body = tokenize(`${doc.description} ${doc.path}`);
    let score = 0;
    for (const term of terms) {
      if (title.some((t) => t.startsWith(term) || term.startsWith(t)))
        score += 3;
      else if (body.some((t) => t.startsWith(term))) score += 1;
    }
    for (const kw of doc.keywords ?? []) {
      if (lowerQuery.includes(kw)) score += 4;
    }
    return { doc, score };
  })
    .filter((r) => r.score >= 3)
    .sort((a, b) => b.score - a.score);

  // Weak runners-up only add noise to the prompt; keep pages close to the best.
  const best = scored[0]?.score ?? 0;
  return scored
    .filter((r) => r.score >= best * 0.6)
    .slice(0, limit)
    .map((r) => r.doc);
}

/** Reduces a docs page's HTML to the readable text of its `<main>` body. */
export function extractDocText(html: string): string {
  const main =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    "";
  return main
    .replace(/<(script|style|svg|nav|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|tr|div|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const DOC_CACHE_TTL_MS = 60 * 60 * 1000;
const docCache = new Map<string, { text: string; at: number }>();

/**
 * Best-effort fetch of a docs page's text. Returns "" when the docs site is
 * unreachable (e.g. an offline self-hosted install) so callers can fall back
 * to the static title and description.
 */
export async function fetchDocExcerpt(
  docPath: string,
  maxChars = 3000,
  timeoutMs = 2500,
): Promise<string> {
  const cached = docCache.get(docPath);
  if (cached && Date.now() - cached.at < DOC_CACHE_TTL_MS) {
    return cached.text.slice(0, maxChars);
  }
  try {
    const res = await fetch(`${DOCS_BASE_URL}${docPath}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return "";
    const text = extractDocText(await res.text());
    docCache.set(docPath, { text, at: Date.now() });
    return text.slice(0, maxChars);
  } catch (err) {
    logger.warn("Docs excerpt fetch failed", err, { path: docPath });
    return "";
  }
}
