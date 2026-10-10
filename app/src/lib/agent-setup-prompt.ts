/**
 * Instructions an AI agent follows to add Sitepins to its own MCP settings.
 * Every client gets the same server: Streamable HTTP plus a bearer token.
 */
export function buildAgentSetupPrompt({
  url,
  token,
}: {
  url: string;
  token: string;
}): string {
  const header = `Bearer ${token}`;
  const json = (body: Record<string, unknown>) =>
    JSON.stringify({ sitepins: body }, null, 2);

  return `Connect yourself to Sitepins (a Git-based CMS) by adding it as an MCP server.

Server URL: ${url}
Transport: Streamable HTTP
Required header: Authorization: ${header}

Add a server named "sitepins" using the method for the app you are running in. Keep any servers already configured, edit JSON or TOML carefully, and never print the token back to me.

- Claude Code: run
  claude mcp add --transport http sitepins ${url} --header "Authorization: ${header}"

- Codex (CLI, desktop app or IDE extension): add to ~/.codex/config.toml
  [mcp_servers.sitepins]
  url = "${url}"
  http_headers = { "Authorization" = "${header}" }

- Claude Desktop: add under "mcpServers" in claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\)
${json({ command: "npx", args: ["-y", "mcp-remote@latest", url, "--header", "Authorization:${SITEPINS_AUTH}"], env: { SITEPINS_AUTH: header } })}

- Cursor: add under "mcpServers" in ~/.cursor/mcp.json
${json({ url, headers: { Authorization: header } })}

- VS Code (GitHub Copilot): add under "servers" in your user mcp.json (command "MCP: Open User Configuration")
${json({ type: "http", url, headers: { Authorization: header } })}

- Antigravity or Windsurf: add under "mcpServers" in mcp_config.json (Antigravity: MCP servers panel → Manage → View raw config; Windsurf: ~/.codeium/windsurf/mcp_config.json)
${json({ serverUrl: url, headers: { Authorization: header } })}

- Gemini CLI: add under "mcpServers" in ~/.gemini/settings.json
${json({ httpUrl: url, headers: { Authorization: header } })}

- Any other MCP client: add a remote (Streamable HTTP) server with the URL and header above.

If you can't change your own settings (for example, you have no file access), tell me exactly which file to open and what to paste.

When it's added, tell me if the app needs a restart. Then call the sitepins list_projects tool to confirm the connection, and get_project_context before editing a site.`;
}
