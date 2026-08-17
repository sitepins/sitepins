import { TField } from "@/types";
import { describe, expect, it } from "vitest";
import { stampCurrentDateFields } from "./use-commit-logic";

// The `alwaysUseCurrentDate` stamping, extracted from the hook so it can be
// exercised without a renderer. `getProcessedStateData` is exactly this call.

const dateField = (overrides: Partial<TField> = {}): TField =>
  ({
    name: "date",
    type: "Date",
    alwaysUseCurrentDate: true,
    ...overrides,
  }) as TField;

describe("stampCurrentDateFields", () => {
  it("stamps a raw date value as a raw ISO string", () => {
    const result = stampCurrentDateFields({ date: "2026-08-17" }, [
      dateField(),
    ]);

    expect(typeof result.date).toBe("string");
  });

  it("stamps a wrapped date value while preserving its id", () => {
    const result = stampCurrentDateFields(
      { date: { value: "2026-08-17", id: "abc-123" } },
      [dateField()],
    );

    expect(result.date).toMatchObject({ id: "abc-123" });
    expect(typeof (result.date as { value: unknown }).value).toBe("string");
  });

  it("never produces a bare { value } object with no id", () => {
    const result = stampCurrentDateFields(
      { date: { value: "2026-08-17", id: "abc-123" } },
      [dateField()],
    );

    const keys = Object.keys(result.date as object);
    expect(keys).toContain("id");
  });

  it("leaves fields without alwaysUseCurrentDate untouched", () => {
    const result = stampCurrentDateFields({ date: "2026-08-17" }, [
      dateField({ alwaysUseCurrentDate: false }),
    ]);

    expect(result.date).toBe("2026-08-17");
  });

  it("leaves non-date fields untouched", () => {
    const result = stampCurrentDateFields(
      { title: "Hello", date: "2026-08-17" },
      [dateField(), { name: "title", type: "String" } as TField],
    );

    expect(result.title).toBe("Hello");
  });

  it("skips a date field with no current value", () => {
    const result = stampCurrentDateFields({}, [dateField()]);

    expect(result.date).toBeUndefined();
  });

  it("does not mutate the input data", () => {
    const input = { date: "2026-08-17" };
    stampCurrentDateFields(input, [dateField()]);

    expect(input.date).toBe("2026-08-17");
  });

  it("leaves object, array, gallery, and boolean fields untouched", () => {
    const data = {
      title: "Hello",
      draft: { value: true, id: "draft-1" },
      date: { value: "2026-08-17", id: "date-1" },
      seo: { value: { metaTitle: "SEO title", tags: ["a", "b"] }, id: "seo-1" },
      authors: {
        value: [
          { value: { name: "Alice" }, id: "author-1" },
          { value: { name: "Bob" }, id: "author-2" },
        ],
        id: "authors-1",
      },
      gallery: { value: ["/a.png", "/b.png"], id: "gallery-1" },
    };

    const schema = [
      { name: "title", type: "String" },
      { name: "draft", type: "boolean" },
      dateField(),
      {
        name: "seo",
        type: "object",
        fields: [
          { name: "metaTitle", type: "String" },
          { name: "tags", type: "Array" },
        ],
      },
      {
        name: "authors",
        type: "Array",
        fields: [{ name: "name", type: "String" }],
      },
      { name: "gallery", type: "gallery" },
    ] as TField[];

    const result = stampCurrentDateFields(data, schema);

    expect(result.title).toBe(data.title);
    expect(result.draft).toEqual(data.draft);
    expect(result.seo).toEqual(data.seo);
    expect(result.authors).toEqual(data.authors);
    expect(result.gallery).toEqual(data.gallery);

    // Only the flagged date field changes, and it keeps its id.
    expect(result.date).toMatchObject({ id: "date-1" });
    expect((result.date as { value: string }).value).not.toBe(data.date.value);
  });

  it("stamps a wrapper that has no id the same shape it started with", () => {
    // Not form-produced (the form layer always adds an id), but the function
    // shouldn't invent or drop keys beyond updating `value`.
    const result = stampCurrentDateFields({ date: { value: "2026-08-17" } }, [
      dateField(),
    ]);

    expect(Object.keys(result.date as object)).toEqual(["value"]);
    expect(typeof (result.date as { value: unknown }).value).toBe("string");
  });

  it("handles multiple date fields independently", () => {
    const data = {
      publishedAt: "2026-08-17",
      updatedAt: { value: "2026-08-01", id: "updated-1" },
    };

    const schema = [
      dateField({ name: "publishedAt" }),
      dateField({ name: "updatedAt" }),
    ];

    const result = stampCurrentDateFields(data, schema);

    expect(typeof result.publishedAt).toBe("string");
    expect(result.updatedAt).toMatchObject({ id: "updated-1" });
  });

  it("is a no-op when schema is empty", () => {
    const data = { title: "Hello", date: "2026-08-17" };
    const result = stampCurrentDateFields(data, []);

    expect(result).toEqual(data);
  });
});
