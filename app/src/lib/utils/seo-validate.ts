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

/**
 * Outcome of a single check. `na` means the check does not apply to this
 * entry (no images to caption, no keyphrase set, no body to read) and is
 * excluded from the score entirely rather than earning partial credit.
 */
export type TSeoStatus = "pass" | "warn" | "fail" | "na";

/** One row of an SEO report. */
export type TSeoCheck = {
  status: TSeoStatus;
  /** Relative importance in the overall score. */
  weight: number;
  /** Derived from `status`, for consumers that predate it. */
  valid?: boolean;
  value?: unknown;
  length?: number;
  percentage?: number;
  tip?: string;
  count?: number;
  /** Per-keyword occurrence rate, keyed by keyword. */
  density?: Record<string, number>;
  [key: string]: unknown;
};

export type TSeoResults = Record<string, TSeoCheck>;

/**
 * What a check reports. `weight` and `valid` are filled in by the tracker.
 * Spelled out rather than derived from `TSeoCheck`, because `Omit` over a type
 * with an index signature widens the named properties back to `unknown`.
 */
type TSeoCheckInput = {
  status: TSeoStatus;
  value?: unknown;
  length?: number;
  percentage?: number;
  tip?: string;
  count?: number;
  density?: Record<string, number>;
  [key: string]: unknown;
};

/** Score weights, by how much a check actually moves rankings. */
export const SEO_WEIGHT = {
  content: 4,
  meta: 3,
  important: 2,
  minor: 1,
} as const;

export type TSeoSummary = {
  good: number;
  bad: number;
  improvement: number;
  notApplicable: number;
};

function statusToValid(status: TSeoStatus): boolean | undefined {
  if (status === "pass") return true;
  if (status === "fail") return false;
  return undefined;
}

/** Collects rows into `results` and keeps a running summary. */
function makeTracker(results: TSeoResults) {
  const summary: TSeoSummary = {
    good: 0,
    bad: 0,
    improvement: 0,
    notApplicable: 0,
  };

  function track(key: string, weight: number, check: TSeoCheckInput) {
    results[key] = { ...check, weight, valid: statusToValid(check.status) };

    if (check.status === "pass") summary.good++;
    else if (check.status === "fail") summary.bad++;
    else if (check.status === "warn") summary.improvement++;
    else summary.notApplicable++;
  }

  return { summary, track };
}

function hasValue(raw: unknown): boolean {
  const value = unwrap(raw);
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Picks the first alias that actually holds a value, falling back to the first
 * one merely present. Without the second pass a declared-but-blank
 * `meta_title` would shadow a filled `title` further down the alias list.
 */
function resolveKey(
  entry: TSeoEntry,
  keys: readonly string[],
): string | undefined {
  return (
    keys.find((k) => entry[k] !== undefined && hasValue(entry[k])) ??
    keys.find((k) => entry[k] !== undefined)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalises frontmatter keywords to a flat list of non-empty strings. */
function toKeywordList(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : raw != null ? [raw] : [])
    .map((k) => unwrap(k))
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

/** Frontmatter, whose values may be raw or wrapped as `{ value }`. */
export type TSeoEntry = Record<string, unknown>;

export type TSeoTranslate = (
  key: string,
  args?: Record<string, string | number | Date>,
) => string;

/** Frontmatter values arrive either raw or nested under `value`. */
function unwrap(val: unknown): unknown {
  if (val && typeof val === "object" && "value" in val) {
    return unwrap((val as { value: unknown }).value);
  }
  return val;
}

export function validateSEO(
  entry: TSeoEntry,
  markdownContent: string,
  baseUrl?: string,
  t?: TSeoTranslate,
) {
  const results: TSeoResults = {};
  const { summary, track } = makeTracker(results);

  // --- Meta Title ---
  const metaTitleKeyUsed = resolveKey(entry, META_TITLE_KEYS);
  const metaTitle = unwrap(
    metaTitleKeyUsed ? entry[metaTitleKeyUsed] : undefined,
  ) as string | undefined;
  const titleLen = typeof metaTitle === "string" ? metaTitle.length : 0;

  track(metaTitleKeyUsed || "metaTitle", SEO_WEIGHT.meta, {
    value: metaTitle,
    length: titleLen,
    status:
      titleLen === 0
        ? "fail"
        : titleLen >= 50 && titleLen <= 60
          ? "pass"
          : "warn",
    percentage: Math.round((titleLen / 60) * 100),
    tip: t
      ? t("tips.meta_title_length")
      : "Meta title should be between 50–60 characters.",
  });

  // --- Meta Description ---
  const metaDescKeyUsed = resolveKey(entry, META_DESC_KEYS);
  const metaDescription = unwrap(
    metaDescKeyUsed ? entry[metaDescKeyUsed] : undefined,
  ) as string | undefined;
  const descLen =
    typeof metaDescription === "string" ? metaDescription.length : 0;

  track(metaDescKeyUsed || "metaDescription", SEO_WEIGHT.meta, {
    value: metaDescription,
    length: descLen,
    status:
      descLen === 0
        ? "fail"
        : descLen >= 50 && descLen <= 160
          ? "pass"
          : "warn",
    percentage: Math.round((descLen / 160) * 100),
    tip: t
      ? t("tips.meta_desc_length")
      : "Meta description should be 50–160 characters.",
  });

  // --- Word Count ---
  // Body first, frontmatter keys as fallback.
  const contentKeys = ["content", "body", "text"];
  const contentKeyUsed = resolveKey(entry, contentKeys);
  const entryContent = unwrap(
    contentKeyUsed ? entry[contentKeyUsed] : undefined,
  );
  const rawBody =
    typeof markdownContent === "string" && markdownContent.trim()
      ? markdownContent
      : typeof entryContent === "string"
        ? entryContent
        : "";
  const text = rawBody.replace(/<[^>]+>/g, "");
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  track(contentKeyUsed || "Content", SEO_WEIGHT.content, {
    count: wordCount,
    status: wordCount >= 300 ? "pass" : wordCount >= 100 ? "warn" : "fail",
    percentage: Math.round((wordCount / 300) * 100),
    tip: t
      ? t("tips.content_length")
      : "Content should have at least 300 words.",
  });

  // --- Keyword Density ---
  const keywordKeyUsed = resolveKey(entry, KEYWORD_KEYS);
  const keywordList = toKeywordList(
    unwrap(keywordKeyUsed ? entry[keywordKeyUsed] : undefined),
  );
  const keywordDensity: Record<string, number> = {};
  if (keywordList.length && wordCount > 0) {
    keywordList.forEach((kw) => {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "gi");
      keywordDensity[kw] = ((text.match(re)?.length || 0) / wordCount) * 100;
    });
  }

  track(keywordKeyUsed || "keywords", SEO_WEIGHT.minor, {
    density: keywordDensity,
    status: !keywordKeyUsed
      ? "na"
      : keywordList.length === 0
        ? "fail"
        : wordCount === 0
          ? "na"
          : Object.values(keywordDensity).some((d) => d >= 0.5 && d <= 3)
            ? "pass"
            : "warn",
    tip: t
      ? t("tips.keyword_density")
      : "Keyword density should be 0.5–3% for each keyword.",
  });

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

    track("slug", SEO_WEIGHT.important, {
      value: slug,
      status: issues.length === 0 ? "pass" : "warn",
      tip:
        issues.length > 0
          ? issues.join(" ")
          : t
            ? t("tips.slug_good")
            : "Slug looks good!",
    });
  } else {
    track("slug", SEO_WEIGHT.important, {
      status: "fail",
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

  track("Alt Text", SEO_WEIGHT.important, {
    count: imageCount,
    withAlt: imagesWithAlt,
    withoutAlt: imageCount - imagesWithAlt,
    // No images is "nothing to caption", not a pass.
    status:
      imageCount === 0
        ? "na"
        : altTextPercentage >= 90
          ? "pass"
          : altTextPercentage >= 50
            ? "warn"
            : "fail",
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
  const openGraphKeyUsed = resolveKey(entry, openGraphKeys);
  const openGraph = unwrap(
    openGraphKeyUsed ? entry[openGraphKeyUsed] : undefined,
  );
  // The field is either a string or an object of parts; both are scored below.
  const openGraphParts =
    openGraph && typeof openGraph === "object"
      ? (openGraph as {
          title?: unknown;
          description?: unknown;
          image?: unknown;
        })
      : undefined;
  // A schema with no OG field at all is not the author's fault — `na`, not a
  // penalty. Same for the canonical / structured-data / freshness checks below.
  const ogParts = [
    openGraphParts?.title,
    openGraphParts?.description,
    openGraphParts?.image,
  ].filter(Boolean).length;

  track(openGraphKeyUsed || "openGraph", SEO_WEIGHT.minor, {
    status: !openGraphKeyUsed
      ? "na"
      : typeof openGraph === "string"
        ? openGraph.trim()
          ? "pass"
          : "fail"
        : ogParts === 3
          ? "pass"
          : ogParts > 0
            ? "warn"
            : "fail",
    tip: t
      ? t("tips.og_tags")
      : "OG tags (title, description, image) should be defined for better social sharing.",
  });

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
  const canonicalKeyUsed = resolveKey(entry, canonicalKeys);
  const canonicalUrl = unwrap(
    canonicalKeyUsed ? entry[canonicalKeyUsed] : undefined,
  );
  track(canonicalKeyUsed || "canonicalUrl", SEO_WEIGHT.minor, {
    value: canonicalUrl,
    status: !canonicalKeyUsed ? "na" : canonicalUrl ? "pass" : "fail",
    tip: t
      ? t("tips.canonical_url")
      : "A canonical URL helps prevent duplicate content issues.",
  });

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
  const structuredKeyUsed = resolveKey(entry, structuredKeys);
  const structuredData = unwrap(
    structuredKeyUsed ? entry[structuredKeyUsed] : undefined,
  );
  track(structuredKeyUsed || "structuredData", SEO_WEIGHT.minor, {
    status: !structuredKeyUsed ? "na" : structuredData ? "pass" : "fail",
    tip: t
      ? t("tips.json_ld")
      : "Include JSON-LD schema for better SERP enhancements.",
  });

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
  const robotsKeyUsed = resolveKey(entry, robotsKeys);
  const robots = unwrap(robotsKeyUsed ? entry[robotsKeyUsed] : undefined);
  const robotsArr = Array.isArray(robots) ? robots : robots ? [robots] : [];
  // Informational only: any robots directive is a deliberate choice, so this
  // never earns or costs points.
  if (robotsKeyUsed) {
    track(robotsKeyUsed, SEO_WEIGHT.minor, {
      value: robotsArr,
      status: "na",
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
  const lastUpdatedKeyUsed = resolveKey(entry, lastUpdatedKeys);
  const lastUpdated = unwrap(
    lastUpdatedKeyUsed ? entry[lastUpdatedKeyUsed] : undefined,
  );
  const parsedUpdate =
    lastUpdated != null && lastUpdated !== ""
      ? new Date(lastUpdated as string | number | Date)
      : null;
  // An unparseable or blank date is a failure, not "very old".
  const updatedAt =
    parsedUpdate && !Number.isNaN(parsedUpdate.getTime()) ? parsedUpdate : null;
  const ageYears = updatedAt
    ? (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 365)
    : Infinity;

  track(lastUpdatedKeyUsed || "lastUpdated", SEO_WEIGHT.important, {
    value: updatedAt ?? undefined,
    status: !lastUpdatedKeyUsed
      ? "na"
      : !updatedAt
        ? "fail"
        : ageYears < 1
          ? "pass"
          : ageYears < 2
            ? "warn"
            : "fail",
    tip: t
      ? t("tips.content_freshness")
      : "Content should be updated at least once per year.",
  });

  return {
    metaTitle,
    metaDescription,
    metaDate: updatedAt ? updatedAt.toISOString() : undefined,
    wordCount,
    results,
    summary,
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
  entry: TSeoEntry,
  markdownContent: string,
  t?: TSeoTranslate,
  // Explicit target keyphrase from the SEO panel. When set it overrides the
  // frontmatter-derived keywords (tags etc.), which are a loose proxy at best.
  // Accepts a comma-separated list.
  focusKeyword?: string,
) {
  const results: TSeoResults = {};
  const { summary, track } = makeTracker(results);

  const plainText = stripMarkdownSyntax(markdownContent);
  const words = plainText.split(/\s+/).filter(Boolean);
  const sentences = splitSentences(plainText);
  const wordCount = words.length;
  const sentenceCount = sentences.length;
  const hasContent = wordCount > 0;
  // Below three sentences the prose ratios (passive voice, transitions, em
  // dashes) are statistically meaningless.
  const hasSample = sentenceCount >= 3;

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

  track("readability", SEO_WEIGHT.important, {
    value: readabilityScore,
    status:
      readabilityScore === undefined
        ? "na"
        : readabilityScore >= 60
          ? "pass"
          : readabilityScore >= 30
            ? "warn"
            : "fail",
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

  track("heading_structure", SEO_WEIGHT.important, {
    count: headingLevels.length,
    status: !hasContent
      ? "na"
      : headingLevels.length === 0
        ? "warn"
        : hasSkippedLevel
          ? "fail"
          : "pass",
    tip: t
      ? t("tips.heading_structure")
      : "Keep a logical heading order (H2 → H3 → H4) without skipping levels, and use subheadings to break up content.",
  });

  // --- Keyword in Intro Paragraph ---
  const keywordKeyUsed = resolveKey(entry, KEYWORD_KEYS);
  const keywords = unwrap(keywordKeyUsed ? entry[keywordKeyUsed] : undefined);
  // Arrays may hold plain strings or wrapped { value } items; a scalar
  // keyphrase comes through as a single string.
  const frontmatterKeywords = toKeywordList(keywords);

  const explicitKeywords = (focusKeyword ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const keywordList: string[] = explicitKeywords.length
    ? explicitKeywords
    : frontmatterKeywords;

  const paragraphs = getParagraphs(markdownContent).map(stripMarkdownSyntax);
  const introText = (paragraphs[0] || "").toLowerCase();

  track("keyword_first_paragraph", SEO_WEIGHT.minor, {
    status:
      keywordList.length === 0 || !hasContent
        ? "na"
        : keywordList.some((kw) => introText.includes(kw.toLowerCase()))
          ? "pass"
          : "fail",
    tip: t
      ? t("tips.keyword_first_paragraph")
      : "Mention your focus keyword within the first paragraph to strengthen topical relevance.",
  });

  // --- Paragraph Length ---
  const paragraphWordCounts = paragraphs.map(
    (p) => p.split(/\s+/).filter(Boolean).length,
  );
  const longParagraphs = paragraphWordCounts.filter((c) => c > 150).length;

  track("paragraph_length", SEO_WEIGHT.minor, {
    count: longParagraphs,
    length: paragraphs.length,
    percentage:
      paragraphs.length > 0
        ? Math.round((longParagraphs / paragraphs.length) * 100)
        : 0,
    status:
      paragraphs.length === 0
        ? "na"
        : longParagraphs === 0
          ? "pass"
          : longParagraphs / paragraphs.length > 0.5
            ? "fail"
            : "warn",
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

  track("sentence_length", SEO_WEIGHT.minor, {
    length: sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0,
    percentage: longSentencePercentage,
    status:
      sentenceCount === 0
        ? "na"
        : longSentencePercentage <= 25
          ? "pass"
          : longSentencePercentage <= 50
            ? "warn"
            : "fail",
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

  track("transition_words", SEO_WEIGHT.minor, {
    percentage: transitionPercentage,
    status: !hasSample
      ? "na"
      : transitionPercentage >= 30
        ? "pass"
        : transitionPercentage > 0
          ? "warn"
          : "fail",
    tip: t
      ? t("tips.transition_words")
      : "Use transition words (e.g., however, therefore, for example) to improve flow between sentences.",
  });

  // --- Passive Voice ---
  const passiveCount = sentences.filter((s) => PASSIVE_RE.test(s)).length;
  const passivePercentage =
    sentenceCount > 0 ? Math.round((passiveCount / sentenceCount) * 100) : 0;

  track("passive_voice", SEO_WEIGHT.minor, {
    percentage: passivePercentage,
    status: !hasSample
      ? "na"
      : passivePercentage <= 10
        ? "pass"
        : passivePercentage <= 20
          ? "warn"
          : "fail",
    tip: t
      ? t("tips.passive_voice")
      : "Keep passive voice under 10% of sentences. Prefer active voice for clearer, more direct writing.",
  });

  // --- Em Dash Overuse ---
  // Heavy em-dash use is a common tell of AI-generated prose. Counted on
  // contentNoCode so dashes inside code samples don't skew the ratio.
  const emDashCount = (contentNoCode.match(/—|\s--\s/g) || []).length;
  const emDashPerSentence = sentenceCount > 0 ? emDashCount / sentenceCount : 0;

  track("em_dash_overuse", SEO_WEIGHT.minor, {
    count: emDashCount,
    percentage: Math.min(Math.round(emDashPerSentence * 100), 100),
    status: !hasSample
      ? "na"
      : emDashPerSentence <= 0.1
        ? "pass"
        : emDashPerSentence <= 0.25
          ? "warn"
          : "fail",
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

  track("subheading_distribution", SEO_WEIGHT.minor, {
    status:
      wordCount < 300 ? "na" : hasLongSectionWithoutHeading ? "fail" : "pass",
    tip: t
      ? t("tips.subheading_distribution")
      : "Break up long sections with subheadings. Avoid stretches of 300+ words without an H2 or H3.",
  });

  // --- Repeated Sentence Starts ---
  const firstWordOf = (s: string) =>
    s
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, "") || "";
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

  track("repeated_sentence_start", SEO_WEIGHT.minor, {
    status: !hasSample ? "na" : hasRepeatedStart ? "warn" : "pass",
    tip: t
      ? t("tips.repeated_sentence_start")
      : "Avoid starting three or more consecutive sentences with the same word.",
  });

  // --- Focus Keyphrase Placement ---
  const kwMatch = (text?: string) =>
    !!text &&
    keywordList.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
  const hasKeyword = keywordList.length > 0;

  const metaTitleKey = resolveKey(entry, META_TITLE_KEYS);
  const metaTitle = unwrap(metaTitleKey ? entry[metaTitleKey] : undefined) as
    string | undefined;
  const metaDescKey = resolveKey(entry, META_DESC_KEYS);
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

  track("keyphrase_in_title", SEO_WEIGHT.important, {
    status: !hasKeyword ? "na" : kwMatch(metaTitle) ? "pass" : "fail",
    tip: t
      ? t("tips.keyphrase_in_title")
      : "Include your focus keyword in the SEO/meta title.",
  });

  track("keyphrase_in_description", SEO_WEIGHT.important, {
    status: !hasKeyword ? "na" : kwMatch(metaDescription) ? "pass" : "fail",
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

  track("keyphrase_in_slug", SEO_WEIGHT.important, {
    value: slug,
    status: !hasKeyword || !slug ? "na" : slugKeywordMatch ? "pass" : "fail",
    tip: t
      ? t("tips.keyphrase_in_slug")
      : "Include your focus keyword in the URL slug.",
  });

  track("keyphrase_in_subheadings", SEO_WEIGHT.minor, {
    status:
      !hasKeyword || headingTexts.length === 0
        ? "na"
        : headingTexts.some((h) => kwMatch(h))
          ? "pass"
          : "fail",
    tip: t
      ? t("tips.keyphrase_in_subheadings")
      : "Use your focus keyword in at least one subheading (H2/H3).",
  });

  track("keyphrase_in_alt", SEO_WEIGHT.minor, {
    status:
      !hasKeyword || imageAlts.length === 0
        ? "na"
        : imageAlts.some((a) => kwMatch(a))
          ? "pass"
          : "fail",
    tip: t
      ? t("tips.keyphrase_in_alt")
      : "Include your focus keyword in at least one image's alt text.",
  });

  // --- Title Engagement ---
  const titleLower = (metaTitle || "").toLowerCase();

  track("title_has_number", SEO_WEIGHT.minor, {
    status: !metaTitle ? "na" : /\d/.test(metaTitle) ? "pass" : "warn",
    tip: t
      ? t("tips.title_has_number")
      : "Adding a number to the title (e.g., a year or list count) can improve click-through rate.",
  });

  track("title_power_word", SEO_WEIGHT.minor, {
    status: !metaTitle
      ? "na"
      : POWER_WORDS.some((w) => titleLower.includes(w))
        ? "pass"
        : "warn",
    tip: t
      ? t("tips.title_power_word")
      : "Add a power word (e.g., essential, proven, ultimate) to make the title more compelling.",
  });

  track("title_sentiment", SEO_WEIGHT.minor, {
    status: !metaTitle
      ? "na"
      : SENTIMENT_WORDS.some((w) => titleLower.includes(w))
        ? "pass"
        : "warn",
    tip: t
      ? t("tips.title_sentiment")
      : "A title that evokes emotion (positive or negative) tends to attract more clicks.",
  });

  // --- Media Usage ---
  const mediaCount =
    (contentNoCode.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length +
    (contentNoCode.match(/<(?:img|video|iframe)\b/gi) || []).length;

  track("media_count", SEO_WEIGHT.important, {
    count: mediaCount,
    status: !hasContent
      ? "na"
      : mediaCount >= 3
        ? "pass"
        : mediaCount >= 1
          ? "warn"
          : "fail",
    tip: t
      ? t("tips.media_count")
      : "Add images or videos to enrich the content. Aim for at least a few relevant media items.",
  });

  // --- Slug Length ---
  track("slug_length", SEO_WEIGHT.minor, {
    value: slug,
    length: slug?.length ?? 0,
    status: !slug ? "na" : slug.length <= 75 ? "pass" : "fail",
    tip: t
      ? t("tips.slug_length")
      : "Keep the URL slug concise — 75 characters or fewer.",
  });

  // --- Table of Contents ---
  const tocDetected =
    /^#{1,6}\s+(?:table of contents|contents|toc)\b/im.test(contentNoCode) ||
    /\{\{<?\s*toc/i.test(contentNoCode) ||
    /\[[^\]]+\]\(#[^)]+\)/.test(contentNoCode);

  track("toc_present", SEO_WEIGHT.minor, {
    status: headingTexts.length < 3 ? "na" : tocDetected ? "pass" : "warn",
    tip: t
      ? t("tips.toc_present")
      : "For long posts with several sections, add a table of contents to aid navigation.",
  });

  return { results, summary };
}

const STATUS_CREDIT: Record<TSeoStatus, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  na: 0,
};

/** Under this word count a post is a stub, whatever its metadata looks like. */
const STUB_WORD_COUNT = 100;
const STUB_SCORE_CAP = 40;

type TScorableRow = {
  status?: TSeoStatus;
  valid?: boolean;
  weight?: number;
};

/** Rows written before `status` existed are read through `valid`. */
export function getSeoStatus(row: TScorableRow): TSeoStatus {
  if (row.status) return row.status;
  if (row.valid === true) return "pass";
  if (row.valid === false) return "fail";
  return "warn";
}

/**
 * Weighted score (0-100) across every result set given. `na` rows are dropped
 * from both sides of the ratio so an entry with nothing to analyse cannot
 * coast on partial credit. Null when no check applies.
 */
export function getSeoScore(
  resultSets: Array<Record<string, TScorableRow> | undefined | null>,
  wordCount?: number,
): number | null {
  const rows = resultSets.flatMap((set) => (set ? Object.values(set) : []));
  const scored = rows.filter((row) => getSeoStatus(row) !== "na");
  if (!scored.length) return null;

  const possible = scored.reduce((sum, row) => sum + (row.weight ?? 1), 0);
  if (possible === 0) return null;

  const earned = scored.reduce(
    (sum, row) => sum + (row.weight ?? 1) * STATUS_CREDIT[getSeoStatus(row)],
    0,
  );
  const score = Math.round((earned / possible) * 100);

  if (wordCount === undefined) return score;
  if (wordCount === 0) return 0;
  return wordCount < STUB_WORD_COUNT ? Math.min(score, STUB_SCORE_CAP) : score;
}
