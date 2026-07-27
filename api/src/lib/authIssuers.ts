import config from "@/config/variables";

// JWT secrets/issuers accepted for bearer-token auth (non-session requests).
// Extensions (e.g. an internal admin dashboard) can register additional
// trusted issuers at boot via registerJwtIssuer().
export type JwtIssuerEntry = {
  secret?: string;
  issuer: string;
};

const issuers: JwtIssuerEntry[] = [
  { secret: config.jwt_secret, issuer: "sitepins-backend" },
];

export const registerJwtIssuer = (entry: JwtIssuerEntry) => {
  issuers.push(entry);
};

export const getJwtIssuers = (): JwtIssuerEntry[] => issuers;
