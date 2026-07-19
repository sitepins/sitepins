import variables from "@/config/variables";
import jwt, { JwtPayload, Secret, SignOptions } from "jsonwebtoken";

// create token
const createToken = (
  payload: Record<string, unknown>,
  secret: Secret,
  expires?: string,
  timeStamp?: string
): string => {
  const enhancedPayload = {
    id: payload?.id,
    role: payload?.role,
    at: timeStamp || Date.now().toString(),
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(enhancedPayload, secret as Secret, <SignOptions>{
    expiresIn: expires ? expires : "24h",
    issuer: "sitepins-backend",
  });
};

// delete token
const deleteToken = (token: string, secret: Secret): string => {
  return jwt.sign({ id: token }, secret as Secret, {
    expiresIn: "0s",
  });
};

// verify token with specific issuer
const verifyToken = (
  token: string,
  secret: Secret,
  issuer?: string
): JwtPayload => {
  try {
    const options: any = {};
    if (issuer) {
      options.issuer = issuer;
    }

    const decoded = jwt.verify(token, secret, options) as JwtPayload;

    // Additional validation
    if (!decoded.id || !decoded.role) {
      throw new Error("Invalid token structure");
    }

    // Check if token is not too old (additional security layer)
    if (decoded.iat) {
      const tokenAge = Date.now() - decoded.iat * 1000;

      // Determine max age from configured jwt_expire (supports formats like '7d', '24h', '3600s', '30m')
      const parseExpiryToMs = (exp?: string): number => {
        if (!exp) return 24 * 60 * 60 * 1000; // default 24h
        const m = String(exp)
          .trim()
          .toLowerCase()
          .match(/^(\d+)([smhd])$/);
        if (!m) {
          // fallback: try to parse as number of seconds
          const n = Number(exp);
          if (!Number.isNaN(n)) return n * 1000;
          return 24 * 60 * 60 * 1000;
        }
        const val = Number(m[1]);
        const unit = m[2];
        switch (unit) {
          case "s":
            return val * 1000;
          case "m":
            return val * 60 * 1000;
          case "h":
            return val * 60 * 60 * 1000;
          case "d":
          default:
            return val * 24 * 60 * 60 * 1000;
        }
      };

      const maxAge = parseExpiryToMs(variables.jwt_expire as string);
      if (tokenAge > maxAge) {
        throw new Error("Token too old");
      }
    }

    return decoded;
  } catch (error) {
    // Preserve original JWT error messages when possible so callers can react (e.g. "jwt expired")
    if (error instanceof Error) throw error;
    throw new Error("Token verification failed");
  }
};

export const jwtHelpers = {
  createToken,
  deleteToken,
  verifyToken,
};
