import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, tokenIndex } from "./encrypt";

// The git-provider rows of existing installs are PLAINTEXT. Turning encryption
// on must keep reading them, and must keep the rotation lookup working while
// rows are half-migrated. These are the cases that would silently disconnect
// every user's Git account if they regressed.
//
// getKey() reads process.env on every call, so setting the var per test is
// enough — no module reset needed.
const KEY_ENV = "SANDBOX_ENCRYPTION_KEY";
const original = process.env[KEY_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = original;
});

describe("token encryption migration safety", () => {
  it("round-trips a value when a key is configured", () => {
    process.env[KEY_ENV] = "a".repeat(64);
    const token = "gho_lIvE_tOkEn_123";
    const sealed = encrypt(token);
    expect(sealed).not.toBe(token);
    expect(sealed.split(":")).toHaveLength(3);
    expect(decrypt(sealed)).toBe(token);
  });

  it("passes legacy PLAINTEXT rows through decrypt untouched", () => {
    process.env[KEY_ENV] = "a".repeat(64);
    // what is already in the database today
    expect(decrypt("gho_legacy_plaintext")).toBe("gho_legacy_plaintext");
  });

  it("is a no-op when no key is set, so unconfigured installs keep working", () => {
    delete process.env[KEY_ENV];
    expect(encrypt("gho_abc")).toBe("gho_abc");
    expect(decrypt("gho_abc")).toBe("gho_abc");
    // null index => rotation falls back to matching the plaintext column
    expect(tokenIndex("gho_abc")).toBeNull();
  });

  it("derives a stable, deterministic rotation index", () => {
    process.env[KEY_ENV] = "a".repeat(64);
    const token = "ghr_refresh_me";
    // ciphertext differs every time (random IV) — the index must not
    expect(encrypt(token)).not.toBe(encrypt(token));
    expect(tokenIndex(token)).toBe(tokenIndex(token));
    expect(tokenIndex(token)).not.toBe(tokenIndex("ghr_other"));
  });

  it("accepts a non-hex passphrase as a key", () => {
    process.env[KEY_ENV] = "not-hex-just-a-passphrase";
    expect(decrypt(encrypt("gho_abc"))).toBe("gho_abc");
  });

  it("throws rather than silently corrupting a colon-bearing plaintext", () => {
    process.env[KEY_ENV] = "a".repeat(64);
    // callers wrap decrypt in try/catch and fall back to the stored value
    expect(() => decrypt("glpat:abc:def")).toThrow();
  });
});
