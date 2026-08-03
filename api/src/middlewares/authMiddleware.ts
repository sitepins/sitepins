import { auth, Session } from "@/auth";
import { authDemo } from "@/auth-demo";
import config from "@/config/variables";
import { ENUM_ROLE, ENUM_ROLE_ORG } from "@/enums/roles";
import { getJwtIssuers } from "@/lib/authIssuers";
import ApiError from "@/errors/ApiError";
import { jwtHelpers } from "@/lib/jwtTokenHelper";
import { HttpStatusCode } from "axios";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Request, Response } from "express";
import { JwtPayload, Secret } from "jsonwebtoken";

// Combine them into a single union type
type RequestedRole =
  | (typeof ENUM_ROLE)[keyof typeof ENUM_ROLE]
  | (typeof ENUM_ROLE_ORG)[keyof typeof ENUM_ROLE_ORG];

class AuthMiddleware {
  verifyAuth(...requestedRoles: RequestedRole[]) {
    return async function (req: Request, res: Response, next: NextFunction) {
      try {
        let session: Session | null = null;

        const headers = req.headers;
        // Only honor the demo session context when demo mode is enabled.
        const isDemo = config.demo_mode && headers["x-app-context"] === "demo";

        const sessionAuth = isDemo ? authDemo : auth;
        session = await sessionAuth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });

        if (!session) {
          // For Admin
          const token = req.headers.authorization as string;
          if (!token) {
            throw new ApiError(
              "You must be signin",
              HttpStatusCode.Unauthorized,
              "",
            );
          }
          const verificationToken = `${token.split(" ")[1]}`;

          let verifiedToken: JwtPayload | undefined;

          // Define secrets with their corresponding issuers
          const secretsWithIssuers = getJwtIssuers();

          let tokenVerified = false;
          for (const { secret, issuer, validate } of secretsWithIssuers) {
            if (!secret) continue;
            try {
              const candidate = jwtHelpers.verifyToken(
                verificationToken,
                secret as Secret,
                issuer,
              );
              // A valid signature only proves the token was minted. The
              // issuer's own check decides whether it is still current, so a
              // revoked token stops working here and not just on the routes
              // that read the token store directly.
              if (validate && !(await validate(verificationToken, candidate))) {
                continue;
              }
              verifiedToken = candidate;
              tokenVerified = true;
              break;
            } catch {
              // Continue to next secret/issuer combination
              continue;
            }
          }

          if (!tokenVerified || !verifiedToken) {
            throw new ApiError("Invalid token", 401, "");
          }

          // Bearer tokens are minted with `id`; external issuers may send an
          // explicit `user_id`. Normalize so downstream code has one field.
          const tokenUserId = verifiedToken.user_id ?? verifiedToken.id;
          if (typeof tokenUserId !== "string" || !tokenUserId) {
            throw new ApiError("Invalid token", 401, "");
          }

          req.user = { ...verifiedToken, user_id: tokenUserId };

          // Role-based access control
          if (
            requestedRoles.length > 0 &&
            !requestedRoles.includes(verifiedToken.role as RequestedRole)
          ) {
            throw new ApiError(
              "You do not have the required permissions to perform this action.",
              HttpStatusCode.Forbidden,
              "",
            );
          }
          next();
        } else {
          // for user
          // `user_id` and `role` come from better-auth additionalFields, which
          // the inferred session type does not carry.
          const sessionUser = session.user as typeof session.user & {
            user_id?: unknown;
            role?: unknown;
          };

          if (
            requestedRoles.length > 0 &&
            !requestedRoles.includes(sessionUser.role as RequestedRole)
          ) {
            throw new ApiError(
              "You do not have the required permissions to perform this action.",
              HttpStatusCode.Forbidden,
              "",
            );
          }

          if (typeof sessionUser.user_id !== "string" || !sessionUser.user_id) {
            throw new ApiError(
              "Session is missing user_id",
              HttpStatusCode.Unauthorized,
              "",
            );
          }

          req.user = { ...session.user, user_id: sessionUser.user_id };
          next();
        }
      } catch (error) {
        next(error);
      }
    };
  }
}

export const authMiddleware = new AuthMiddleware();
