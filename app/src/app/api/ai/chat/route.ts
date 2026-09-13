import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { logger } from "@/lib/logger";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

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

  const projectInfo = projectContext
    ? (() => {
        const ctx = projectContext as {
          projectId?: string;
          orgId?: string;
          repoName?: string;
          framework?: string;
          contentDir?: string;
          mediaDir?: string;
          branch?: string;
          collections?: Array<{
            name: string;
            path: string;
            createUrl: string;
          }>;
          configFiles?: string[];
          filesByCollection?: Record<
            string,
            Array<string | { path: string; url: string }>
          >;
        };

        const collectionsBlock =
          ctx.collections && ctx.collections.length > 0
            ? ctx.collections
                .map((c) => `  - "${c.name}" (${c.path}) → UI: ${c.createUrl}`)
                .join("\n")
            : "  (none)";

        const fileTreeBlock = ctx.filesByCollection
          ? Object.entries(ctx.filesByCollection)
              .map(([collection, files]) => {
                const shown = files.slice(0, 15);
                const more = files.length - shown.length;
                const list = shown
                  .map((f) =>
                    typeof f === "object" && f !== null && "path" in f
                      ? `    - ${f.path}`
                      : `    - ${String(f)}`,
                  )
                  .join("\n");
                return `  [${collection}]:\n${list}${more > 0 ? `\n    … (+${more} more)` : ""}`;
              })
              .join("\n\n")
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

FILES IN REPO:
${fileTreeBlock}
${ctx.configFiles?.length ? `\nCONFIG FILES:\n${ctx.configFiles.map((f) => `  - ${f}`).join("\n")}` : ""}`;
      })()
    : "  No project selected.";

  const systemPrompt = `You are Sitepins AI Copilot — an expert assistant inside Sitepins, a Git-backed Headless CMS.
${projectInfo}

CORE PRINCIPLES:
1. CONTINUOUS CONVERSATION CONTEXT:
   - Interpret short follow-ups ("code", "layout", "where?", "how to edit?") in the context of the previous turn!
   - Example: If the user previously asked how to edit homepage content, and now says "layout" or "code", immediately identify the homepage layout/template file (e.g. under Code & Templates or root: layouts/index.html, layouts/_default/baseof.html, or src/pages/index.astro) and provide the direct link under /code/...!
2. EXACT EDIT URLS:
   - Always preserve the full file path including parent folder (e.g. "/${(projectContext as { orgId?: string })?.orgId || "org"}/${(projectContext as { projectId?: string })?.projectId || "proj"}/content/${(projectContext as { contentDir?: string })?.contentDir || "src/content"}/...").
   - NEVER strip or omit the content directory prefix!
3. FORMAT:
   - Render URLs as markdown links: [Edit Homepage](url), [Edit Layout](url), [Go to Media](url).
   - Be concise, direct, and helpful. Use bullet points.
4. COMMON TOPICS:
   - Site Configuration: Explain what site configuration controls (site metadata, theme settings, navigation) and provide direct links to config files under /config/... or project settings.
   - Team Members: Explain how to invite members with roles and permissions, and link directly to [Organization Members](/${(projectContext as { orgId?: string })?.orgId || "org"}/settings/members).`;

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
