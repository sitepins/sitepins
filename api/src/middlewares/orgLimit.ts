import { checkOrder } from "@/lib/entitlements";
import { Organization } from "@/modules/organization/organization.model";
import { NextFunction, Request, Response } from "express";

export const orgLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    const { limits } = await checkOrder(userId!);

    const orgCount = await Organization.countDocuments({ owner: userId });

    // Check if the user has reached the organization limit
    if (orgCount >= limits.org_limit) {
      res.status(400).json({ message: "Organization limit reached" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
