import { beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, tokenIndex } from "@/lib/encrypt";
import { gitProviderService } from "./git-provider.service";

// Existing installs have PLAINTEXT git tokens. This locks in that the service
// keeps serving them, and that token rotation still finds a legacy row while
// the collection is half-migrated — the failure mode here is "every user's
// Git connection breaks", so it is worth pinning precisely.

process.env.SANDBOX_ENCRYPTION_KEY = "b".repeat(64);

const findMock = vi.fn();
const findOneAndUpdateMock = vi.fn();

vi.mock("./git-provider.model", () => ({
  GitProvider: {
    find: (...a: unknown[]) => findMock(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdateMock(...a),
    findOneAndDelete: vi.fn(),
  },
}));

type SetCall = [unknown, { $set: Record<string, string> }];

const lastUpdate = (): Record<string, string> =>
  (findOneAndUpdateMock.mock.calls[0] as SetCall)[1].$set;

beforeEach(() => {
  findMock.mockReset();
  findOneAndUpdateMock.mockReset();
});

describe("git provider token migration", () => {
  it("returns LEGACY PLAINTEXT rows unchanged to the client", async () => {
    findMock.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            user_id: "@user_a",
            provider: "Github",
            access_token: "gho_plaintext_legacy",
            refresh_token: "ghr_plaintext_legacy",
            installation_access_token: "ghs_plaintext_legacy",
          },
        ]),
    });

    const [row] = await gitProviderService.getProviderService("@user_a");
    expect(row?.access_token).toBe("gho_plaintext_legacy");
    expect(row?.refresh_token).toBe("ghr_plaintext_legacy");
    expect(row?.installation_access_token).toBe("ghs_plaintext_legacy");
  });

  it("decrypts already-migrated rows back to the original token", async () => {
    findMock.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            user_id: "@user_b",
            provider: "Github",
            access_token: encrypt("gho_real"),
            refresh_token: encrypt("ghr_real"),
          },
        ]),
    });

    const [row] = await gitProviderService.getProviderService("@user_b");
    expect(row?.access_token).toBe("gho_real");
    expect(row?.refresh_token).toBe("ghr_real");
  });

  it("stores tokens encrypted, never in the clear", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    await gitProviderService.createProviderService({
      user_id: "@user_c",
      provider: "Github",
      access_token: "gho_secret",
      refresh_token: "ghr_secret",
    } as never);

    const set = lastUpdate();
    expect(set.access_token).not.toBe("gho_secret");
    expect(set.refresh_token).not.toBe("ghr_secret");
    expect(set.refresh_token_index).toBe(tokenIndex("ghr_secret"));
  });

  it("rotation still matches a LEGACY PLAINTEXT row (half-migrated DB)", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    await gitProviderService.rotateProviderTokensService({
      provider: "Github",
      old_refresh_token: "ghr_legacy_plaintext",
      access_token: "gho_new",
      refresh_token: "ghr_new",
    });

    const filter = findOneAndUpdateMock.mock.calls[0]?.[0] as {
      $or?: Array<Record<string, unknown>>;
    };
    const clauses = JSON.stringify(filter.$or);
    // must still find the row by its plaintext column
    expect(clauses).toContain("ghr_legacy_plaintext");
    // and by the new deterministic index
    expect(clauses).toContain(tokenIndex("ghr_legacy_plaintext") as string);
  });

  it("rotation re-seals the row and refreshes its index", async () => {
    findOneAndUpdateMock.mockResolvedValue(null);
    await gitProviderService.rotateProviderTokensService({
      provider: "Github",
      old_refresh_token: "ghr_old",
      access_token: "gho_new",
      refresh_token: "ghr_new",
    });

    const set = lastUpdate();
    expect(set.access_token).not.toBe("gho_new");
    expect(set.refresh_token).not.toBe("ghr_new");
    expect(set.refresh_token_index).toBe(tokenIndex("ghr_new"));
  });

  it("survives a row whose token is undecryptable instead of throwing", async () => {
    findMock.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { user_id: "@user_d", provider: "Gitlab", access_token: "a:b:c" },
        ]),
    });

    const rows = await gitProviderService.getProviderService("@user_d");
    expect(rows[0]?.access_token).toBe("a:b:c");
  });
});
