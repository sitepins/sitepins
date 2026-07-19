/**
 * Vercel Sandbox SDK auth helpers.
 *
 * Why this file exists:
 * - The SDK requires `teamId` to be a string and appends it to *every* API
 *   request as `?teamId=<value>`.
 * - For "Personal Account" connections we stored `team_id: ""`. The SDK then
 *   sends `?teamId=` (literally empty), and Vercel's API responds with 403
 *   "Not authorized".
 * - The correct shape for personal accounts is to OMIT the `teamId` query
 *   parameter entirely (matching how `create-project/route.ts` builds its URL).
 * - The SDK has no opt-out for this, so we wrap the SDK's `fetch` and strip
 *   the empty `teamId` before the request goes on the wire.
 */

export type SandboxAuth = {
  token: string;
  teamId: string;
  projectId: string;
};

/**
 * Build the credential triplet the SDK requires. `teamId` is intentionally
 * left as the empty string when missing — the SDK rejects `undefined`, so we
 * keep it as `""` and let `cleanVercelFetch` strip it from the URL.
 */
export function getSandboxAuth(body: {
  vercelToken?: unknown;
  vercelTeamId?: unknown;
  vercelProjectId?: unknown;
}): SandboxAuth {
  return {
    token: typeof body.vercelToken === "string" ? body.vercelToken : "",
    teamId: typeof body.vercelTeamId === "string" ? body.vercelTeamId : "",
    projectId:
      typeof body.vercelProjectId === "string" ? body.vercelProjectId : "",
  };
}

/**
 * Drop-in replacement for `globalThis.fetch` that strips `?teamId=` (empty
 * value) from outgoing URLs. Pass via `Sandbox.create({ fetch: cleanVercelFetch, ... })`.
 */
export const cleanVercelFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  try {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (urlStr && urlStr.includes("teamId=")) {
      const url = new URL(urlStr);
      if (url.searchParams.get("teamId") === "") {
        url.searchParams.delete("teamId");
        const cleaned = url.toString();
        // Preserve original input type semantics where possible
        if (input instanceof Request) {
          return fetch(new Request(cleaned, input), init);
        }
        return fetch(cleaned, init);
      }
    }
  } catch {
    // fall through to plain fetch on any URL parse failure
  }
  return fetch(input, init);
};
