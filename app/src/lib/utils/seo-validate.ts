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
  const keywordKeys = [
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
  let keywordKeyUsed = keywordKeys.find((k) => entry[k] !== undefined);
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
