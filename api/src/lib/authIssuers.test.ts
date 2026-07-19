import { describe, expect, it, vi } from "vitest";

async function freshAuthIssuers() {
  vi.resetModules();
  return import("./authIssuers");
}

describe("JWT issuer registry", () => {
  it("starts with only the core sitepins-backend issuer", async () => {
    const { getJwtIssuers } = await freshAuthIssuers();
    const issuers = getJwtIssuers();
    expect(issuers).toHaveLength(1);
    expect(issuers[0].issuer).toBe("sitepins-backend");
  });

  it("extensions can register additional trusted issuers", async () => {
    const { getJwtIssuers, registerJwtIssuer } = await freshAuthIssuers();
    registerJwtIssuer({ secret: "s3cret", issuer: "my-admin-dashboard" });

    const issuers = getJwtIssuers();
    expect(issuers).toHaveLength(2);
    expect(issuers[1]).toEqual({
      secret: "s3cret",
      issuer: "my-admin-dashboard",
    });
    // core issuer must stay first so it's tried first
    expect(issuers[0].issuer).toBe("sitepins-backend");
  });
});
