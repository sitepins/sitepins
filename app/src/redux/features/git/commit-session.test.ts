import { describe, expect, it, vi } from "vitest";
import {
  coAuthorOf,
  createCommitTokenSession,
  isPermissionError,
  prepareCommit,
} from "./commit-session";

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

describe("coAuthorOf", () => {
  const author = { name: "Ada", email: "ada@example.com" };

  it("credits the user when attribution is on", () => {
    const session = createCommitTokenSession("user-token", "app-token");
    expect(coAuthorOf(author, { impersonate: false, session })).toEqual(author);
  });

  it("suppresses the trailer when the user opted into impersonation", () => {
    const session = createCommitTokenSession("user-token", "app-token");
    expect(coAuthorOf(author, { impersonate: true, session })).toEqual({});
  });

  it("suppresses the trailer once the commit fell back to the app identity", async () => {
    const session = createCommitTokenSession("user-token", "app-token");
    await session.run(async () => ({ error: { status: 403 } }));

    expect(coAuthorOf(author, { impersonate: false, session })).toEqual({});
  });
});
