import { afterEach, describe, expect, it, vi } from "vitest";
import { isTokenExpiring, refreshDelegatedToken } from "./delegated-token";

const state = (overrides: Record<string, unknown>) => ({
  config: {
    token: "ghs_old",
    delegatedProjectId: "project-1",
    accessTokenExpiresAt: Date.now() - 1000,
    ...overrides,
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("isTokenExpiring", () => {
  it("treats a missing expiry as non-expiring", () => {
    expect(isTokenExpiring(0)).toBe(false);
  });

  it("refreshes inside the five-minute margin", () => {
    expect(isTokenExpiring(Date.now() + 60_000)).toBe(true);
    expect(isTokenExpiring(Date.now() + 3_600_000)).toBe(false);
  });
});

describe("refreshDelegatedToken", () => {
  it("skips owners", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token = await refreshDelegatedToken(
      () => state({ delegatedProjectId: "" }),
      vi.fn(),
    );
    expect(token).toBe("ghs_old");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the project-token route, never a refresh route", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        provider: "Github",
        token: "ghs_new",
        expires_at: 42,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const dispatch = vi.fn();

    const token = await refreshDelegatedToken(() => state({}), dispatch);

    expect(token).toBe("ghs_new");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/project-token",
      expect.objectContaining({
        body: JSON.stringify({ projectId: "project-1" }),
      }),
    );
    expect(dispatch.mock.calls[0]?.[0].payload).toMatchObject({
      token: "ghs_new",
      accessTokenExpiresAt: 42,
    });
  });
});
