import { describe, expect, it } from "vitest";
import { escapeRegex } from "./regexEscape";

describe("escapeRegex", () => {
  it("escapes all regex metacharacters", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeRegex("my project name")).toBe("my project name");
  });

  it("makes a metacharacter-laden search string matchable only literally", () => {
    const input = "a+b";
    const escaped = escapeRegex(input);
    const re = new RegExp(escaped);
    expect(re.test("a+b")).toBe(true);
    expect(re.test("aab")).toBe(false);
  });

  it("caps length at 200 chars to bound worst-case matching cost", () => {
    const input = "a".repeat(500);
    expect(escapeRegex(input)).toHaveLength(200);
  });

  it("treats null/undefined as an empty string", () => {
    expect(escapeRegex(null)).toBe("");
    expect(escapeRegex(undefined)).toBe("");
  });

  it("coerces non-string input", () => {
    expect(escapeRegex(123)).toBe("123");
  });
});
