import { describe, expect, it } from "vitest";
import { selectProviderConfig, withDelegatedToken } from "./provider-config";
import { TProvider } from "./type";

const row = (overrides: Partial<TProvider>): TProvider => ({
  user_id: "owner",
  provider: "Github",
  accessToken: "",
  installationAccessToken: "",
  tokenType: "oauth",
  refreshToken: "",
  ...overrides,
});

const ownerGithub = row({
  accessToken: "gho_owner",
  refreshToken: "ghr_owner",
  accessTokenExpiresAt: 111,
  refreshTokenExpiresAt: 222,
});

describe("selectProviderConfig", () => {
  it("keeps the owner's own tokens and refresh token", () => {
    const selection = selectProviderConfig({
      providers: [ownerGithub],
      loginUserId: "owner",
      targetUserId: "owner",
      targetProvider: "Github",
    });

    expect(selection?.delegated).toBe(false);
    expect(selection?.config).toMatchObject({
      provider: "Github",
      token: "gho_owner",
      currentLoginUserToken: "gho_owner",
      refreshToken: "ghr_owner",
      accessTokenExpiresAt: 111,
      delegatedProjectId: "",
    });
  });

  it("gives a collaborator no owner credential, even if one slipped through", () => {
    const selection = selectProviderConfig({
      providers: [ownerGithub],
      loginUserId: "collaborator",
      targetUserId: "owner",
      targetProvider: "Github",
    });

    expect(selection?.delegated).toBe(true);
    expect(selection?.config).toMatchObject({
      provider: "Github",
      token: "",
      currentLoginUserToken: "",
      refreshToken: "",
    });
    expect(JSON.stringify(selection)).not.toMatch(/gho_owner|ghr_owner/);
  });

  it("delegates GitLab collaborators too", () => {
    const selection = selectProviderConfig({
      providers: [
        row({ provider: "Gitlab", accessToken: "glpat_owner" }),
        ownerGithub,
      ],
      loginUserId: "collaborator",
      targetUserId: "owner",
      targetProvider: "Gitlab",
    });

    expect(selection?.delegated).toBe(true);
    expect(selection?.config.provider).toBe("Gitlab");
    expect(selection?.config.token).toBe("");
  });

  it("returns null when the target has no provider", () => {
    expect(
      selectProviderConfig({
        providers: [],
        loginUserId: "a",
        targetUserId: "b",
      }),
    ).toBeNull();
  });
});

describe("withDelegatedToken", () => {
  const base = selectProviderConfig({
    providers: [ownerGithub],
    loginUserId: "collaborator",
    targetUserId: "owner",
  })!.config;

  it("installs the project token and marks it delegated", () => {
    const config = withDelegatedToken(base, "project-1", {
      provider: "Github",
      token: "ghs_scoped",
      expires_at: 999,
    });

    expect(config).toMatchObject({
      token: "ghs_scoped",
      accessTokenExpiresAt: 999,
      refreshToken: "",
      delegatedProjectId: "project-1",
    });
  });

  it("leaves the token empty when minting failed", () => {
    expect(withDelegatedToken(base, "project-1", null)).toEqual(base);
  });
});
