import { afterEach, describe, expect, it, vi } from "vitest";

// brand.ts reads process.env at module load, so each case re-imports it after
// stubbing env. This locks in the "a fork can rebrand without editing code"
// contract and the safe fallbacks.

async function loadBrand() {
  vi.resetModules();
  return import("./brand");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("brand defaults", () => {
  it("falls back to the upstream identity when no env is set", async () => {
    const b = await loadBrand();
    expect(b.BRAND_NAME).toBe("Sitepins");
    expect(b.BRAND_URL).toBe("https://sitepins.com");
    expect(b.TERMS_URL).toBe("https://sitepins.com/terms");
    expect(b.PRIVACY_URL).toBe("https://sitepins.com/privacy-policy");
    expect(b.SUPPORT_URL).toBe("https://sitepins.com/contact");
    expect(b.GIT_COMMIT_EMAIL_DOMAIN).toBe("sitepins.com");
  });
});

describe("brand overrides", () => {
  it("derives support URL and commit email domain from a custom brand URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Acme CMS");
    vi.stubEnv("NEXT_PUBLIC_BRAND_URL", "https://cms.acme.io");
    const b = await loadBrand();
    expect(b.BRAND_NAME).toBe("Acme CMS");
    expect(b.TERMS_URL).toBe("https://cms.acme.io/terms");
    expect(b.PRIVACY_URL).toBe("https://cms.acme.io/privacy-policy");
    expect(b.SUPPORT_URL).toBe("https://cms.acme.io/contact");
    expect(b.GIT_COMMIT_EMAIL_DOMAIN).toBe("cms.acme.io");
  });

  it("lets support URL and email domain be overridden explicitly", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_URL", "https://cms.acme.io");
    vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "https://legal.acme.io/terms");
    vi.stubEnv("NEXT_PUBLIC_PRIVACY_URL", "https://legal.acme.io/privacy");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_URL", "https://help.acme.io");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN", "acme.io");
    const b = await loadBrand();
    expect(b.TERMS_URL).toBe("https://legal.acme.io/terms");
    expect(b.PRIVACY_URL).toBe("https://legal.acme.io/privacy");
    expect(b.SUPPORT_URL).toBe("https://help.acme.io");
    expect(b.GIT_COMMIT_EMAIL_DOMAIN).toBe("acme.io");
  });
});
