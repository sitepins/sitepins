import { TOrgRole } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { requireOrgRole, resolveTargetOrgId } from "@/lib/resourceAuth";
import { RequestHandler } from "express";

export const projectMiddleware = (
  ...allowedRoles: TOrgRole[]
): RequestHandler => {
  return async (req, res, next) => {
    try {
      // Server-to-server callers hold INTERNAL_API_SECRET and have no org
      // membership to check; the calling app already authorized the user.
      if (req.isInternal) {
        return next();
      }

      const userId = req.user?.user_id;

      if (!userId) {
        throw new ApiError("User authentication required", 401, "");
      }

      // Derived from the target project itself, never from a caller-supplied
      // query/body org id — see resolveTargetOrgId.
      const orgId = await resolveTargetOrgId(req);

      if (!orgId) {
        throw new ApiError("Organization ID is required", 400, "");
      }

      await requireOrgRole(userId, orgId, allowedRoles);
      next();
    } catch (error) {
      next(error);
    }
  };
};
