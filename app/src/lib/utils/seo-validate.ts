import { extractLinks } from "./link-analyzer";

export const META_TITLE_KEYS = [
  "metaTitle",
  "meta_title",
  "meta-title",
  "metaTitleText",
  "meta_title_text",
  "meta-title-text",
  "seoTitle",
  "seo_title",
  "seo-title",
  "pageTitle",
  "page_title",
  "page-title",
  "titleText",
  "title_text",
  "title-text",
  "title",
];

export const META_DESC_KEYS = [
  "metaDescription",
  "metaDesc",
  "meta_description",
  "meta-description",
  "metaDescText",
  "meta_desc",
  "meta-desc",
  "pageDescription",
  "page_description",
  "page-description",
  "descText",
  "desc_text",
  "desc-text",
  "desc",
  "description",
  "summary",
];

export const KEYWORD_KEYS = [
  "keywords",
  "tags",
  "keyWords",
  "keyword",
  "tag",
  "metaKeywords",
  "meta_keywords",
  "meta-keywords",
  "seoKeywords",
  "seo_keywords",
  "seo-keywords",
  "focusKeywords",
  "focus_keywords",
  "focus-keywords",
  "searchTags",
  "search_tags",
  "search-tags",
];

export function validateSEO(
  entry: Record<string, any>,
  markdownContent: string,
  baseUrl?: string,
  t?: (key: string, args?: any) => string,
) {
  const results: Record<string, any> = {};
  let good = 0;
  let bad = 0;
  let improvement = 0;

  // Helper: evaluate a check
  function trackResult(key: string, obj: any) {
    results[key] = obj;

    if (obj.valid === true) {
      good++;
    } else if (obj.valid === false) {
      bad++;
    } else {
      improvement++;
    }
  }

  function unwrap(val: any): any {
    if (val && typeof val === "object" && "value" in val) {
      return unwrap(val.value);
    }
    return val;
  }

  // --- Meta Title ---
  let metaTitleKeyUsed = META_TITLE_KEYS.find((k) => entry[k] !== undefined);
  const metaTitle = unwrap(
    metaTitleKeyUsed ? entry[metaTitleKeyUsed] : undefined,
  );
  const titleLen = metaTitle?.length ?? 0;

  trackResult(metaTitleKeyUsed || "metaTitle", {
    value: metaTitle,
    length: titleLen,
    valid:
      titleLen === 0
        ? false
        : titleLen >= 50 && titleLen <= 60
          ? true
          : undefined,
    percentage: Math.round((titleLen / 60) * 100),
    tip: t
      ? t("tips.meta_title_length")
      : "Meta title should be between 50–60 characters.",
  });

  // --- Meta Description ---
  let metaDescKeyUsed = META_DESC_KEYS.find((k) => entry[k] !== undefined);
  const metaDescription = unwrap(
    metaDescKeyUsed ? entry[metaDescKeyUsed] : undefined,
  );
  const descLen = metaDescription?.length ?? 0;

  trackResult(metaDescKeyUsed || "metaDescription", {
    value: metaDescription,
    length: descLen,
    valid:
      descLen === 0
        ? false
        : descLen >= 50 && descLen <= 160
          ? true
          : undefined,
    percentage: Math.round((descLen / 160) * 100),
    tip: t
      ? t("tips.meta_desc_length")
      : "Meta description should be 50–160 characters.",
  });

  // --- Word Count ---
  const contentKeys = ["content", "body", "text"];
  let contentKeyUsed = contentKeys.find((k) => entry[k] !== undefined);
  const content = unwrap(contentKeyUsed ? entry[contentKeyUsed] : undefined);
  const text = content?.replace(/<[^>]+>/g, "") ?? "";
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (contentKeyUsed) {
    trackResult(contentKeyUsed, {
      count: wordCount,
      valid: wordCount >= 300,
      percentage: Math.round((wordCount / 300) * 100),
      tip: t
        ? t("tips.content_length")
        : "Content should have at least 300 words.",
    });
  } else {
    improvement++;
  }

  // --- Keyword Density ---
  let keywordKeyUsed = KEYWORD_KEYS.find((k) => entry[k] !== undefined);
  const keywords = unwrap(keywordKeyUsed ? entry[keywordKeyUsed] : undefined);
  let keywordDensity: Record<string, number> = {};
  if (Array.isArray(keywords) && keywords.length && text) {
    keywords.forEach((kw: string) => {
      const re = new RegExp(`\\b${kw}\\b`, "gi");
      const matches = text.match(re)?.length || 0;
      keywordDensity[kw] = (matches / wordCount) * 100;
    });
    trackResult(keywordKeyUsed!, {
      density: keywordDensity,
      valid: Object.values(keywordDensity).some((d) => d >= 0.5 && d <= 3),
      tip: t
        ? t("tips.keyword_density")
        : "Keyword density should be 0.5–3% for each keyword.",
    });
  } else if (keywordKeyUsed) {
    improvement++;
  }

  // --- Slug Analysis ---
  const slug = unwrap(entry.slug);
  if (slug && typeof slug === "string") {
    const issues: string[] = [];

    // Check for underscores
    if (slug.includes("_")) {
      issues.push(
        t
          ? t("tips.slug_hyphens")
          : "Use hyphens (-) instead of underscores (_).",
      );
    }

    // Check for uppercase
    if (/[A-Z]/.test(slug)) {
      issues.push(
        t ? t("tips.slug_lowercase") : "Slug should be all lowercase.",
      );
    }

    // Check for stop words
    const stopWords = [
      "a",
      "an",
      "the",
      "of",
      "and",
      "to",
      "in",
      "is",
      "for",
      "on",
      "at",
      "by",
      "that",
      "with",
    ];
    const slugParts = slug.split(/[-_]+/).map((s: string) => s.toLowerCase());
    const foundStopWords = slugParts.filter((word: string) =>
      stopWords.includes(word),
    );
    if (foundStopWords.length > 0) {
      issues.push(
        t
          ? t("tips.slug_stop_words", { words: foundStopWords.join(", ") })
          : `Avoid stop words like: ${foundStopWords.join(", ")}.`,
      );
    }

    // Check for dates (simple year-like check)
    if (/\b(19|20)\d{2}\b/.test(slug)) {
      issues.push(
        t
          ? t("tips.slug_no_dates")
          : "Avoid adding years or dates which can date your content.",
      );
    }

    // Check for special characters
    if (/[^a-z0-9-]/.test(slug)) {
      issues.push(
        t
          ? t("tips.slug_no_special_chars")
          : "Remove special characters or symbols.",
      );
    }

    // Check for keyword stuffing
    if (slugParts.length > 5) {
      issues.push(t ? t("tips.slug_short") : "Keep it short (3-5 words).");
    }

    // Check if dynamic parameters
    if (slug.includes("?") || slug.includes("=")) {
      issues.push(t ? t("tips.slug_no_dynamic") : "Avoid dynamic parameters.");
    }

    trackResult("slug", {
      value: slug,
      valid: issues.length === 0 ? true : undefined,
      tip:
        issues.length > 0
          ? issues.join(" ")
          : t
            ? t("tips.slug_good")
            : "Slug looks good!",
    });
  } else {
    // If slug is missing (improvement, though in our UI it might always be present virtually)
    trackResult("slug", {
      valid: undefined,
      tip: t ? t("tips.slug_missing") : "Define a SEO-friendly slug.",
    });
  }

  // --- Link Extraction (Markdown & HTML) ---
  const allExtractedLinks = extractLinks(markdownContent, baseUrl);
  const internalLinks = allExtractedLinks.filter((l) => l.isInternal);
  const externalLinks = allExtractedLinks.filter((l) => !l.isInternal);

  // --- Alt Text ---
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: Array<{ alt: string; src: string; hasAlt: boolean }> = [];
  let imageMatch;
  while ((imageMatch = imageRegex.exec(markdownContent)) !== null) {
    const alt = imageMatch[1];
    const src = imageMatch[2];
    images.push({
      alt,
      src,
      hasAlt: alt.trim().length > 0,
    });
  }

  const imageCount = images.length;
  const imagesWithAlt = images.filter((img) => img.hasAlt).length;
  const altTextPercentage =
    imageCount > 0 ? Math.round((imagesWithAlt / imageCount) * 100) : 0;

  trackResult("Alt Text", {
    count: imageCount,
    withAlt: imagesWithAlt,
    withoutAlt: imageCount - imagesWithAlt,
    valid: imageCount === 0 || altTextPercentage >= 90,
    percentage: altTextPercentage,
    tip: t
      ? t("tips.alt_text")
      : "All images should have descriptive alt text for accessibility and SEO. Aim for 90%+ coverage.",
  });

  // --- Link Quality (only in seoInsights, not results) ---
  const allLinks = [...externalLinks, ...internalLinks];
  const descriptiveLinks = allLinks.filter(
    (link) =>
      link.text.length > 3 &&
      !/^(click here|read more|here|this|link)$/i.test(link.text),
  );

  // --- Open Graph ---
  const openGraphKeys = [
    "openGraph",
    "og",
    "og_graph",
    "og_image",
    "open_graph",
    "ogImage",
    "ogTitle",
    "ogDescription",
    "og:title",
    "og:description",
    "og:image",
    "openGraphData",
    "open_graph_data",
    "open-graph",
    "ogData",
    "og-data",
    "ogProperties",
    "ogProps",
    "openGraphProps",
    "openGraphProperties",
  ];
  let openGraphKeyUsed = openGraphKeys.find((k) => entry[k] !== undefined);
  const openGraph = unwrap(
    openGraphKeyUsed ? entry[openGraphKeyUsed] : undefined,
  );
  if (openGraphKeyUsed) {
    trackResult(openGraphKeyUsed, {
      valid:
        !!openGraph?.title && !!openGraph?.description && !!openGraph?.image,
      tip: t
        ? t("tips.og_tags")
        : "OG tags (title, description, image) should be defined for better social sharing.",
    });
  } else {
    improvement++;
  }

  // --- Canonical URL ---
  const canonicalKeys = [
    "canonicalUrl",
    "canonical",
    "canonical_url",
    "canonical-url",
    "canonicalLink",
    "canonical_link",
    "canonical-link",
    "relCanonical",
    "rel_canonical",
    "rel-canonical",
    "canonicalHref",
    "canonical_href",
    "canonical-href",
  ];
  let canonicalKeyUsed = canonicalKeys.find((k) => entry[k] !== undefined);
  const canonicalUrl = unwrap(
    canonicalKeyUsed ? entry[canonicalKeyUsed] : undefined,
  );
  if (canonicalKeyUsed) {
    trackResult(canonicalKeyUsed, {
      value: canonicalUrl,
      valid: !!canonicalUrl,
      tip: t
        ? t("tips.canonical_url")
        : "A canonical URL helps prevent duplicate content issues.",
    });
  } else {
    improvement++;
  }

  // --- Structured Data ---
  const structuredKeys = [
    "structuredData",
    "jsonLd",
    "schema",
    "structured_data",
    "structured-data",
    "jsonLD",
    "json_ld",
    "json-ld",
    "ldJson",
    "ld_json",
    "ld-json",
    "schemaOrg",
    "schema_org",
    "schema-org",
    "serpSchema",
    "serp_schema",
    "serp-schema",
  ];
  let structuredKeyUsed = structuredKeys.find((k) => entry[k] !== undefined);
  const structuredData = unwrap(
    structuredKeyUsed ? entry[structuredKeyUsed] : undefined,
  );
  if (structuredKeyUsed) {
    trackResult(structuredKeyUsed, {
      valid: !!structuredData,
      tip: t
        ? t("tips.json_ld")
        : "Include JSON-LD schema for better SERP enhancements.",
    });
  } else {
    improvement++;
  }

  // --- Meta Robots ---
  const robotsKeys = [
    "metaRobots",
    "robots",
    "meta_robots",
    "meta-robots",
    "robot",
    "robotsTag",
    "robots_tag",
    "robots-tag",
    "metaRobotsTag",
    "meta_robots_tag",
    "meta-robots-tag",
    "robotsDirective",
    "robots_directive",
    "robots-directive",
  ];
  let robotsKeyUsed = robotsKeys.find((k) => entry[k] !== undefined);
  const robots = unwrap(robotsKeyUsed ? entry[robotsKeyUsed] : undefined);
  const robotsArr = Array.isArray(robots) ? robots : robots ? [robots] : [];
  if (robotsKeyUsed) {
    trackResult(robotsKeyUsed, {
      value: robotsArr,
      valid: true,
      tip: t
        ? t("tips.meta_robots")
        : "Use meta robots if you need indexing restrictions (noindex, nofollow, etc.).",
    });
  }

  // --- Last Updated ---
  const lastUpdatedKeys = [
    "lastUpdated",
    "updatedAt",
    "modifiedAt",
    "last_update",
    "last-update",
    "lastModified",
    "last_modified",
    "last-modified",
    "modified",
    "updateDate",
    "update_date",
    "update-date",
    "dateModified",
    "date_modified",
    "date-modified",
    "dateUpdated",
    "date_updated",
    "date-updated",
    "date",
  ];
  let lastUpdatedKeyUsed = lastUpdatedKeys.find((k) => entry[k] !== undefined);
  const lastUpdated = unwrap(
    lastUpdatedKeyUsed ? entry[lastUpdatedKeyUsed] : undefined,
  );
  const updated = lastUpdated ? new Date(lastUpdated) : new Date(0);
  const withinYear =
    (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24 * 365) < 1;
  if (lastUpdatedKeyUsed) {
    trackResult(lastUpdatedKeyUsed, {
      value: updated,
      valid: withinYear,
      tip: t
        ? t("tips.content_freshness")
        : "Content should be updated at least once per year.",
    });
  } else {
    improvement++;
  }

  return {
    metaTitle,
    metaDescription,
    metaDate: lastUpdatedKeyUsed
      ? String(entry[lastUpdatedKeyUsed])
      : undefined,
    results,
    summary: {
      good,
      bad,
      improvement,
    },
    seoInsights: {
      externalLinks,
      internalLinks,
      images,
      linkQuality: {
        total: allLinks.length,
        descriptive: descriptiveLinks.length,
        generic: allLinks.length - descriptiveLinks.length,
      },
    },
  };
}

const TRANSITION_WORDS = [
  "however",
  "therefore",
  "moreover",
  "furthermore",
  "additionally",
  "meanwhile",
  "consequently",
  "nonetheless",
  "nevertheless",
  "in addition",
  "for example",
  "for instance",
  "such as",
  "in fact",
  "as a result",
  "in conclusion",
  "to summarize",
  "on the other hand",
  "in contrast",
  "similarly",
  "likewise",
  "in other words",
  "finally",
  "also",
  "besides",
  "indeed",
  "thus",
  "hence",
  "otherwise",
  "specifically",
  "in particular",
  "overall",
  "ultimately",
];

// Emotionally charged words that lift click-through when present in a title.
const POWER_WORDS = [
  "free",
  "instantly",
  "proven",
  "ultimate",
  "essential",
  "guaranteed",
  "effortless",
  "exclusive",
  "secret",
  "powerful",
  "incredible",
  "amazing",
  "surprising",
  "unbelievable",
  "remarkable",
  "effective",
  "complete",
  "definitive",
  "critical",
  "urgent",
  "limited",
  "quick",
  "easy",
  "simple",
  "best",
  "top",
  "new",
  "boost",
  "unlock",
  "master",
  "avoid",
  "mistake",
  "warning",
  "save",
  "win",
];

// Sentiment-bearing words used to detect whether a title evokes emotion.
const SENTIMENT_WORDS = [
  "amazing",
  "awesome",
  "best",
  "brilliant",
  "great",
  "love",
  "perfect",
  "stunning",
  "wonderful",
  "success",
  "win",
  "happy",
  "smart",
  "beautiful",
  "worst",
  "bad",
  "terrible",
  "awful",
  "fail",
  "mistake",
  "danger",
  "warning",
  "avoid",
  "hate",
  "painful",
  "shocking",
  "scary",
  "fear",
];

// Passive-voice heuristic: a "to be" verb followed (optionally via an adverb)
// by a past participle. Covers regular "-ed" endings plus common irregulars.
const PASSIVE_RE =
  /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w{2,}ed|written|done|made|given|taken|seen|known|shown|held|brought|built|sent|kept|left|found|told|thought|caught|taught|bought|sold|paid|put|set|read|met|won|lost|chosen|driven|broken|spoken|drawn|grown)\b/i;

// Strips code, resolves links/images to their visible text, and drops markdown
// punctuation so word/sentence/syllable counts run against prose only.
function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>~`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Approximate vowel-group syllable counter (standard readability-formula heuristic).
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;
  const reduced = cleaned
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const matches = reduced.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length > 2);
}

// Blank-line-separated blocks, excluding headings/list items/fenced code.
function getParagraphs(markdownContent: string): string[] {
  const withoutCode = markdownContent
    .replace(/```[\s\S]*?```/g, "\n\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n\n");
  return withoutCode
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block.length > 0 &&
        !/^#{1,6}\s+/.test(block) &&
        !/^[-*+]\s+/.test(block) &&
        !/^\d+\.\s+/.test(block),
    );
}

export function validateSeoInsights(
  entry: Record<string, any>,
  markdownContent: string,
  t?: (key: string, args?: any) => string,
  // Explicit target keyphrase from the SEO panel. When set it overrides the
  // frontmatter-derived keywords (tags etc.), which are a loose proxy at best.
  // Accepts a comma-separated list.
  focusKeyword?: string,
) {
  const results: Record<string, any> = {};
  let good = 0;
  let bad = 0;
  let improvement = 0;

  function trackResult(key: string, obj: any) {
    results[key] = obj;
    if (obj.valid === true) good++;
    else if (obj.valid === false) bad++;
    else improvement++;
  }

  function unwrap(val: any): any {
    if (val && typeof val === "object" && "value" in val) {
      return unwrap(val.value);
    }
    return val;
  }

  const plainText = stripMarkdownSyntax(markdownContent);
  const words = plainText.split(/\s+/).filter(Boolean);
  const sentences = splitSentences(plainText);
  const wordCount = words.length;
  const sentenceCount = sentences.length;

  // Fenced code blocks are removed before any markdown-structure detection so
  // that `#` comments, example image syntax, or anchor links inside code are
  // not miscounted as real headings/media/TOC links.
  const contentNoCode = markdownContent
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n");

  // --- Readability (Flesch Reading Ease) ---
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const readabilityScore =
    wordCount > 0 && sentenceCount > 0
      ? Math.round(
          206.835 -
            1.015 * (wordCount / sentenceCount) -
            84.6 * (syllableCount / wordCount),
        )
      : undefined;

  trackResult("readability", {
    value: readabilityScore,
    valid:
      readabilityScore === undefined
        ? undefined
        : readabilityScore >= 60
          ? true
          : readabilityScore >= 30
            ? undefined
            : false,
    percentage:
      readabilityScore === undefined
        ? 0
        : Math.max(0, Math.min(100, readabilityScore)),
    tip: t
      ? t("tips.readability")
      : "Aim for a readability score of 60+ (Flesch Reading Ease). Use shorter sentences and simpler words.",
  });

  // --- Heading Structure ---
  const headingLevels = [...contentNoCode.matchAll(/^(#{1,6})\s+.+$/gm)].map(
    (m) => m[1].length,
  );

  let hasSkippedLevel = false;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      hasSkippedLevel = true;
      break;
    }
  }

  trackResult("heading_structure", {
    count: headingLevels.length,
    valid:
      headingLevels.length === 0 ? undefined : hasSkippedLevel ? false : true,
    tip: t
      ? t("tips.heading_structure")
      : "Keep a logical heading order (H2 → H3 → H4) without skipping levels, and use subheadings to break up content.",
  });

  // --- Keyword in Intro Paragraph ---
  const keywordKeyUsed = KEYWORD_KEYS.find((k) => entry[k] !== undefined);
  const keywords = unwrap(keywordKeyUsed ? entry[keywordKeyUsed] : undefined);
  // Normalise to a string[]: arrays may hold plain strings or wrapped
  // { value } items; a scalar keyphrase comes through as a single string.
  const frontmatterKeywords: string[] = (
    Array.isArray(keywords) ? keywords : keywords != null ? [keywords] : []
  )
    .map((k) => unwrap(k))
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0);

  const explicitKeywords = (focusKeyword ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const keywordList: string[] = explicitKeywords.length
    ? explicitKeywords
    : frontmatterKeywords;

  const paragraphs = getParagraphs(markdownContent).map(stripMarkdownSyntax);
  const introText = (paragraphs[0] || "").toLowerCase();

  trackResult("keyword_first_paragraph", {
    valid:
      keywordList.length === 0
        ? undefined
        : keywordList.some((kw) => introText.includes(kw.toLowerCase())),
    tip: t
      ? t("tips.keyword_first_paragraph")
      : "Mention your focus keyword within the first paragraph to strengthen topical relevance.",
  });

  // --- Paragraph Length ---
  const paragraphWordCounts = paragraphs.map(
    (p) => p.split(/\s+/).filter(Boolean).length,
  );
  const longParagraphs = paragraphWordCounts.filter((c) => c > 150).length;

  trackResult("paragraph_length", {
    count: longParagraphs,
    length: paragraphs.length,
    percentage:
      paragraphs.length > 0
        ? Math.round((longParagraphs / paragraphs.length) * 100)
        : 0,
    valid:
      paragraphs.length === 0
        ? undefined
        : longParagraphs === 0
          ? true
          : longParagraphs / paragraphs.length > 0.5
            ? false
            : undefined,
    tip: t
      ? t("tips.paragraph_length")
      : "Keep paragraphs under ~150 words. Long paragraphs are harder to read and scan.",
  });

  // --- Sentence Length ---
  const sentenceWordCounts = sentences.map(
    (s) => s.split(/\s+/).filter(Boolean).length,
  );
  const longSentences = sentenceWordCounts.filter((c) => c > 20).length;
  const longSentencePercentage =
    sentenceCount > 0 ? Math.round((longSentences / sentenceCount) * 100) : 0;

  trackResult("sentence_length", {
    length: sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0,
    percentage: longSentencePercentage,
    valid:
      sentenceCount === 0
        ? undefined
        : longSentencePercentage <= 25
          ? true
          : longSentencePercentage <= 50
            ? undefined
            : false,
    tip: t
      ? t("tips.sentence_length")
      : "Keep most sentences under 20 words. Long sentences hurt readability.",
  });

  // --- Transition Words ---
  const sentencesWithTransition = sentences.filter((s) => {
    const lower = s.toLowerCase();
    return TRANSITION_WORDS.some((w) => lower.includes(w));
  }).length;
  const transitionPercentage =
    sentenceCount > 0
      ? Math.round((sentencesWithTransition / sentenceCount) * 100)
      : 0;

  trackResult("transition_words", {
    percentage: transitionPercentage,
    valid:
      sentenceCount < 3
        ? undefined
        : transitionPercentage >= 30
          ? true
          : transitionPercentage > 0
            ? undefined
            : false,
    tip: t
      ? t("tips.transition_words")
      : "Use transition words (e.g., however, therefore, for example) to improve flow between sentences.",
  });

  // --- Passive Voice ---
  const passiveCount = sentences.filter((s) => PASSIVE_RE.test(s)).length;
  const passivePercentage =
    sentenceCount > 0 ? Math.round((passiveCount / sentenceCount) * 100) : 0;

  trackResult("passive_voice", {
    percentage: passivePercentage,
    valid:
      sentenceCount < 3
        ? undefined
        : passivePercentage <= 10
          ? true
          : passivePercentage <= 20
            ? undefined
            : false,
    tip: t
      ? t("tips.passive_voice")
      : "Keep passive voice under 10% of sentences. Prefer active voice for clearer, more direct writing.",
  });

  // --- Em Dash Overuse ---
  // Heavy em-dash use is a common tell of AI-generated prose. Counted on
  // contentNoCode so dashes inside code samples don't skew the ratio.
  const emDashCount = (contentNoCode.match(/—|\s--\s/g) || []).length;
  const emDashPerSentence =
    sentenceCount > 0 ? emDashCount / sentenceCount : 0;

  trackResult("em_dash_overuse", {
    count: emDashCount,
    percentage: Math.min(Math.round(emDashPerSentence * 100), 100),
    valid:
      sentenceCount < 3
        ? undefined
        : emDashPerSentence <= 0.1
          ? true
          : emDashPerSentence <= 0.25
            ? undefined
            : false,
    tip: t
      ? t("tips.em_dash_overuse")
      : "Frequent em dashes (—) read as AI-generated. Prefer commas, parentheses, or splitting the sentence.",
  });

  // --- Subheading Distribution ---
  const sectionsBetweenHeadings = contentNoCode.split(/^#{1,6}\s+.+$/gm);
  const hasLongSectionWithoutHeading = sectionsBetweenHeadings.some(
    (section) =>
      stripMarkdownSyntax(section).split(/\s+/).filter(Boolean).length > 300,
  );

  trackResult("subheading_distribution", {
    valid:
      wordCount < 300
        ? undefined
        : hasLongSectionWithoutHeading
          ? false
          : true,
    tip: t
      ? t("tips.subheading_distribution")
      : "Break up long sections with subheadings. Avoid stretches of 300+ words without an H2 or H3.",
  });

  // --- Repeated Sentence Starts ---
  const firstWordOf = (s: string) =>
    s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  let hasRepeatedStart = false;
  for (let i = 2; i < sentences.length; i++) {
    const a = firstWordOf(sentences[i - 2]);
    const b = firstWordOf(sentences[i - 1]);
    const c = firstWordOf(sentences[i]);
    if (a && a === b && b === c) {
      hasRepeatedStart = true;
      break;
    }
  }

  trackResult("repeated_sentence_start", {
    valid:
      sentenceCount < 3 ? undefined : hasRepeatedStart ? undefined : true,
    tip: t
      ? t("tips.repeated_sentence_start")
      : "Avoid starting three or more consecutive sentences with the same word.",
  });

  // --- Focus Keyphrase Placement ---
  const kwMatch = (text?: string) =>
    !!text &&
    keywordList.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
  const hasKeyword = keywordList.length > 0;

  const metaTitleKey = META_TITLE_KEYS.find((k) => entry[k] !== undefined);
  const metaTitle = unwrap(metaTitleKey ? entry[metaTitleKey] : undefined) as
    | string
    | undefined;
  const metaDescKey = META_DESC_KEYS.find((k) => entry[k] !== undefined);
  const metaDescription = unwrap(
    metaDescKey ? entry[metaDescKey] : undefined,
  ) as string | undefined;
  const slug = unwrap(entry.slug) as string | undefined;

  const headingTexts = [...contentNoCode.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
    (m) => m[1],
  );
  const imageAlts = [...contentNoCode.matchAll(/!\[([^\]]*)\]/g)].map(
    (m) => m[1],
  );

  trackResult("keyphrase_in_title", {
    valid: !hasKeyword ? undefined : kwMatch(metaTitle),
    tip: t
      ? t("tips.keyphrase_in_title")
      : "Include your focus keyword in the SEO/meta title.",
  });

  trackResult("keyphrase_in_description", {
    valid: !hasKeyword ? undefined : kwMatch(metaDescription),
    tip: t
      ? t("tips.keyphrase_in_description")
      : "Include your focus keyword in the meta description.",
  });

  // Compare on alphanumeric-only forms so punctuation/spacing differences
  // (e.g. keyword "Next.js" vs slug "nextjs") still match.
  const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const slugKeywordMatch =
    hasKeyword &&
    !!slug &&
    keywordList.some((kw) => {
      const k = alnum(kw);
      return k.length > 0 && alnum(slug).includes(k);
    });

  trackResult("keyphrase_in_slug", {
    value: slug,
    valid: !hasKeyword ? undefined : slugKeywordMatch,
    tip: t
      ? t("tips.keyphrase_in_slug")
      : "Include your focus keyword in the URL slug.",
  });

  trackResult("keyphrase_in_subheadings", {
    valid:
      !hasKeyword || headingTexts.length === 0
        ? undefined
        : headingTexts.some((h) => kwMatch(h)),
    tip: t
      ? t("tips.keyphrase_in_subheadings")
      : "Use your focus keyword in at least one subheading (H2/H3).",
  });

  trackResult("keyphrase_in_alt", {
    valid:
      !hasKeyword || imageAlts.length === 0
        ? undefined
        : imageAlts.some((a) => kwMatch(a)),
    tip: t
      ? t("tips.keyphrase_in_alt")
      : "Include your focus keyword in at least one image's alt text.",
  });

  // --- Title Engagement ---
  const titleLower = (metaTitle || "").toLowerCase();

  trackResult("title_has_number", {
    valid: !metaTitle ? undefined : /\d/.test(metaTitle) ? true : undefined,
    tip: t
      ? t("tips.title_has_number")
      : "Adding a number to the title (e.g., a year or list count) can improve click-through rate.",
  });

  trackResult("title_power_word", {
    valid: !metaTitle
      ? undefined
      : POWER_WORDS.some((w) => titleLower.includes(w))
        ? true
        : undefined,
    tip: t
      ? t("tips.title_power_word")
      : "Add a power word (e.g., essential, proven, ultimate) to make the title more compelling.",
  });

  trackResult("title_sentiment", {
    valid: !metaTitle
      ? undefined
      : SENTIMENT_WORDS.some((w) => titleLower.includes(w))
        ? true
        : undefined,
    tip: t
      ? t("tips.title_sentiment")
      : "A title that evokes emotion (positive or negative) tends to attract more clicks.",
  });

  // --- Media Usage ---
  const mediaCount =
    (contentNoCode.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length +
    (contentNoCode.match(/<(?:img|video|iframe)\b/gi) || []).length;

  trackResult("media_count", {
    count: mediaCount,
    valid: mediaCount >= 3 ? true : mediaCount >= 1 ? undefined : false,
    tip: t
      ? t("tips.media_count")
      : "Add images or videos to enrich the content. Aim for at least a few relevant media items.",
  });

  // --- Slug Length ---
  trackResult("slug_length", {
    value: slug,
    length: slug?.length ?? 0,
    valid: !slug ? undefined : slug.length <= 75 ? true : false,
    tip: t
      ? t("tips.slug_length")
      : "Keep the URL slug concise — 75 characters or fewer.",
  });

  // --- Table of Contents ---
  const tocDetected =
    /^#{1,6}\s+(?:table of contents|contents|toc)\b/im.test(contentNoCode) ||
    /\{\{<?\s*toc/i.test(contentNoCode) ||
    /\[[^\]]+\]\(#[^)]+\)/.test(contentNoCode);

  trackResult("toc_present", {
    valid:
      headingTexts.length < 3 ? undefined : tocDetected ? true : undefined,
    tip: t
      ? t("tips.toc_present")
      : "For long posts with several sections, add a table of contents to aid navigation.",
  });

  return {
    results,
    summary: {
      good,
      bad,
      improvement,
    },
  };
}
