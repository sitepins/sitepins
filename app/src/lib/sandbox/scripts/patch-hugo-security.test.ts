import { describe, expect, it } from "vitest";
import {
  buildPatchHugoSecuritySource,
  patchHugoSecurityContent,
} from "./patch-hugo-security";

describe("patchHugoSecurityContent", () => {
  it("patches hugoplate security.toml by adding tailwindcss to exec and disable to node", () => {
    const input = `[node]
  [node.permissions]
    allowAddons = ["tailwindcss"]
    allowChildProcess = ["tailwindcss"]
    allowRead = [".", "..", "/"]
    allowWorker = ["tailwindcss"]
`;
    const { content, changed } = patchHugoSecurityContent(
      input,
      "exampleSite/config/_default/security.toml",
    );
    expect(changed).toBe(true);
    expect(content).toContain("[exec]");
    expect(content).toContain("^tailwindcss$");
    expect(content).toContain("disable = true");
  });

  it("is idempotent when patching security.toml", () => {
    const input = `[node]
  disable = true
  [node.permissions]
    allowAddons = ["tailwindcss"]
    allowChildProcess = ["tailwindcss"]
    allowRead = [".", "..", "/"]
    allowWorker = ["tailwindcss"]

[exec]
  allow = ['^(dart-)?sass$', '^go$', '^git$', '^node$', '^postcss$', '^tailwindcss$']
`;
    const { changed } = patchHugoSecurityContent(input, "security.toml");
    expect(changed).toBe(false);
  });

  it("adds security section to clean hugo.toml", () => {
    const input = `baseURL = 'https://example.com'
title = 'My Blog'
theme = 'ananke'
`;
    const { content, changed } = patchHugoSecurityContent(input, "hugo.toml");
    expect(changed).toBe(true);
    expect(content).toContain("[security]");
    expect(content).toContain("[security.exec]");
    expect(content).toContain("^tailwindcss$");
    expect(content).toContain("[security.node]");
    expect(content).toContain("disable = true");
  });

  it("adds tailwindcss and disable=true to existing security section in hugo.toml", () => {
    const input = `[security]
  [security.exec]
    allow = ['^dart-sass$', '^go$']
`;
    const { content, changed } = patchHugoSecurityContent(input, "hugo.toml");
    expect(changed).toBe(true);
    expect(content).toContain("^tailwindcss$");
    expect(content).toContain("[security.node]");
    expect(content).toContain("disable = true");
  });

  it("is idempotent when patching hugo.toml", () => {
    const input = `[security]
  [security.exec]
    allow = ['^dart-sass$', '^go$', '^tailwindcss$']
  [security.node]
    disable = true
`;
    const { changed } = patchHugoSecurityContent(input, "hugo.toml");
    expect(changed).toBe(false);
  });
});

describe("buildPatchHugoSecuritySource", () => {
  it("produces valid JavaScript that runs in node", () => {
    const src = buildPatchHugoSecuritySource();
    expect(src).toContain("PATCHED_HUGO_SECURITY:");
    expect(() => new Function(src)).not.toThrow();
  });
});
