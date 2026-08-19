import { describe, expect, it } from "vitest";
import { getDirection } from "./direction";

describe("locale direction", () => {
  it.each(["ar", "fa", "he", "ur"])("uses RTL for %s", (locale) => {
    expect(getDirection(locale)).toBe("rtl");
  });

  it.each(["en", "bn", "fr", "unknown"])("keeps %s LTR", (locale) => {
    expect(getDirection(locale)).toBe("ltr");
  });
});
