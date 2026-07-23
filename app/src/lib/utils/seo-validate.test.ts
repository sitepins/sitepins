import { describe, expect, it } from "vitest";
import { validateSeoInsights } from "./seo-validate";

const words = (count: number, word = "cat") =>
  new Array(count).fill(word).join(" ");

describe("validateSeoInsights", () => {
  describe("readability", () => {
    it("scores simple, short sentences as good", () => {
      const content =
        "The cat sat. The dog ran. It was fun. We all went home.";
      const { results } = validateSeoInsights({}, content);
      expect(results.readability.valid).toBe(true);
    });

    it("scores long, complex sentences as poor", () => {
      const content = `${words(45, "extraordinarily")} ${words(45, "internationalization")}.`;
      const { results } = validateSeoInsights({}, content);
      expect(results.readability.valid).not.toBe(true);
    });
  });

  describe("heading_structure", () => {
    it("is undefined with no headings", () => {
      const { results } = validateSeoInsights({}, "Just a paragraph.");
      expect(results.heading_structure.valid).toBeUndefined();
    });

    it("is true when heading levels increase by one at a time", () => {
      const content = "## Intro\n\ntext\n\n### Details\n\ntext";
      const { results } = validateSeoInsights({}, content);
      expect(results.heading_structure.valid).toBe(true);
    });

    it("is false when a heading level is skipped", () => {
      const content = "## Intro\n\ntext\n\n#### Details\n\ntext";
      const { results } = validateSeoInsights({}, content);
      expect(results.heading_structure.valid).toBe(false);
    });

    it("does not treat # comments inside fenced code as headings", () => {
      const content =
        "Intro paragraph here.\n\n```bash\n# not a heading\n# also not a heading\nnpm run build\n```\n\nOutro paragraph here.";
      const { results } = validateSeoInsights({}, content);
      expect(results.heading_structure.count).toBe(0);
      expect(results.heading_structure.valid).toBeUndefined();
    });
  });

  describe("keyword_first_paragraph", () => {
    it("is undefined with no focus keyword defined", () => {
      const { results } = validateSeoInsights({}, "Some intro paragraph.");
      expect(results.keyword_first_paragraph.valid).toBeUndefined();
    });

    it("is true when the keyword appears in the first paragraph", () => {
      const { results } = validateSeoInsights(
        { keywords: ["apple"] },
        "This post is about apple orchards.\n\nMore text below.",
      );
      expect(results.keyword_first_paragraph.valid).toBe(true);
    });

    it("is false when the keyword is missing from the first paragraph", () => {
      const { results } = validateSeoInsights(
        { keywords: ["banana"] },
        "This post is about apple orchards.\n\nMore text below.",
      );
      expect(results.keyword_first_paragraph.valid).toBe(false);
    });
  });

  describe("paragraph_length", () => {
    it("is true when paragraphs are short", () => {
      const content = "Short paragraph one.\n\nShort paragraph two.";
      const { results } = validateSeoInsights({}, content);
      expect(results.paragraph_length.valid).toBe(true);
    });

    it("is false when most paragraphs exceed 150 words", () => {
      const content = `${words(160)}.`;
      const { results } = validateSeoInsights({}, content);
      expect(results.paragraph_length.valid).toBe(false);
    });
  });

  describe("sentence_length", () => {
    it("is true when sentences are short", () => {
      const content = "Cats are great. Dogs are great too. Both are pets.";
      const { results } = validateSeoInsights({}, content);
      expect(results.sentence_length.valid).toBe(true);
    });

    it("is false when most sentences exceed 20 words", () => {
      const longSentence = `${words(25)}.`;
      const content = [longSentence, longSentence, longSentence].join(" ");
      const { results } = validateSeoInsights({}, content);
      expect(results.sentence_length.valid).toBe(false);
    });
  });

  describe("transition_words", () => {
    it("is true when enough sentences use transition words", () => {
      const content =
        "However, this works. Therefore, it is good. For example, this. And this one too.";
      const { results } = validateSeoInsights({}, content);
      expect(results.transition_words.valid).toBe(true);
    });

    it("is false when no sentences use transition words", () => {
      const content = "Cats are great. Dogs are great too. Both are pets.";
      const { results } = validateSeoInsights({}, content);
      expect(results.transition_words.valid).toBe(false);
    });
  });

  describe("passive_voice", () => {
    it("passes on active-voice sentences", () => {
      const content = "The cat chased the dog. We wrote the post. She runs fast.";
      const { results } = validateSeoInsights({}, content);
      expect(results.passive_voice.valid).toBe(true);
    });

    it("flags heavy passive voice", () => {
      const content =
        "The ball was thrown. The cake was eaten. The song was written. The race was won.";
      const { results } = validateSeoInsights({}, content);
      expect(results.passive_voice.valid).toBe(false);
    });

    it("does not flag short -ed adjectives after a be-verb as passive", () => {
      const content = "The sky is red. The wall is old. The path is wide.";
      const { results } = validateSeoInsights({}, content);
      expect(results.passive_voice.percentage).toBe(0);
      expect(results.passive_voice.valid).toBe(true);
    });
  });

  describe("subheading_distribution", () => {
    it("flags a 300+ word run with no subheading", () => {
      const content = `${words(320)}.`;
      const { results } = validateSeoInsights({}, content);
      expect(results.subheading_distribution.valid).toBe(false);
    });

    it("passes when long content is broken by subheadings", () => {
      const content = `## A\n\n${words(120)}.\n\n## B\n\n${words(120)}.\n\n## C\n\n${words(120)}.`;
      const { results } = validateSeoInsights({}, content);
      expect(results.subheading_distribution.valid).toBe(true);
    });
  });

  describe("repeated_sentence_start", () => {
    it("flags three consecutive sentences with the same first word", () => {
      const content = "You should read. You should write. You should learn.";
      const { results } = validateSeoInsights({}, content);
      expect(results.repeated_sentence_start.valid).toBeUndefined();
    });

    it("passes with varied sentence starts", () => {
      const content = "Cats are great. Dogs are fun. Birds can fly.";
      const { results } = validateSeoInsights({}, content);
      expect(results.repeated_sentence_start.valid).toBe(true);
    });
  });

  describe("em_dash_overuse", () => {
    it("passes when there are no em dashes", () => {
      const content = "Cats are great. Dogs are fun. Birds can fly.";
      const { results } = validateSeoInsights({}, content);
      expect(results.em_dash_overuse.count).toBe(0);
      expect(results.em_dash_overuse.valid).toBe(true);
    });

    it("flags content with an em dash in most sentences", () => {
      const content =
        "Cats — as everyone knows — are great. Dogs are fun — truly fun. Birds can fly — high.";
      const { results } = validateSeoInsights({}, content);
      expect(results.em_dash_overuse.count).toBe(4);
      expect(results.em_dash_overuse.valid).toBe(false);
    });

    it("ignores dashes inside fenced code", () => {
      const content =
        "Cats are great. Dogs are fun. Birds can fly.\n\n```bash\nnpm run build -- --flag\n```";
      const { results } = validateSeoInsights({}, content);
      expect(results.em_dash_overuse.count).toBe(0);
    });
  });

  describe("focus keyword override", () => {
    const content = "## Static site generator basics\n\nIntro text about it.";

    it("grades against the explicit keyword instead of frontmatter tags", () => {
      const entry = { tags: ["nextjs"], title: "A guide to static site generator setup" };
      const { results } = validateSeoInsights(
        entry,
        content,
        undefined,
        "static site generator",
      );
      expect(results.keyphrase_in_title.valid).toBe(true);
      expect(results.keyphrase_in_subheadings.valid).toBe(true);
    });

    it("supports a comma-separated list", () => {
      const { results } = validateSeoInsights(
        { title: "All about hugo" },
        content,
        undefined,
        "astro, hugo",
      );
      expect(results.keyphrase_in_title.valid).toBe(true);
    });

    it("falls back to frontmatter keywords when blank", () => {
      const entry = { tags: ["nextjs"], title: "Why nextjs wins" };
      const { results } = validateSeoInsights(entry, content, undefined, "   ");
      expect(results.keyphrase_in_title.valid).toBe(true);
    });
  });

  describe("keyphrase placement", () => {
    const entry = {
      keywords: ["apple pie"],
      title: "The Best Apple Pie Recipe",
      description: "Learn to bake apple pie at home.",
      slug: "best-apple-pie-recipe",
    };
    const content =
      "## How to make apple pie\n\nIntro text.\n\n![a fresh apple pie](/img.jpg)";

    it("detects keyword in title, description, slug, subheadings, and alt", () => {
      const { results } = validateSeoInsights(entry, content);
      expect(results.keyphrase_in_title.valid).toBe(true);
      expect(results.keyphrase_in_description.valid).toBe(true);
      expect(results.keyphrase_in_slug.valid).toBe(true);
      expect(results.keyphrase_in_subheadings.valid).toBe(true);
      expect(results.keyphrase_in_alt.valid).toBe(true);
    });

    it("matches punctuated keywords against a slugified slug", () => {
      const { results } = validateSeoInsights(
        { keywords: ["Next.js"], slug: "speed-up-nextjs-app" },
        content,
      );
      expect(results.keyphrase_in_slug.valid).toBe(true);
    });

    it("still fails the slug check when the keyword is genuinely absent", () => {
      const { results } = validateSeoInsights(
        { keywords: ["banana bread"], slug: "best-apple-pie-recipe" },
        content,
      );
      expect(results.keyphrase_in_slug.valid).toBe(false);
    });

    it("is undefined for placement checks when no keyword is defined", () => {
      const { results } = validateSeoInsights({ title: "Hello" }, content);
      expect(results.keyphrase_in_title.valid).toBeUndefined();
      expect(results.keyphrase_in_slug.valid).toBeUndefined();
    });

    it("fails when the keyword is absent from the title", () => {
      const { results } = validateSeoInsights(
        { keywords: ["banana bread"], title: "The Best Apple Pie Recipe" },
        content,
      );
      expect(results.keyphrase_in_title.valid).toBe(false);
    });
  });

  describe("title engagement", () => {
    it("detects number, power word, and sentiment in the title", () => {
      const { results } = validateSeoInsights(
        { title: "7 Proven Ways to Build an Amazing Site" },
        "body",
      );
      expect(results.title_has_number.valid).toBe(true);
      expect(results.title_power_word.valid).toBe(true);
      expect(results.title_sentiment.valid).toBe(true);
    });

    it("is undefined (not an error) when the title lacks these", () => {
      const { results } = validateSeoInsights(
        { title: "How to configure the widget" },
        "body",
      );
      expect(results.title_has_number.valid).toBeUndefined();
      expect(results.title_power_word.valid).toBeUndefined();
    });
  });

  describe("media_count", () => {
    it("passes with three or more media items", () => {
      const content = "![a](/1.jpg)\n\n![b](/2.jpg)\n\n![c](/3.jpg)";
      const { results } = validateSeoInsights({}, content);
      expect(results.media_count.valid).toBe(true);
      expect(results.media_count.count).toBe(3);
    });

    it("fails with no media", () => {
      const { results } = validateSeoInsights({}, "Just text, no media.");
      expect(results.media_count.valid).toBe(false);
    });

    it("does not count example image syntax inside fenced code", () => {
      const content = "Text here.\n\n```md\n![example](/x.png)\n![two](/y.png)\n```";
      const { results } = validateSeoInsights({}, content);
      expect(results.media_count.count).toBe(0);
    });
  });

  describe("slug_length", () => {
    it("passes for a short slug", () => {
      const { results } = validateSeoInsights({ slug: "my-post" }, "body");
      expect(results.slug_length.valid).toBe(true);
    });

    it("fails for a slug over 75 characters", () => {
      const { results } = validateSeoInsights({ slug: "a".repeat(80) }, "body");
      expect(results.slug_length.valid).toBe(false);
    });
  });

  describe("toc_present", () => {
    it("is undefined for short posts with few headings", () => {
      const { results } = validateSeoInsights({}, "## One\n\ntext");
      expect(results.toc_present.valid).toBeUndefined();
    });

    it("detects a table of contents in a multi-section post", () => {
      const content =
        "## Table of Contents\n\n- [A](#a)\n\n## A\n\ntext\n\n## B\n\ntext\n\n## C\n\ntext";
      const { results } = validateSeoInsights({}, content);
      expect(results.toc_present.valid).toBe(true);
    });
  });

  it("returns a good/bad/improvement summary consistent with the results", () => {
    const content = "The cat sat. The dog ran.\n\nMore short text here.";
    const { results, summary } = validateSeoInsights({}, content);
    const values = Object.values(results) as { valid: boolean | undefined }[];
    expect(summary.good).toBe(values.filter((r) => r.valid === true).length);
    expect(summary.bad).toBe(values.filter((r) => r.valid === false).length);
    expect(summary.improvement).toBe(
      values.filter((r) => r.valid === undefined).length,
    );
  });

  it("handles empty content without throwing and returns all keys", () => {
    const { results, summary } = validateSeoInsights({}, "");
    expect(Object.keys(results).length).toBe(21);
    expect(summary.good + summary.bad + summary.improvement).toBe(21);
    // No content and no keyword -> nothing should be a confident pass except
    // checks whose "empty" state is acceptable; just assert no crash + shape.
    expect(results.readability.valid).toBeUndefined();
  });

  it("unwraps frontmatter values shaped as { value } objects", () => {
    const entry = {
      title: { value: "7 Proven Apple Pie Tips" },
      keywords: { value: ["apple pie"] },
      slug: { value: "apple-pie-tips" },
    };
    const { results } = validateSeoInsights(entry, "## Apple pie basics\n\ntext");
    expect(results.keyphrase_in_title.valid).toBe(true);
    expect(results.keyphrase_in_slug.valid).toBe(true);
    expect(results.keyphrase_in_subheadings.valid).toBe(true);
    expect(results.title_has_number.valid).toBe(true);
  });

  it("handles a keyword array of wrapped { value } items without throwing", () => {
    const entry = {
      title: "All about apple pie",
      tags: [{ value: "apple pie" }, { value: "dessert" }],
    };
    const { results } = validateSeoInsights(entry, "Some apple pie content.");
    expect(results.keyphrase_in_title.valid).toBe(true);
  });
});
