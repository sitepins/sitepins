import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("keeps in-app paths", () => {
    expect(
      safeInternalPath(
        "/org-MCVmm1EZ/YwiUgScl-Z/content/src/content/blog/a.md",
      ),
    ).toBe("/org-MCVmm1EZ/YwiUgScl-Z/content/src/content/blog/a.md");
    expect(safeInternalPath("/dashboard?tab=git")).toBe("/dashboard?tab=git");
  });

  it("falls back when absent", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it("rejects off-site targets", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });
});
