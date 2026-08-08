import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The SEO panel looks these up with next-intl, which throws on a missing key.
// A locale that drifts would break the panel at runtime, not at build time.
const STATUS_KEYS = [
  "good_results",
  "improvements",
  "issues",
  "not_applicable",
];

const BASE_LABEL_KEYS = [
  "content",
  "alt_text",
  "slug",
  "meta_title",
  "meta_description",
  "keywords",
  "open_graph",
  "canonical_url",
  "structured_data",
  "last_updated",
];

const INSIGHT_KEYS = [
  "readability",
  "sentence_length",
  "paragraph_length",
  "passive_voice",
  "transition_words",
  "repeated_sentence_start",
  "em_dash_overuse",
  "heading_structure",
  "subheading_distribution",
  "toc_present",
  "media_count",
  "slug_length",
  "keyword_first_paragraph",
  "keyphrase_in_title",
  "keyphrase_in_description",
  "keyphrase_in_slug",
  "keyphrase_in_subheadings",
  "keyphrase_in_alt",
  "title_has_number",
  "title_power_word",
  "title_sentiment",
];

const I18N_DIR = path.resolve(__dirname);
const locales = readdirSync(I18N_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const seoBlock = (locale: string) =>
  JSON.parse(readFileSync(path.join(I18N_DIR, locale, "editor.json"), "utf8"))
    .editor.seo;

describe("SEO panel messages", () => {
  it("finds every locale directory", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)("%s defines every status bucket", (locale) => {
    const seo = seoBlock(locale);
    for (const key of STATUS_KEYS) {
      expect(seo[key], `${locale}: missing ${key}`).toBeTruthy();
    }
  });

  it.each(locales)("%s defines every base-result label", (locale) => {
    const seo = seoBlock(locale);
    for (const key of BASE_LABEL_KEYS) {
      expect(seo.base_labels?.[key], `${locale}: missing ${key}`).toBeTruthy();
    }
  });

  it.each(locales)("%s defines every insight label", (locale) => {
    const seo = seoBlock(locale);
    for (const key of INSIGHT_KEYS) {
      expect(
        seo.insights?.labels?.[key],
        `${locale}: missing ${key}`,
      ).toBeTruthy();
    }
  });

  it.each(locales)("%s defines both upgrade-teaser lines", (locale) => {
    const seo = seoBlock(locale);
    expect(seo.insights?.teaser).toBeTruthy();
    expect(seo.insights?.teaser_scored).toBeTruthy();
  });
});
