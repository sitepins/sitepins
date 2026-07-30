import { describe, expect, it } from "vitest";
import { decodeGitContent } from "./git-content";

const base64 = (value: string) =>
  Buffer.from(value, "utf-8").toString("base64");

describe("decodeGitContent", () => {
  it("returns already-decoded text as-is", () => {
    expect(decodeGitContent({ data: "# Title" })).toBe("# Title");
  });

  it("prefers decoded text over the base64 payload", () => {
    expect(decodeGitContent({ data: "plain", content: base64("other") })).toBe(
      "plain",
    );
  });

  it("decodes a base64 payload", () => {
    expect(decodeGitContent({ content: base64("hello") })).toBe("hello");
  });

  it("strips the line breaks GitHub inserts into base64", () => {
    const wrapped = base64("hello world").replace(/(.{4})/g, "$1\n");
    expect(decodeGitContent({ content: wrapped })).toBe("hello world");
  });

  it("returns an empty string for missing or unusable input", () => {
    expect(decodeGitContent(undefined)).toBe("");
    expect(decodeGitContent({})).toBe("");
    expect(decodeGitContent({ content: "" })).toBe("");
    expect(decodeGitContent({ content: "not base64 !!!" })).toBe("");
  });
});
