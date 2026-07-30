import { TState } from "@/types";
import { describe, expect, it } from "vitest";
import { isChangedFrom } from "./use-is-changed";

// The dirty-state comparison, extracted from the hook so it can be exercised
// without a renderer. The hook is a `useMemo` over exactly this.

const baseline = (data: Record<string, unknown>): TState => ({
  data,
  page_content: "",
});

describe("isChangedFrom", () => {
  it("is false when the data matches the baseline", () => {
    expect(isChangedFrom({ title: "a" }, baseline({ title: "a" }))).toBe(false);
  });

  it("is true when a value differs", () => {
    expect(isChangedFrom({ title: "b" }, baseline({ title: "a" }))).toBe(true);
  });

  it("is true when a key is added", () => {
    expect(
      isChangedFrom({ title: "a", draft: true }, baseline({ title: "a" })),
    ).toBe(true);
  });

  it("ignores ephemeral fields that differ between parses", () => {
    expect(
      isChangedFrom({ title: "a", id: "2" }, baseline({ title: "a", id: "1" })),
    ).toBe(false);
  });

  it("compares nested values structurally, not by reference", () => {
    expect(
      isChangedFrom({ seo: { tags: ["a"] } }, baseline({ seo: { tags: ["a"] } })),
    ).toBe(false);
    expect(
      isChangedFrom({ seo: { tags: ["b"] } }, baseline({ seo: { tags: ["a"] } })),
    ).toBe(true);
  });

  it("reports changed when there is no baseline yet", () => {
    expect(isChangedFrom({ title: "a" }, undefined)).toBe(true);
  });

  it("is false when both sides are empty", () => {
    expect(isChangedFrom(undefined, baseline({}))).toBe(false);
  });

  it("clears once the baseline is advanced to the edited data", () => {
    const edited = { title: "edited" };
    expect(isChangedFrom(edited, baseline({ title: "original" }))).toBe(true);
    // What a save does: move the baseline to the current data.
    expect(isChangedFrom(edited, baseline(edited))).toBe(false);
  });
});
