import { beforeEach, describe, expect, it, vi } from "vitest";

// Reoon is an optional anti-abuse layer. Two fail-open contracts here have
// broken signup in production before when violated: no API key configured
// must not block registration, and Reoon being down must not either.

const { mockConfig, axiosGetMock, isAxiosErrorMock } = vi.hoisted(() => ({
  mockConfig: { reoon_api_key: undefined as string | undefined },
  axiosGetMock: vi.fn(),
  isAxiosErrorMock: vi.fn(),
}));

vi.mock("@/config/variables", () => ({ default: mockConfig }));

vi.mock("axios", () => ({
  default: {
    get: (...args: unknown[]) => axiosGetMock(...args),
    isAxiosError: (...args: unknown[]) => isAxiosErrorMock(...args),
  },
}));

import { verifyEmailWithReoon } from "./emailVerifier";

function reoonResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      email: "a@b.com",
      status: "ok",
      is_valid_syntax: true,
      is_disposable: false,
      is_role_account: false,
      mx_accepts_mail: true,
      is_spamtrap: false,
      is_free_email: false,
      mx_records: [],
      verification_mode: "power",
      is_deliverable: true,
      is_disabled: false,
      is_safe_to_send: true,
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockConfig.reoon_api_key = undefined;
  axiosGetMock.mockReset();
  isAxiosErrorMock.mockReset();
  isAxiosErrorMock.mockReturnValue(false);
});

describe("verifyEmailWithReoon", () => {
  it("skips verification and passes when no API key is configured", async () => {
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(true);
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it("passes a fully deliverable, safe address", async () => {
    mockConfig.reoon_api_key = "key";
    axiosGetMock.mockResolvedValue(reoonResponse());
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(true);
  });

  it("rejects an undeliverable address", async () => {
    mockConfig.reoon_api_key = "key";
    axiosGetMock.mockResolvedValue(reoonResponse({ is_deliverable: false }));
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/not deliverable/i);
  });

  it("rejects a disposable address", async () => {
    mockConfig.reoon_api_key = "key";
    axiosGetMock.mockResolvedValue(reoonResponse({ is_disposable: true }));
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/disposable/i);
  });

  it("rejects a spamtrap address", async () => {
    mockConfig.reoon_api_key = "key";
    axiosGetMock.mockResolvedValue(reoonResponse({ is_spamtrap: true }));
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/spamtrap/i);
  });

  it("fails open when the Reoon API call errors", async () => {
    mockConfig.reoon_api_key = "key";
    isAxiosErrorMock.mockReturnValue(true);
    axiosGetMock.mockRejectedValue({
      response: { data: "service unavailable" },
      message: "Network Error",
    });
    const result = await verifyEmailWithReoon("a@b.com");
    expect(result.isValid).toBe(true);
  });

  it("rethrows a non-axios error instead of failing open", async () => {
    mockConfig.reoon_api_key = "key";
    isAxiosErrorMock.mockReturnValue(false);
    axiosGetMock.mockRejectedValue(new Error("boom"));
    await expect(verifyEmailWithReoon("a@b.com")).rejects.toThrow("boom");
  });
});
