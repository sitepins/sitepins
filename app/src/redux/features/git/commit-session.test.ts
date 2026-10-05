import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attributionTrailer,
  createCommitTokenSession,
  isPermissionError,
  prepareCommit,
  resolveAttributionTrailer,
  resolveCommitAuthor,
} from "./commit-session";

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getSession: getSessionMock },
}));

describe("prepareCommit", () => {
  it("returns null when every file is filtered out", () => {
    expect(
      prepareCommit([{ path: ".github/workflows/ci.yml" }], "Update"),
    ).toBeNull();
  });

  it("returns null for an empty file list", () => {
    expect(prepareCommit([], "Update")).toBeNull();
  });

  it("collapses duplicate paths before counting", () => {
    const prepared = prepareCommit(
      [{ path: "a.md", delete: true }, { path: "a.md" }],
      "Update",
    );

    expect(prepared?.files).toEqual([{ path: "a.md" }]);
  });

  it("rewrites the message for an all-delete commit", () => {
    expect(prepareCommit([{ path: "a.md", delete: true }], "")?.message).toBe(
      "deleted:a.md",
    );
  });

  it("leaves a mixed commit's message alone", () => {
    expect(
      prepareCommit(
        [{ path: "a.md", delete: true }, { path: "b.md" }],
        "Update",
      )?.message,
    ).toBe("Update");
  });
});

describe("isPermissionError", () => {
  it.each([401, 403])("recognises %i", (status) => {
    expect(isPermissionError({ status })).toBe(true);
    expect(isPermissionError({ response: { status } })).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isPermissionError({ status: 404 })).toBe(false);
    expect(isPermissionError({ status: 500 })).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
    expect(isPermissionError(new Error("boom"))).toBe(false);
  });
});

describe("createCommitTokenSession", () => {
  it("uses the user token while it works", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    const call = vi.fn(async () => ({ data: "ok" }));

    await session.run(call);

    expect(call).toHaveBeenCalledExactlyOnceWith("user-token");
    expect(session.usingUserToken()).toBe(true);
  });

  it("starts on the app token when the user has none", async () => {
    const session = createCommitTokenSession(undefined, "app-token");
    const call = vi.fn(async () => ({ data: "ok" }));

    await session.run(call);

    expect(call).toHaveBeenCalledExactlyOnceWith("app-token");
    expect(session.usingUserToken()).toBe(false);
  });

  it("retries without a token on a permission error", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    const call = vi
      .fn()
      .mockResolvedValueOnce({ error: { status: 403 } })
      .mockResolvedValueOnce({ data: "ok" });

    const result = await session.run(call);

    expect(result).toEqual({ data: "ok" });
    expect(call.mock.calls).toEqual([["user-token"], [undefined]]);
    expect(session.usingUserToken()).toBe(false);
  });

  // A commit that half-succeeds as the user and half as the app would produce
  // mixed authorship, so the downgrade has to be sticky.
  it("stays on the app identity for every later call", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    await session.run(async () => ({ error: { status: 401 } }));

    const later = vi.fn(async () => ({ data: "ok" }));
    await session.run(later);

    expect(later).toHaveBeenCalledExactlyOnceWith("app-token");
  });

  it("does not retry a non-permission failure", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    const call = vi.fn(async () => ({ error: { status: 500 } }));

    const result = await session.run(call);

    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: { status: 500 } });
    expect(session.usingUserToken()).toBe(true);
  });

  it("does not retry once already on the app identity", async () => {
    const session = createCommitTokenSession(undefined, "app-token");
    const call = vi.fn(async () => ({ error: { status: 403 } }));

    await session.run(call);

    expect(call).toHaveBeenCalledTimes(1);
  });

  it("reports the token for the current identity", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    expect(session.token()).toBe("user-token");

    await session.run(async () => ({ error: { status: 403 } }));

    expect(session.token()).toBe("app-token");
  });
});

describe("attributionTrailer", () => {
  const account = { name: "ada", email: "1+ada@users.noreply.github.com" };

  it("co-authors the linked provider account", () => {
    expect(attributionTrailer({ name: "Ada Lovelace", account })).toBe(
      "Co-authored-by: ada <1+ada@users.noreply.github.com>",
    );
  });

  // sitepins/sitepins#38: editors without a Git account were invisible.
  it("credits a user without a Git account by name only", () => {
    expect(attributionTrailer({ name: "Ada Lovelace" })).toBe(
      "Sitepins-User: Ada Lovelace",
    );
  });

  it("falls back to the CMS name when the account has no email", () => {
    expect(
      attributionTrailer({ name: "Ada Lovelace", account: { name: "ada" } }),
    ).toBe("Sitepins-User: Ada Lovelace");
  });

  it("falls back to the account name when the CMS user has none", () => {
    expect(attributionTrailer({ account: { name: "ada" } })).toBe(
      "Sitepins-User: ada",
    );
  });

  it("returns nothing when there is no one to credit", () => {
    expect(attributionTrailer({})).toBeUndefined();
  });

  it("strips characters that would forge another trailer", () => {
    expect(
      attributionTrailer({ name: "Ada\nCo-authored-by: Eve <eve@x>" }),
    ).toBe("Sitepins-User: Ada Co-authored-by: Eve eve@x");
  });
});

describe("resolveCommitAuthor", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({
      data: {
        user: {
          user_id: "u1",
          full_name: "Ada Lovelace",
          email: "ada@cms.example",
        },
      },
    });
  });

  const mapUser = (data: { login: string; email: string }) => ({
    name: data.login,
    email: data.email,
  });

  it("uses only the CMS name without a user token", async () => {
    const fetchUser = vi.fn();
    const author = await resolveCommitAuthor({
      session: createCommitTokenSession(undefined, "app-token"),
      fetchUser,
      mapUser,
    });

    expect(author).toEqual({ name: "Ada Lovelace" });
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it("adds the provider account behind the user token", async () => {
    const author = await resolveCommitAuthor({
      session: createCommitTokenSession("user-token", "app-token"),
      fetchUser: async () => ({
        data: { login: "ada", email: "ada@users.noreply.github.com" },
      }),
      mapUser,
    });

    expect(author.account).toEqual({
      name: "ada",
      email: "ada@users.noreply.github.com",
    });
  });

  it("keeps the CMS name when the lookup falls back to the app identity", async () => {
    const author = await resolveCommitAuthor({
      session: createCommitTokenSession("user-token", "app-token"),
      fetchUser: vi.fn().mockResolvedValue({ error: { status: 403 } }),
      mapUser,
    });

    expect(author).toEqual({ name: "Ada Lovelace" });
  });

  it("does not fail the commit when the lookup errors", async () => {
    const author = await resolveCommitAuthor({
      session: createCommitTokenSession("user-token", "app-token"),
      fetchUser: async () => ({ error: { status: 500 } }),
      mapUser,
    });

    expect(author).toEqual({ name: "Ada Lovelace" });
  });
});

describe("resolveAttributionTrailer", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({
      data: {
        user: {
          user_id: "u1",
          full_name: "Ada Lovelace",
          email: "ada@cms.example",
        },
      },
    });
  });

  const resolve = (impersonate: boolean, fetchUser = vi.fn()) =>
    resolveAttributionTrailer({
      dispatch: vi.fn(() => ({ data: { impersonate } })),
      session: createCommitTokenSession(undefined, "app-token"),
      fetchUser,
      mapUser: () => ({}),
    });

  it("credits nobody for users acting as the bot", async () => {
    const fetchUser = vi.fn();
    expect(await resolve(true, fetchUser)).toBeUndefined();
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it("never publishes the CMS email", async () => {
    const trailer = await resolve(false);
    expect(trailer).toBe("Sitepins-User: Ada Lovelace");
    expect(trailer).not.toContain("ada@cms.example");
  });
});
