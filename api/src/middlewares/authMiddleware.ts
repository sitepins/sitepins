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
import { Secret } from "jsonwebtoken";

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
        const isDemo =
          config.demo_mode && headers["x-app-context"] === "demo";

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

          let verifiedToken: any;

          // Define secrets with their corresponding issuers
          const secretsWithIssuers = getJwtIssuers();

          let tokenVerified = false;
          for (const { secret, issuer } of secretsWithIssuers) {
            if (!secret) continue;
            try {
              verifiedToken = jwtHelpers.verifyToken(
                verificationToken,
                secret as Secret,
                issuer,
              );
              tokenVerified = true;
              break;
            } catch (error) {
              // Continue to next secret/issuer combination
              continue;
            }
          }

          if (!tokenVerified) {
            throw new ApiError("Invalid token", 401, "");
          }

          req.user = verifiedToken;

          // Role-based access control
          if (
            requestedRoles.length > 0 &&
            !requestedRoles.includes(verifiedToken?.role as RequestedRole)
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
          if (
            requestedRoles.length > 0 &&
            !requestedRoles.includes(
              (session as any).user.role as RequestedRole,
            )
          ) {
            throw new ApiError(
              "You do not have the required permissions to perform this action.",
              HttpStatusCode.Forbidden,
              "",
            );
          }

          req.user = session.user;
          next();
        }
      } catch (error) {
        next(error);
      }
    };
  }
}

export const authMiddleware = new AuthMiddleware();
