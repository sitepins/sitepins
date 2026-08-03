import { ENUM_ROLE } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { readId } from "@/lib/resourceAuth";
import { RequestHandler } from "express";

/**
 * Guards routes whose `:param` is a user id: the caller may only act on their
 * own record. Platform admins and internal server-to-server callers pass
 * through.
 */
export const selfOrAdmin = (
  param = "id",
  exemptRoles: readonly string[] = [ENUM_ROLE.ADMIN],
): RequestHandler => {
  return (req, res, next) => {
    try {
      if (req.isInternal) return next();

      const user = req.user;
      if (!user?.user_id) {
        throw new ApiError("User authentication required", 401, "");
      }

      if (typeof user.role === "string" && exemptRoles.includes(user.role)) {
        return next();
      }

      const targetId = readId(req.params[param]);
      if (targetId && targetId !== user.user_id) {
        throw new ApiError(
          "You are not authorized to access this resource",
          403,
          "",
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
