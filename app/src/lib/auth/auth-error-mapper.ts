import { BetterFetchError } from "better-auth/react";

export type TAuthTranslator = (key: string) => string;

export function getLocalizedAuthError(
  error:
    (BetterFetchError & Record<string, unknown>) | Error | null | undefined,
  tAuth: TAuthTranslator,
): string {
  if (!error) return "";
  const msg = (error.message || "").toLowerCase();

  if (
    msg.includes("invalid email or password") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid login")
  ) {
    return tAuth("errors.invalid_credentials");
  }
  if (msg.includes("already exists") || msg.includes("user already")) {
    return tAuth("errors.user_exists");
  }
  if (msg.includes("invalid otp") || msg.includes("invalid code")) {
    return tAuth("errors.invalid_otp");
  }
  if (msg.includes("expired")) {
    return tAuth("errors.otp_expired");
  }
  if (msg.includes("invalid password") || msg.includes("incorrect password")) {
    return tAuth("errors.invalid_password");
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return tAuth("errors.rate_limited");
  }

  return error.message || tAuth("errors.server_error");
}
