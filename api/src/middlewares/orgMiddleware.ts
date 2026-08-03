import { TPermission } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { requireOrgPermission, resolveTargetOrgId } from "@/lib/resourceAuth";
import { NextFunction, Request, Response } from "express";

const orgMiddleware =
  (requiredPermission: TPermission) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        throw new ApiError("User authentication required", 401, "");
      }

      // Derived from the target resource, never from the query string —
      // see resolveTargetOrgId.
      const orgId = await resolveTargetOrgId(req);

      if (!orgId) {
        throw new ApiError("Organization ID is required", 400, "");
      }

      await requireOrgPermission(userId, orgId, requiredPermission);
      next();
    } catch (error) {
      next(error);
    }
  };

export default orgMiddleware;
