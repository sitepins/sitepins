import { checkOrder } from "@/lib/entitlements";
import { Organization } from "@/modules/organization/organization.model";
import { NextFunction, Request, Response } from "express";

export const memberLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    const { limits } = await checkOrder(userId!);

    const orgId = req.body.org_id || req.query.orgId;

    const org = await Organization.findOne({
      org_id: orgId,
      members: {
        $elemMatch: {
          user_id: req.user?.user_id,
        },
      },
    });

    const totalMembers = org?.members.length ?? 0;

    if (totalMembers >= limits.org_member_limit) {
      res.status(400).json({ message: "Member limit reached" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
