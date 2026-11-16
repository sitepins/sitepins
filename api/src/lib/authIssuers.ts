import brand from "@/config/brand";
import config from "@/config/variables";
import type { JwtPayload } from "jsonwebtoken";

// JWT secrets/issuers accepted for bearer-token auth (non-session requests).
// Extensions (e.g. an internal admin dashboard) can register additional
// trusted issuers at boot via registerJwtIssuer().
export type JwtIssuerEntry = {
  secret?: string;
  issuer: string;
  validate?: (token: string, payload: JwtPayload) => Promise<boolean>;
};

const coreIssuer: JwtIssuerEntry = {
  secret: config.jwt_secret,
  issuer: brand.jwt_issuer,
};

const issuers: JwtIssuerEntry[] = [coreIssuer];

export const registerJwtIssuer = (entry: JwtIssuerEntry) => {
  issuers.push(entry);
};

/** Attaches a policy check to tokens signed with the core JWT secret. */
export const setCoreIssuerValidator = (
  validate: NonNullable<JwtIssuerEntry["validate"]>,
) => {
  coreIssuer.validate = validate;
};

export const getJwtIssuers = (): JwtIssuerEntry[] => issuers;
