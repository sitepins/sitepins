import config from "@/config/variables";
import type { JwtPayload } from "jsonwebtoken";

// JWT secrets/issuers accepted for bearer-token auth (non-session requests).
// Extensions (e.g. an internal admin dashboard) can register additional
// trusted issuers at boot via registerJwtIssuer().
export type JwtIssuerEntry = {
  secret?: string;
  issuer: string;
  /**
   * Optional extra check run after this entry's signature verifies. A valid
   * signature only proves the token was minted — it says nothing about whether
   * it has since been revoked. The cloud edition attaches a validator to the
   * core entry so deleting a personal access token takes effect immediately
   * instead of at expiry.
   */
  validate?: (token: string, payload: JwtPayload) => Promise<boolean>;
};

const coreIssuer: JwtIssuerEntry = {
  secret: config.jwt_secret,
  issuer: "sitepins-backend",
};

const issuers: JwtIssuerEntry[] = [coreIssuer];

export const registerJwtIssuer = (entry: JwtIssuerEntry) => {
  issuers.push(entry);
};

/** Attaches a revocation check to tokens signed with the core JWT secret. */
export const setCoreIssuerValidator = (
  validate: NonNullable<JwtIssuerEntry["validate"]>,
) => {
  coreIssuer.validate = validate;
};

export const getJwtIssuers = (): JwtIssuerEntry[] => issuers;
