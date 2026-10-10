import { describe, expect, it } from "vitest";
import { buildAgentSetupPrompt } from "./agent-setup-prompt";

const URL = "https://api.example.com/mcp";
const TOKEN = "spat_abc123";
const prompt = buildAgentSetupPrompt({ url: URL, token: TOKEN });

const jsonBlocks = () =>
  [...prompt.matchAll(/^\{\n[\s\S]*?\n\}$/gm)].map((m) => JSON.parse(m[0]));

describe("buildAgentSetupPrompt", () => {
  it("gives every client the same URL and bearer header", () => {
    const blocks = jsonBlocks();
    expect(blocks).toHaveLength(5);
    for (const { sitepins } of blocks) {
      const serialized = JSON.stringify(sitepins);
      expect(serialized).toContain(URL);
      expect(serialized).toContain(`Bearer ${TOKEN}`);
    }
  });

  it("covers the common agents", () => {
    for (const client of [
      "Claude Code",
      "Codex",
      "Claude Desktop",
      "Cursor",
      "VS Code",
      "Antigravity",
      "Gemini CLI",
    ]) {
      expect(prompt).toContain(client);
    }
    expect(prompt).toContain(
      `claude mcp add --transport http sitepins ${URL} --header "Authorization: Bearer ${TOKEN}"`,
    );
    expect(prompt).toContain(
      `http_headers = { "Authorization" = "Bearer ${TOKEN}" }`,
    );
  });

  it("keeps the mcp-remote header placeholder for the agent's config", () => {
    expect(prompt).toContain('"Authorization:${SITEPINS_AUTH}"');
  });
});
