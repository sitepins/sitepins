import { checkOrder } from "@/lib/entitlements";
import { Organization } from "@/modules/organization/organization.model";
import { Project } from "@/modules/project/project.model";
import { NextFunction, Request, Response } from "express";

export const projectLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId = req.body.org_id;

    // Get the organization to find the owner
    const organization = await Organization.findOne({ org_id: orgId });
    if (!organization) {
      res.status(404).json({ message: "Organization not found" });
      return;
    }

    const { limits } = await checkOrder(organization.owner);

    const privateSites = await Project.countDocuments({
      org_id: orgId,
      private: true,
      status: "active",
    });

    const totalSites = await Project.countDocuments({
      org_id: orgId,
      status: "active",
    });

    const { private: isPrivate } = req.body;

    if (privateSites >= limits.org_private_site_limit && isPrivate) {
      res.status(400).json({ message: "Private site limit reached" });
      return;
    }

    if (totalSites >= limits.org_site_limit) {
      res.status(400).json({ message: "Site limit reached" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
