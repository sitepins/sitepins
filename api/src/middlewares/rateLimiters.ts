import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

// Limits are deliberately generous — they exist to stop credential/OTP
// brute-force and scripted abuse, not to throttle normal editor use. Tune with
// the env vars if a deployment sits behind a shared egress IP.
const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Try again later." },
};

/**
 * Broad ceiling for the whole JSON API. Deliberately far above real usage:
 * the editor is chatty (autosave, presence, content fetches, several tabs at
 * once) and a shared office/NAT egress IP multiplies that across users. This
 * exists to stop scripted enumeration, not to shape traffic — the limiter that
 * actually matters for attacks is authLimiter.
 */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: num(process.env.API_RATELIMIT_WINDOW_MS, 60_000),
  limit: num(process.env.API_RATELIMIT_MAX, 1000),
});

/**
 * Credential and one-time-code endpoints. A 4–6 digit OTP is only as strong as
 * the number of guesses an attacker gets, so this is the control that makes
 * the code space matter.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: num(process.env.AUTH_RATELIMIT_WINDOW_MS, 15 * 60_000),
  limit: num(process.env.AUTH_RATELIMIT_MAX, 10),
  skipSuccessfulRequests: true,
});

/** Upload endpoints — bandwidth and storage abuse. */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: num(process.env.UPLOAD_RATELIMIT_WINDOW_MS, 60_000),
  limit: num(process.env.UPLOAD_RATELIMIT_MAX, 30),
});

// Keyed by the agent's grant, so one runaway agent can't starve others behind the same IP.
const agentKey = (req: Request) =>
  req.agent?.grant.grant_id ?? ipKeyGenerator(req.ip ?? "");

/** Every agent request (MCP and git fetch). */
export const agentLimiter = rateLimit({
  ...shared,
  keyGenerator: agentKey,
  windowMs: 60_000,
  limit: 300,
});

/** Clones and fetches stream whole repositories through the API. */
export const agentGitLimiter = rateLimit({
  ...shared,
  keyGenerator: agentKey,
  windowMs: 60 * 60_000,
  limit: 120,
});
