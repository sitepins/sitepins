import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  getSafeInputCharLimit,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import {
  DOCS_BASE_URL,
  fetchDocExcerpt,
  findRelevantDocs,
} from "@/lib/ai/docs-index";
import { getAuth } from "@/lib/auth/auth-server";
import { logger } from "@/lib/logger";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

type TChatFileEntry = {
  path: string;
  updated?: string;
  created?: string;
  size?: number;
};

type TChatProjectContext = {
  projectId?: string;
  orgId?: string;
  repoName?: string;
  framework?: string;
  contentDir?: string;
  mediaDir?: string;
  branch?: string;
  collections?: Array<{ name: string; path: string; createUrl: string }>;
  configFiles?: string[];
  filesByCollection?: Record<string, Array<string | TChatFileEntry>>;
  totalFiles?: number;
};

type TReferencedFile = { path: string; content: string; current?: boolean };

const MAX_REFERENCED_FILES = 4;

const formatFileEntry = (f: string | TChatFileEntry): string => {
  if (typeof f !== "object" || f === null) return `    - ${String(f)}`;
  const meta = [
    f.updated ? `updated ${f.updated.slice(0, 10)}` : "",
    f.created ? `created ${f.created.slice(0, 10)}` : "",
    f.size ? `${f.size} B` : "",
  ].filter(Boolean);
  return `    - ${f.path}${meta.length ? ` (${meta.join(", ")})` : ""}`;
};

/**
 * Renders the file tree within a character budget rather than a fixed
 * per-collection cap, spreading the budget round-robin so one huge collection
 * cannot hide the others.
 */
function buildFileTreeBlock(
  filesByCollection: NonNullable<TChatProjectContext["filesByCollection"]>,
  maxChars: number,
): string {
  const entries = Object.entries(filesByCollection);
  const shown: Record<string, string[]> = Object.fromEntries(
    entries.map(([name]) => [name, []]),
  );
  let used = 0;
  let index = 0;
  let progressed = true;
  while (progressed && used < maxChars) {
    progressed = false;
    for (const [name, files] of entries) {
      const file = files[index];
      if (file === undefined) continue;
      const line = formatFileEntry(file);
      if (used + line.length + 1 > maxChars) {
        progressed = false;
        break;
      }
      shown[name].push(line);
      used += line.length + 1;
      progressed = true;
    }
    index++;
  }

  return entries
    .map(([name, files]) => {
      const lines = shown[name];
      const more = files.length - lines.length;
      return `  [${name}]:\n${lines.join("\n")}${more > 0 ? `\n    … (+${more} more)` : ""}`;
    })
    .join("\n\n");
}

function buildProjectInfo(projectContext: unknown, inputCharLimit: number) {
  if (!projectContext) return "  No project selected.";
  const ctx = projectContext as TChatProjectContext;

  const collectionsBlock =
    ctx.collections && ctx.collections.length > 0
      ? ctx.collections
          .map((c) => `  - "${c.name}" (${c.path}) → UI: ${c.createUrl}`)
          .join("\n")
      : "  (none)";

  const fileTreeBlock = ctx.filesByCollection
    ? buildFileTreeBlock(
        ctx.filesByCollection,
        Math.max(2_000, Math.floor(inputCharLimit / 3)),
      )
    : "  (not available)";

  return `ACTIVE PROJECT:
  Repo/Name  : ${ctx.repoName || ctx.projectId || "unknown"}
  Framework  : ${ctx.framework || "Static Site"}
  Content dir: ${ctx.contentDir || "src/content"}
  Media dir  : ${ctx.mediaDir || "src/assets"}
  Branch     : ${ctx.branch || "main"}
  Org ID     : ${ctx.orgId}
  Project ID : ${ctx.projectId}

URL TEMPLATES (use exact paths, never strip "${ctx.contentDir || "src/content"}/"):
  Content: /${ctx.orgId}/${ctx.projectId}/content/<fullRepoFilePath>
  Code   : /${ctx.orgId}/${ctx.projectId}/code/<fullRepoFilePath>
  Config : /${ctx.orgId}/${ctx.projectId}/config/<fullRepoFilePath>
  Media  : /${ctx.orgId}/${ctx.projectId}/media/<folderPath>
  Settings: /${ctx.orgId}/${ctx.projectId}/settings/
  Org Members: /${ctx.orgId}/settings/members
  AI Settings: /dashboard/ai-agent

CONTENT COLLECTIONS:
${collectionsBlock}

FILES IN REPO${ctx.totalFiles ? ` (${ctx.totalFiles} total)` : ""}:
${fileTreeBlock}
${ctx.configFiles?.length ? `\nCONFIG FILES:\n${ctx.configFiles.map((f) => `  - ${f}`).join("\n")}` : ""}`;
}

function buildReferencedFilesBlock(
  referencedFiles: unknown,
  maxChars: number,
): string {
  if (!Array.isArray(referencedFiles) || referencedFiles.length === 0) {
    return "";
  }
  const files = (referencedFiles as TReferencedFile[])
    .filter(
      (f) => f && typeof f.path === "string" && typeof f.content === "string",
    )
    .slice(0, MAX_REFERENCED_FILES);
  if (files.length === 0) return "";

  const perFile = Math.floor(maxChars / files.length);
  const blocks = files.map((f) => {
    const body =
      f.content.length > perFile
        ? `${f.content.slice(0, perFile)}\n… (truncated)`
        : f.content;
    return `--- ${f.path}${f.current ? " (the file the user is viewing now)" : ""} ---\n${body}`;
  });
  return `\nREFERENCED FILES (actual current contents):\n${blocks.join("\n\n")}\n`;
}

async function buildDocsBlock(question: string): Promise<string> {
  const docs = findRelevantDocs(question, 2);
  if (docs.length === 0) return "";
  const excerpts = await Promise.all(
    docs.map((doc) => fetchDocExcerpt(doc.path, 2500)),
  );
  const blocks = docs.map((doc, i) => {
    const url = `${DOCS_BASE_URL}${doc.path}`;
    return `### ${doc.title} — ${url}\n${excerpts[i] || doc.description}`;
  });
  return `\nSITEPINS DOCS (official documentation relevant to the question):\n${blocks.join("\n\n")}\n`;
}

const MAX_ACCOUNT_CONTEXT_CHARS = 2_000;

/**
 * Optional facts about the signed-in user's account, supplied through the
 * global search extension point (empty in this build). Informational only.
 */
function buildAccountBlock(accountContext: unknown): string {
  if (typeof accountContext !== "string" || !accountContext.trim()) return "";
  return `\nUSER ACCOUNT (use it for questions about the user's account, and link to the pages it mentions):\n${accountContext.trim().slice(0, MAX_ACCOUNT_CONTEXT_CHARS)}\n`;
}

function resolveLanguageName(locale: unknown): string {
  if (typeof locale !== "string" || !locale || locale === "en") {
    return "English";
  }
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return "English";
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    messages = [],
    apiKey,
    provider,
    model,
    projectContext,
    referencedFiles,
    accountContext,
    locale,
  } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array is required" },
      { status: 400 },
    );
  }

  // Sanitize and normalize conversation history:
  // 1. Only allow 'user' and 'assistant' roles (system belongs in systemPrompt)
  // 2. Keep the last 10 messages to stay well within TPM token limits on free tiers
  // 3. Merge consecutive same-role messages so roles strictly alternate (user -> assistant -> user)
  // 4. Ensure conversation starts and ends with a 'user' message
  const filteredMessages = messages
    .filter(
      (m: { role?: string; content?: string }) =>
        m &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        (m.role === "user" || m.role === "assistant"),
    )
    .slice(-10);

  const safeMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];
  for (const m of filteredMessages) {
    const last = safeMessages[safeMessages.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n\n${m.content.trim()}`;
    } else {
      safeMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content.trim(),
      });
    }
  }

  // Ensure first message is user
  while (safeMessages.length > 0 && safeMessages[0].role !== "user") {
    safeMessages.shift();
  }

  // Ensure last message is user
  while (
    safeMessages.length > 0 &&
    safeMessages[safeMessages.length - 1].role !== "user"
  ) {
    safeMessages.pop();
  }

  if (safeMessages.length === 0) {
    return NextResponse.json(
      { error: "No valid user query found in conversation" },
      { status: 400 },
    );
  }

  let resolved: ReturnType<typeof resolveLanguageModel>;
  try {
    resolved = resolveLanguageModel({
      apiKey,
      model,
      provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Missing AI API key.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const inputCharLimit = getSafeInputCharLimit(
    resolved.provider,
    resolved.modelName,
    60_000,
  );
  const lastUserMessage = safeMessages[safeMessages.length - 1].content;
  const projectInfo = buildProjectInfo(projectContext, inputCharLimit);
  const filesBlock = buildReferencedFilesBlock(
    referencedFiles,
    Math.floor(inputCharLimit / 3),
  );
  const docsBlock = await buildDocsBlock(lastUserMessage);
  const accountBlock = buildAccountBlock(accountContext);
  const languageName = resolveLanguageName(locale);

  const ctx = (projectContext ?? {}) as TChatProjectContext;
  const orgRef = ctx.orgId || "org";
  const projectRef = ctx.projectId || "proj";

  const systemPrompt = `You are Sitepins AI Copilot — an expert assistant inside Sitepins, a Git-backed Headless CMS.
${projectInfo}
${filesBlock}
${docsBlock}
${accountBlock}

CORE PRINCIPLES:
1. CONTINUOUS CONVERSATION CONTEXT:
   - Interpret short follow-ups ("code", "layout", "where?", "how to edit?") in the context of the previous turn!
   - Example: If the user previously asked how to edit homepage content, and now says "layout" or "code", immediately identify the homepage layout/template file (e.g. under Code & Templates or root: layouts/index.html, layouts/_default/baseof.html, or src/pages/index.astro) and provide the direct link under /code/...!
2. EXACT EDIT URLS:
   - FILES IN REPO lists full repository paths. Build links by appending the full path to the URL template, e.g. "/${orgRef}/${projectRef}/content/${ctx.contentDir || "src/content"}/...".
   - NEVER strip or omit the content directory prefix!
3. GROUNDING:
   - When REFERENCED FILES are provided, answer questions about content from them and say which file you used. Do not guess what a file contains if it is not provided — link to it instead.
   - For "how do I…" questions about Sitepins itself, base the steps on SITEPINS DOCS when provided and end with a link to the relevant docs page. Never invent menu names or settings that are not in the docs or context.
   - Use the updated/created dates in FILES IN REPO for time-based questions (today is ${new Date().toISOString().slice(0, 10)}).
4. FORMAT:
   - Render URLs as markdown links: [Edit Homepage](url), [Edit Layout](url), [Go to Media](url).
   - Be concise, direct, and helpful. Use bullet points.
5. COMMON TOPICS:
   - Site Configuration: Explain what site configuration controls (site metadata, theme settings, navigation) and provide direct links to config files under /config/... or project settings.
   - Team Members: Explain how to invite members with roles and permissions, and link directly to [Organization Members](/${orgRef}/settings/members).
6. LANGUAGE: Always reply in ${languageName}, but keep file paths, URLs and code unchanged.`;

  try {
    let streamError: Error | null = null;

    const result = streamText({
      model: resolved.model,
      system: systemPrompt,
      messages: safeMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      temperature: 0.3,
      maxOutputTokens: getSafeMaxOutputTokens(
        resolved.provider,
        resolved.modelName,
        2048,
      ),
      onError: async ({ error }) => {
        streamError = error instanceof Error ? error : new Error(String(error));
        logger.error("AI chat streaming error", {
          error: streamError.message,
        });
      },
    });

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        let chunkCount = 0;
        try {
          for await (const chunk of result.textStream) {
            chunkCount++;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err: unknown) {
          if (!streamError) {
            streamError = err instanceof Error ? err : new Error(String(err));
          }
        }

        // If no chunks were emitted and an error occurred during stream creation/execution
        if (chunkCount === 0 && streamError) {
          const errMsg = streamError.message || String(streamError);
          logger.error("AI chat stream error emitted to client", {
            error: errMsg,
          });

          let userFriendlyMessage = `⚠️ **AI Error**: ${errMsg}`;
          if (
            errMsg.includes("429") ||
            errMsg.toLowerCase().includes("rate limit") ||
            errMsg.toLowerCase().includes("tpm")
          ) {
            userFriendlyMessage =
              "⚠️ **AI Rate Limit Reached**\n\nThe provider rate limit was reached. Please wait a moment before asking your next question, or switch models in [AI Agent Settings](/dashboard/ai-agent).";
          } else if (
            errMsg.includes("401") ||
            errMsg.toLowerCase().includes("invalid api key") ||
            errMsg.toLowerCase().includes("unauthorized")
          ) {
            userFriendlyMessage =
              "⚠️ **Invalid AI API Key**\n\nPlease verify your API key in [AI Agent Settings](/dashboard/ai-agent).";
          } else if (
            errMsg.includes("404") ||
            errMsg.toLowerCase().includes("not found")
          ) {
            userFriendlyMessage =
              "⚠️ **Model Not Found**\n\nThe selected model is not available from your provider. Please choose another model in [AI Agent Settings](/dashboard/ai-agent).";
          } else if (
            errMsg.includes("413") ||
            errMsg.toLowerCase().includes("context")
          ) {
            userFriendlyMessage =
              "⚠️ **Context Limit Exceeded**\n\nClick **New query** below to start a fresh conversation.";
          }

          controller.enqueue(encoder.encode(userFriendlyMessage));
        }

        controller.close();
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return handleAiRouteError(error, "AI streaming failed");
  }
}
