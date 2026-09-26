import { describe, expect, it } from "vitest";
import { extractDocText, findRelevantDocs } from "./docs-index";

describe("findRelevantDocs", () => {
  it("matches invite questions to Team & Roles", () => {
    const [top] = findRelevantDocs("How do I invite a new team member?");
    expect(top?.path).toBe("/collaboration/team-and-roles");
  });

  it("matches rollback questions to Version History", () => {
    const paths = findRelevantDocs("how can I undo my last change").map(
      (d) => d.path,
    );
    expect(paths).toContain("/editing/version-history");
  });

  it("returns nothing for unrelated or empty questions", () => {
    expect(findRelevantDocs("")).toEqual([]);
    expect(findRelevantDocs("zzz qqq")).toEqual([]);
  });
});

describe("extractDocText", () => {
  it("keeps the main body text and drops markup and scripts", () => {
    const html = `<html><nav>Sidebar</nav><main data-pagefind-body="true">
      <h1>Team &amp; Roles</h1><p>Invite teammates.</p>
      <script>alert(1)</script></main></html>`;
    const text = extractDocText(html);
    expect(text).toContain("Team & Roles");
    expect(text).toContain("Invite teammates.");
    expect(text).not.toContain("Sidebar");
    expect(text).not.toContain("alert");
  });
});
