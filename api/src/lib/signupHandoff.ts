import config from "@/config/variables";
import crypto from "crypto";

// A short-lived, server-minted proof that some trusted backend already
// verified this person owns/purchased under this email. `/custom-signup`
// creates a pre-verified account and signs the user straight in, so without
// this anyone could POST an arbitrary email and get a live session for it.
//
// Signed with INTERNAL_API_SECRET, which only the app server holds.

const TTL_MS = 5 * 60 * 1000;

const sign = (payload: string): string =>
  crypto
    .createHmac("sha256", config.internal_secret as string)
    .update(payload)
    .digest("hex");

export const isSignupHandoffConfigured = (): boolean =>
  Boolean(config.internal_secret);

export const createSignupHandoffToken = (
  email: string,
  name: string,
): string => {
  const issuedAt = Date.now().toString();
  const payload = `${email}\n${name}\n${issuedAt}`;
  return `${issuedAt}.${sign(payload)}`;
};

export const verifySignupHandoffToken = (
  token: unknown,
  email: string,
  name: string,
): boolean => {
  if (!isSignupHandoffConfigured()) return false;
  if (typeof token !== "string" || !token.includes(".")) return false;

  const separator = token.indexOf(".");
  const issuedAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const timestamp = Number(issuedAt);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > TTL_MS
  ) {
    return false;
  }

  const expected = sign(`${email}\n${name}\n${issuedAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
