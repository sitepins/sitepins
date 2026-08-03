import crypto from "crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "SANDBOX_ENCRYPTION_KEY";

function getKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  // Accept 64-char hex (32 bytes) or any string (hashed to 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    logger.warn(
      `[encrypt] ${KEY_ENV} not set — storing token unencrypted. Set the env var to enable encryption.`,
    );
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Deterministic lookup index for a value stored encrypted. AES-GCM uses a
 * random IV, so the ciphertext of the same token differs every write and
 * cannot be matched with an equality query — this HMAC can.
 * Returns null when no key is configured (callers then match on plaintext).
 */
export function tokenIndex(plaintext: string): string | null {
  const key = getKey();
  if (!key || !plaintext) return null;
  return crypto.createHmac("sha256", key).update(plaintext).digest("hex");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  // If no key or not in encrypted format, return as-is (plaintext / migration safety)
  if (!key || parts.length !== 3) return ciphertext;
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}
