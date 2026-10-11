import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/variables", () => ({
  default: { internal_secret: "s3cret" },
}));
vi.mock("@/lib/appUrl", () => ({ getAppUrl: () => "http://app.test" }));

import { getProjectToken } from "./agent.git";

afterEach(() => vi.unstubAllGlobals());

describe("getProjectToken", () => {
  it("shares one mint between concurrent callers and caches the result", async () => {
    let release: () => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              Response.json({
                provider: "Github",
                token: "ghs_x",
                expires_at: Date.now() + 3_600_000,
              }),
            );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = getProjectToken("p-share", "u1");
    const second = getProjectToken("p-share", "u1");
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ token: "ghs_x" }),
      expect.objectContaining({ token: "ghs_x" }),
    ]);
    await getProjectToken("p-share", "u1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed mint instead of caching the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "nope" }, { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({ provider: "Github", token: "ghs_y", expires_at: 0 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProjectToken("p-fail", "u1")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(getProjectToken("p-fail", "u1")).resolves.toMatchObject({
      token: "ghs_y",
    });
  });
});
