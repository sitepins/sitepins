import { Template } from "@/lib/utils/schema-helpers";
import { describe, expect, it } from "vitest";
import {
  addNestedToTemplate,
  appendFieldToTemplate,
  deleteNestedFromTemplate,
  removeFieldFromTemplate,
  updateFieldInTemplate,
  updateNestedInTemplate,
} from "./schema-template-ops";

const field = (overrides: Partial<Template> = {}): Template => ({
  name: "title",
  label: "Title",
  type: "string",
  value: "",
  ...overrides,
});

describe("updateFieldInTemplate", () => {
  it("merges the update into the matching field only", () => {
    const result = updateFieldInTemplate(
      [field(), field({ name: "body", label: "Body" })],
      field({ label: "Headline" }),
    );

    expect(result[0].label).toBe("Headline");
    expect(result[1].label).toBe("Body");
  });

  it("tolerates an undefined template", () => {
    expect(updateFieldInTemplate(undefined, field())).toEqual([]);
  });

  it("drops nested fields when the type can no longer hold them", () => {
    const result = updateFieldInTemplate(
      [field({ name: "meta", type: "object", fields: [field()] })],
      field({ name: "meta", type: "string" }),
    );

    expect(result[0]).not.toHaveProperty("fields");
  });

  it("keeps nested fields on an object", () => {
    const result = updateFieldInTemplate(
      [field({ name: "meta", type: "object", fields: [field()] })],
      field({ name: "meta", type: "object", label: "Meta" }),
    );

    expect(result[0].fields).toHaveLength(1);
  });

  it("keeps nested fields on an array of objects", () => {
    const result = updateFieldInTemplate(
      [field({ name: "items", type: "Array", subType: "object" })],
      field({ name: "items", type: "Array", subType: "object" }),
    );

    expect(result[0].subType).toBe("object");
  });

  it("drops subType when the field is no longer an array", () => {
    const result = updateFieldInTemplate(
      [field({ name: "items", type: "Array", subType: "object" })],
      field({ name: "items", type: "string" }),
    );

    expect(result[0]).not.toHaveProperty("subType");
  });

  it("stamps today's date when alwaysUseCurrentDate is on", () => {
    const result = updateFieldInTemplate(
      [field({ name: "date", type: "Date" })],
      field({ name: "date", type: "Date", alwaysUseCurrentDate: true }),
    );

    expect(result[0].value).toBe(new Date().toISOString().split("T")[0]);
  });

  it("uses the default date when one is set", () => {
    const result = updateFieldInTemplate(
      [field({ name: "date", type: "Date" })],
      field({ name: "date", type: "Date", defaultValue: "2026-01-01" }),
    );

    expect(result[0].value).toBe("2026-01-01");
  });

  it("clears the date when neither applies", () => {
    const result = updateFieldInTemplate(
      [field({ name: "date", type: "Date", value: "stale" })],
      field({ name: "date", type: "Date" }),
    );

    expect(result[0].value).toBe("");
  });

  it("coerces a boolean default from its string form", () => {
    expect(
      updateFieldInTemplate(
        [field({ name: "draft", type: "boolean" })],
        field({ name: "draft", type: "boolean", defaultValue: "true" }),
      )[0].value,
    ).toBe(true);

    expect(
      updateFieldInTemplate(
        [field({ name: "draft", type: "boolean" })],
        field({ name: "draft", type: "boolean", defaultValue: "false" }),
      )[0].value,
    ).toBe(false);
  });

  it("defaults a boolean without a default to false", () => {
    expect(
      updateFieldInTemplate(
        [field({ name: "draft", type: "boolean" })],
        field({ name: "draft", type: "boolean" }),
      )[0].value,
    ).toBe(false);
  });

  it("resets an array's value to empty", () => {
    expect(
      updateFieldInTemplate(
        [field({ name: "tags", type: "Array", value: ["a"] })],
        field({ name: "tags", type: "Array" }),
      )[0].value,
    ).toEqual([]);
  });

  it("parses a numeric default, falling back to zero", () => {
    expect(
      updateFieldInTemplate(
        [field({ name: "weight", type: "number" })],
        field({ name: "weight", type: "number", defaultValue: "4.5" }),
      )[0].value,
    ).toBe(4.5);

    expect(
      updateFieldInTemplate(
        [field({ name: "weight", type: "number" })],
        field({ name: "weight", type: "number", defaultValue: "abc" }),
      )[0].value,
    ).toBe(0);
  });
});

describe("appendFieldToTemplate", () => {
  it("appends to the end", () => {
    const { template, error } = appendFieldToTemplate(
      [field()],
      field({ name: "body" }),
    );

    expect(error).toBeUndefined();
    expect(template.map((f) => f.name)).toEqual(["title", "body"]);
  });

  it("starts a template from nothing", () => {
    expect(appendFieldToTemplate(undefined, field()).template).toHaveLength(1);
  });

  it("rejects a blank name without touching the template", () => {
    const existing = [field()];
    const { template, error } = appendFieldToTemplate(
      existing,
      field({ name: "   " }),
    );

    expect(error).toBe("name_required");
    expect(template).toBe(existing);
  });

  it("rejects a duplicate name", () => {
    const { error } = appendFieldToTemplate(
      [field()],
      field({ name: "title" }),
    );
    expect(error).toBe("name_exists");
  });

  it("compares names after trimming", () => {
    const { error } = appendFieldToTemplate(
      [field()],
      field({ name: "  title  " }),
    );
    expect(error).toBe("name_exists");
  });
});

describe("removeFieldFromTemplate", () => {
  it("removes the named field", () => {
    expect(
      removeFieldFromTemplate([field(), field({ name: "body" })], "title").map(
        (f) => f.name,
      ),
    ).toEqual(["body"]);
  });

  it("is a no-op for an unknown name", () => {
    expect(removeFieldFromTemplate([field()], "missing")).toHaveLength(1);
  });

  it("tolerates an undefined template", () => {
    expect(removeFieldFromTemplate(undefined, "title")).toEqual([]);
  });
});

describe("nested field operations", () => {
  const parent = field({
    name: "meta",
    type: "object",
    fields: [field({ name: "author" })],
  });

  it("updates a nested field in place", () => {
    const result = updateNestedInTemplate([parent], "meta", {
      ...field({ name: "author" }),
      label: "Written by",
    });

    expect(result[0].fields?.[0].label).toBe("Written by");
  });

  it("adds a nested field", () => {
    const result = addNestedToTemplate(
      [parent],
      "meta",
      field({ name: "tags" }),
    );

    expect(result[0].fields?.map((f) => f.name)).toEqual(["author", "tags"]);
  });

  it("adds to a parent that has no fields yet", () => {
    const result = addNestedToTemplate(
      [field({ name: "meta", type: "object" })],
      "meta",
      field({ name: "author" }),
    );

    expect(result[0].fields).toHaveLength(1);
  });

  it("deletes a nested field", () => {
    const result = deleteNestedFromTemplate([parent], "meta", "author");
    expect(result[0].fields).toEqual([]);
  });

  it("leaves other parents alone", () => {
    const other = field({ name: "seo", type: "object", fields: [] });
    const result = addNestedToTemplate(
      [parent, other],
      "meta",
      field({ name: "tags" }),
    );

    expect(result[1].fields).toEqual([]);
  });

  it("tolerates an unknown parent", () => {
    expect(
      addNestedToTemplate([parent], "missing", field({ name: "x" }))[0].fields,
    ).toHaveLength(1);
  });
});
