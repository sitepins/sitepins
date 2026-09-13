import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  extractJsonFromText,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { parseArrayItems } from "@/lib/utils/frontmatter-value";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    apiKey,
    provider,
    model,
    content = "",
    currentData = {},
    schema = [],
    filename = "",
    focusKeyword = "",
    targetField,
  } = await req.json();

  if (!content.trim() && !filename && Object.keys(currentData).length === 0) {
    return NextResponse.json(
      { error: "Content or file metadata is required" },
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

  const normalizedTarget =
    typeof targetField === "string" ? targetField.toLowerCase().trim() : "";

  const targetFieldDef = Array.isArray(schema)
    ? schema.find(
        (f: { name?: string; type?: string; options?: string[] }) =>
          f?.name === targetField ||
          f?.name?.toLowerCase() === normalizedTarget,
      )
    : undefined;

  const isArrayField = Boolean(
    targetFieldDef?.type === "Array" ||
    targetFieldDef?.type === "gallery" ||
    normalizedTarget.includes("tag") ||
    normalizedTarget.includes("categor") ||
    (normalizedTarget.includes("keyword") &&
      normalizedTarget !== "focuskeyword" &&
      normalizedTarget !== "targetkeyword"),
  );

  const allowedOptions =
    targetFieldDef?.options && Array.isArray(targetFieldDef.options)
      ? targetFieldDef.options
      : undefined;

  const optionsPrompt = allowedOptions?.length
    ? `\nCRITICAL: You MUST choose ONLY from these existing project options: ${JSON.stringify(allowedOptions)}.`
    : "";

  let fieldPrompt = "";
  if (normalizedTarget.includes("title")) {
    fieldPrompt = `Generate ONLY an engaging, SEO-optimized title for this document. Incorporate key themes naturally without keyword stuffing.
Return ONLY a valid JSON object matching this structure:
{
  "${targetField}": string
}`;
  } else if (
    normalizedTarget.includes("desc") ||
    normalizedTarget.includes("summary")
  ) {
    fieldPrompt = `Generate ONLY a compelling search snippet meta description (1 to 2 sentences) that accurately summarizes the document and encourages clicks.
Return ONLY a valid JSON object matching this structure:
{
  "${targetField}": string
}`;
  } else if (normalizedTarget === "slug") {
    fieldPrompt = `Generate ONLY a clean, lowercase, URL-safe hyphenated slug for this document (max 60 characters).
Return ONLY a valid JSON object matching this structure:
{
  "slug": string
}`;
  } else if (isArrayField) {
    fieldPrompt = `Generate ONLY a JSON array of 3 to 6 concise, relevant strings for the frontmatter array "${targetField}" based on the core topics of the text.${optionsPrompt}
IMPORTANT: Do NOT return a single comma-separated text string. You MUST return a JSON array containing individual string elements.
Example:
{
  "${targetField}": ["item1", "item2", "item3"]
}
Return ONLY a valid JSON object matching this structure.`;
  } else if (targetField) {
    fieldPrompt = `Generate an appropriate, production-ready value for the frontmatter field "${targetField}" based on the document content.
Return ONLY a valid JSON object matching this structure:
{
  "${targetField}": value
}`;
  }

  const systemPrompt = targetField
    ? `You are an expert SEO specialist and content editor for Sitepins, a Git-based headless CMS.
Analyze the provided document markdown content, file name, and existing frontmatter.

${fieldPrompt}`
    : `You are an expert SEO specialist and content editor for Sitepins, a Git-based headless CMS.
Analyze the provided document markdown content, file name, and existing frontmatter to generate optimized, production-ready metadata.

GUIDELINES:
1. "title": Engaging, SEO-optimized title. Incorporate key themes naturally without keyword stuffing.
2. "description": Compelling search snippet meta description (1 to 2 sentences) that encourages clicks.
3. "slug": Clean, lowercase, URL-safe hyphenated slug (max 60 characters).
4. "tags": Array of 3 to 6 concise, relevant tags based on the core topics of the text.
5. "focusKeyword": 2-to-4 word primary target keyphrase that best captures the central subject of the article.

Return ONLY a valid JSON object matching this exact structure:
{
  "title": string,
  "description": string,
  "slug": string,
  "tags": string[],
  "focusKeyword": string
}`;

  const userPrompt = `File: ${filename}
Focus Keyphrase: ${focusKeyword || "None provided"}
Existing Frontmatter: ${JSON.stringify(currentData)}
Schema Fields: ${JSON.stringify(schema.map((f: { name?: string; type?: string }) => f.name || f))}

Content Body:
${content.slice(0, 10000)}`;

  try {
    const response = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: getSafeMaxOutputTokens(
        resolved.provider,
        resolved.modelName,
        2048,
      ),
    });

    const parsed = extractJsonFromText<Record<string, unknown>>(response.text);

    if (targetField) {
      let val =
        parsed[targetField] ??
        parsed[normalizedTarget] ??
        Object.values(parsed)[0];

      if (isArrayField) {
        val = parseArrayItems(val);
      }

      return NextResponse.json({
        [targetField]: val,
        field: targetField,
        value: val,
      });
    }

    return NextResponse.json({
      title: (typeof parsed.title === "string" && parsed.title) || "",
      description:
        (typeof parsed.description === "string" && parsed.description) || "",
      slug: (typeof parsed.slug === "string" && parsed.slug) || "",
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).trim()).filter(Boolean)
        : typeof parsed.tags === "string"
          ? (parsed.tags as string)
              .split(/[,;\n]+/)
              .map((s) => s.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean)
          : [],
      focusKeyword:
        (typeof parsed.focusKeyword === "string" && parsed.focusKeyword) ||
        focusKeyword ||
        "",
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 500 },
      );
    }
    return handleAiRouteError(error, "Failed to generate metadata with AI");
  }
}
