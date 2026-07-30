import ApiError from "@/errors/ApiError";
import { TAuthUser } from "@/types";
import { HttpStatusCode } from "axios";
import { Request } from "express";

// Controllers run behind authMiddleware, but `req.user` is still optional at
// the type level. Throwing here turns a missing session into a 401 instead of
// silently passing `undefined` down to the service layer.
export const requireUser = (req: Request): TAuthUser => {
  const user = req.user;
  if (!user?.user_id) {
    throw new ApiError(
      "User authentication required",
      HttpStatusCode.Unauthorized,
    );
  }
  return user;
};

export const requireUserId = (req: Request): string => requireUser(req).user_id;
