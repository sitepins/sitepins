import { handleAiRouteError } from "@/lib/ai/ai-error-handler";
import {
  extractJsonFromText,
  getSafeMaxOutputTokens,
  resolveLanguageModel,
} from "@/lib/ai/ai-provider";
import { getAuth } from "@/lib/auth/auth-server";
import { logger } from "@/lib/logger";
import { extractArrayItemsFromText } from "@/lib/utils/frontmatter-value";
import { KEYWORD_KEYS } from "@/lib/utils/seo-validate";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

function fallbackExtractSeoFix(text: string): {
  suggestion: string;
  fieldToUpdate: string | null;
  explanation: string;
} | null {
  const suggestionMatch =
    text.match(
      /"suggestion"\s*:\s*"([\s\S]*?)(?<!\\)",?\s*"(?:fieldToUpdate|explanation)"/i,
    ) || text.match(/"suggestion"\s*:\s*"([\s\S]*?)"\s*}/i);

  const fieldMatch = text.match(/"fieldToUpdate"\s*:\s*(?:"([^"]+)"|null)/i);
  const explanationMatch = text.match(/"explanation"\s*:\s*"([\s\S]*?)"\s*}/i);

  if (suggestionMatch) {
    return {
      suggestion: suggestionMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
      fieldToUpdate: fieldMatch && fieldMatch[1] ? fieldMatch[1] : null,
      explanation: explanationMatch
        ? explanationMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n")
        : "",
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    apiKey,
    provider,
    model,
    metricKey = "",
    metricName = "",
    currentValue = "",
    recommendation = "",
    focusKeyword = "",
    content = "",
  } = await req.json();

  if (!metricKey) {
    return NextResponse.json(
      { error: "Metric key is required" },
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

  const normKey = (metricKey || "").toLowerCase();
  const normName = (metricName || "").toLowerCase();
  const isArrayMetric =
    KEYWORD_KEYS.some((k) => k.toLowerCase() === normKey) ||
    normKey === "tags" ||
    normKey === "keywords" ||
    normKey === "tag" ||
    normKey === "keyword" ||
    normKey === "categories" ||
    normKey === "category" ||
    normKey.includes("tag") ||
    normKey.includes("keyword") ||
    normKey.includes("categor") ||
    normName.includes("tag") ||
    normName.includes("keyword");

  const isContentMetric =
    normKey === "content" ||
    normName === "content" ||
    normKey.includes("sentence") ||
    normKey.includes("paragraph") ||
    normKey.includes("readability") ||
    normKey.includes("passive_voice") ||
    normKey.includes("transition") ||
    normKey.includes("heading") ||
    normKey.includes("subheading") ||
    normKey.includes("first_paragraph") ||
    (typeof recommendation === "string" &&
      recommendation.toLowerCase().includes("300 words"));

  const systemPrompt = `You are an expert SEO auditor, copywriter, and editor for Sitepins, a Git-based headless CMS.
You are tasked with fixing a specific SEO or readability issue reported by our SEO Doctor analysis.

CRITICAL INSTRUCTIONS:
1. Provide an actionable, direct fix that directly resolves the stated recommendation.
2. NEVER return vague advice, generic outlines, or conversational instructions like "Add at least 300 words..." or "You should expand the introduction...". You MUST WRITE THE ACTUAL TEXT/CONTENT that solves the issue directly so the user can immediately apply or copy it.
3. CONTENT LENGTH & EXPANSION FIXES:
   If the metric is "Content", "content", "content_length", or recommendation mentions "at least 300 words":
   - CRITICAL: DO NOT give advice or tell the user what to write!
   - You MUST WRITE THE FULL, EXPANDED, PRODUCTION-READY MARKDOWN ARTICLE BODY (minimum 350 to 500 words).
   - Expand the existing sections with engaging, informative, high-quality paragraphs, relevant subheadings, practical examples, and a concluding section.
   - If the current content contains placeholder Latin or short draft notes, replace it with authentic, compelling, well-crafted English prose that matches the document's headings and focus keyword.
   - Set "fieldToUpdate": "content".
   - "suggestion": The complete expanded document markdown text (at least 350 words).
   - "explanation": "Expanded the article with comprehensive, engaging content (350+ words) satisfying the minimum length requirement for SEO."
4. If the metric relates to a frontmatter field:
   - "metaTitle", "title", "keyphrase_in_title", "title_has_number", "title_power_word", "title_sentiment":
     Provide an improved, engaging title and specify "fieldToUpdate": "title".
     "suggestion": ONLY the clean title text string (no quotes, no markdown).
   - "metaDescription", "description", "keyphrase_in_description":
     Provide an improved search snippet meta description (1 to 2 sentences) and specify "fieldToUpdate": "description".
     "suggestion": ONLY the clean meta description text string (no quotes, no markdown).
   - "slug", "slug_length", "keyphrase_in_slug":
     Provide a clean lowercase hyphenated slug and specify "fieldToUpdate": "slug".
     "suggestion": ONLY the clean slug string (no quotes, no leading slash).
   - "tags", "keywords", "tag", "keyword", "categories", "category", or any keyword/tag density metric:
     Provide 3 to 6 high-value, relevant tags based on the document content that satisfy the 0.5-3% keyword density recommendation.
     Specify "fieldToUpdate": "${metricKey || "tags"}".
     "suggestion": Output ONLY a clean comma-separated list of items (e.g. "creative design, web design, user experience, content strategy"). Do NOT output yaml, code fences, bullet lists, or conversational prose in the suggestion field.
5. If the metric relates to content readability or structure:
   - "keyword_first_paragraph":
     Write the improved first paragraph with the focus keyphrase naturally placed within the opening sentences.
     Set "fieldToUpdate": "content".
     "suggestion": The rewritten content with the optimized opening paragraph.
   - "sentence_length", "paragraph_length", "passive_voice", "transition_words", "repeated_sentence_start", "em_dash_overuse":
     Rewrite the excerpt to solve the readability issue using active voice, varied sentence lengths, and natural transitions.
     Set "fieldToUpdate": "content".
     "suggestion": The improved, rewritten content.
   - "heading_structure", "subheading_distribution", "toc_present":
     Structure the content into clear, well-organized sections with appropriate markdown headings (## H2, ### H3).
     Set "fieldToUpdate": "content".
     "suggestion": The structured content with proper headings.
6. If the metric relates to media ("media_count", "keyphrase_in_alt"):
   - Provide concrete suggestions for relevant images or media with descriptive alt text to enrich the article.
   - Set "fieldToUpdate": null.
7. For any other metric:
   - Provide the exact concrete replacement text that solves the issue.
   - Set "fieldToUpdate": null.
8. "suggestion": The exact proposed replacement content or text. Never return meta-advice or instructions on what the user should write.
9. "explanation": 1 concise sentence explaining how this fix satisfies the guideline.

Return ONLY a valid JSON object matching this structure:
{
  "suggestion": string,
  "fieldToUpdate": string | null,
  "explanation": string
}`;

  const userPrompt = `SEO Check Metric: ${metricKey} (${metricName})
Current Value: ${typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue || "empty")}
Recommendation: ${recommendation}
Focus Keyphrase: ${focusKeyword || "None provided"}

${isContentMetric ? "TASK: Write the actual expanded/improved article markdown content directly resolving the recommendation above. Do NOT output commentary or advice." : ""}

Current Document Body:
${content ? content.slice(0, 8000) : "No body text currently present."}`;

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

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJsonFromText<Record<string, unknown>>(response.text);
    } catch (parseErr) {
      const fallback = fallbackExtractSeoFix(response.text);
      if (fallback) {
        parsed = fallback;
      } else {
        logger.error("Failed to parse SEO fix response from AI", {
          response: response.text,
          error:
            parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
        throw parseErr;
      }
    }

    let suggestion =
      (typeof parsed.suggestion === "string" && parsed.suggestion) || "";
    let fieldToUpdate =
      typeof parsed.fieldToUpdate === "string" ? parsed.fieldToUpdate : null;

    if (isArrayMetric) {
      fieldToUpdate = fieldToUpdate || metricKey || "tags";
      const items = extractArrayItemsFromText(suggestion);
      if (items.length > 0) {
        suggestion = items.join(", ");
      }
    } else if (isContentMetric) {
      fieldToUpdate = fieldToUpdate || "content";
    } else if (
      fieldToUpdate === "title" ||
      fieldToUpdate === "description" ||
      fieldToUpdate === "slug"
    ) {
      suggestion = suggestion.replace(/^["']+|["']+$/g, "").trim();
      if (fieldToUpdate === "slug") {
        suggestion = suggestion
          .replace(/^\/+|\/+$/g, "")
          .toLowerCase()
          .trim();
      }
    }

    return NextResponse.json({
      suggestion,
      fieldToUpdate,
      explanation:
        (typeof parsed.explanation === "string" && parsed.explanation) || "",
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 500 },
      );
    }
    return handleAiRouteError(error, "Failed to generate SEO fix with AI");
  }
}
