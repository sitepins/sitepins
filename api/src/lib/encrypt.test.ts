import { afterEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "./encrypt";

// Encrypts the org sandbox token at rest. Two safety properties matter most:
// self-hosters with no key configured must not be blocked (plaintext
// passthrough both ways), and a tampered ciphertext must never silently
// decrypt to the wrong thing (GCM auth tag enforces that).

const KEY_ENV = "SANDBOX_ENCRYPTION_KEY";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encrypt/decrypt", () => {
  it("passes plaintext through unchanged when no key is configured", () => {
    vi.stubEnv(KEY_ENV, "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(encrypt("secret-token")).toBe("secret-token");
    warnSpy.mockRestore();
  });

  it("decrypt is a no-op when no key is configured", () => {
    vi.stubEnv(KEY_ENV, "");
    expect(decrypt("anything-at-all")).toBe("anything-at-all");
  });

  it("round trips with an arbitrary string key (hashed to 32 bytes)", () => {
    vi.stubEnv(KEY_ENV, "my-passphrase");
    const ciphertext = encrypt("gho_abc123");
    expect(ciphertext).not.toBe("gho_abc123");
    expect(decrypt(ciphertext)).toBe("gho_abc123");
  });

  it("round trips with a 64-char hex key", () => {
    vi.stubEnv(KEY_ENV, "a".repeat(64));
    const ciphertext = encrypt("gho_abc123");
    expect(decrypt(ciphertext)).toBe("gho_abc123");
  });

  it("produces the iv:tag:ciphertext hex format", () => {
    vi.stubEnv(KEY_ENV, "my-passphrase");
    const parts = encrypt("hello").split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // 12-byte iv
    expect(parts[1]).toHaveLength(32); // 16-byte gcm tag
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  it("returns malformed (non 3-part) ciphertext as-is instead of throwing — migration safety", () => {
    vi.stubEnv(KEY_ENV, "my-passphrase");
    expect(decrypt("plain-legacy-token")).toBe("plain-legacy-token");
  });

  it("throws when the ciphertext has been tampered with", () => {
    vi.stubEnv(KEY_ENV, "my-passphrase");
    const [iv, tag, data] = encrypt("gho_abc123").split(":");
    const flippedLastByte = data.slice(0, -2) + (data.slice(-2) === "00" ? "ff" : "00");
    expect(() => decrypt(`${iv}:${tag}:${flippedLastByte}`)).toThrow();
  });

  it("throws when decrypted with the wrong key", () => {
    vi.stubEnv(KEY_ENV, "key-one");
    const ciphertext = encrypt("gho_abc123");
    vi.stubEnv(KEY_ENV, "key-two");
    expect(() => decrypt(ciphertext)).toThrow();
  });
});
