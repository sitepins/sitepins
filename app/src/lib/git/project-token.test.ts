import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerRequest = vi.fn();
const appRequest = vi.fn();

vi.mock("octokit", () => ({
  Octokit: class {
    request = ownerRequest;
  },
  App: class {
    octokit = { request: appRequest };
  },
}));

vi.mock("./oauth-refresh", () => ({
  refreshGitHubUserToken: vi.fn(),
  refreshGitLabToken: vi.fn(),
}));

const grant = (overrides: Record<string, unknown> = {}) => ({
  provider: "Github",
  repository: "acme/site",
  owner_user_id: "creator",
  access_token: "gho_owner",
  access_token_expires_at: Date.now() + 3_600_000,
  refresh_token: "ghr_owner",
  ...overrides,
});

const fetchMock = vi.fn();

beforeEach(() => {
  ownerRequest.mockReset();
  appRequest.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.INTERNAL_API_SECRET = "secret";
});

const serveGrant = (value: Record<string, unknown>) =>
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: value }),
  });

describe("issueProjectToken", () => {
  it("asks the API for the grant with the internal secret", async () => {
    serveGrant(grant({ provider: "Gitlab", repository: "group/sub/site" }));
    const { issueProjectToken } = await import("./project-token");

    await issueProjectToken("p1", "member", "http://localhost:3000");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/provider/project-grant/p1?user_id=member");
    expect(init.headers["x-internal-secret"]).toBe("secret");
  });

  it("returns only the GitLab access token, never the refresh token", async () => {
    serveGrant(grant({ provider: "Gitlab", access_token: "glpat_owner" }));
    const { issueProjectToken } = await import("./project-token");

    const token = await issueProjectToken("p1", "member", "");

    expect(token).toEqual({
      provider: "Gitlab",
      token: "glpat_owner",
      expires_at: expect.any(Number),
    });
    expect(JSON.stringify(token)).not.toContain("ghr_owner");
  });

  it("refuses to mint when the owner cannot push to the repository", async () => {
    serveGrant(grant());
    ownerRequest.mockResolvedValue({
      data: { id: 7, permissions: { push: false } },
    });
    const { issueProjectToken } = await import("./project-token");

    await expect(issueProjectToken("p1", "member", "")).rejects.toMatchObject({
      status: 403,
    });
    expect(appRequest).not.toHaveBeenCalled();
  });

  it("refuses when the owner's token cannot see the repository", async () => {
    serveGrant(grant());
    ownerRequest.mockRejectedValue(
      Object.assign(new Error("nf"), { status: 404 }),
    );
    const { issueProjectToken } = await import("./project-token");

    await expect(issueProjectToken("p1", "member", "")).rejects.toMatchObject({
      status: 403,
    });
    expect(appRequest).not.toHaveBeenCalled();
  });

  it("mints an installation token scoped to the single repository", async () => {
    serveGrant(grant());
    ownerRequest.mockResolvedValue({
      data: { id: 7, permissions: { push: true } },
    });
    appRequest.mockImplementation(async (route: string) =>
      route.startsWith("GET")
        ? {
            data: {
              id: 99,
              permissions: {
                contents: "write",
                metadata: "read",
                administration: "write",
              },
            },
          }
        : { data: { token: "ghs_scoped", expires_at: "2030-01-01T00:00:00Z" } },
    );
    const { issueProjectToken } = await import("./project-token");

    const token = await issueProjectToken("p1", "member", "");

    expect(ownerRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}", {
      owner: "acme",
      repo: "site",
    });
    expect(appRequest).toHaveBeenCalledWith(
      "POST /app/installations/{installation_id}/access_tokens",
      {
        installation_id: 99,
        repository_ids: [7],
        permissions: { contents: "write", metadata: "read" },
      },
    );
    expect(token).toEqual({
      provider: "Github",
      token: "ghs_scoped",
      expires_at: Date.parse("2030-01-01T00:00:00Z"),
    });
    expect(JSON.stringify(token)).not.toMatch(/gho_owner|ghr_owner/);
  });
});
