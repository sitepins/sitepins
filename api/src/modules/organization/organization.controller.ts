import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { organizationService } from "./organization.service";

// get organizations by user
const getOrganizationsByUserController = catchAsync(
  async (req: Request, res: Response) => {
    const organization =
      await organizationService.getOrganizationsByUserService(
        (req.params.userId as string) || req.user?.user_id!,
      );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: organization,
      message: "data get successfully",
    });
  },
);

// get organization by id
const getOrganizationByIdController = catchAsync(
  async (req: Request, res: Response) => {
    const organization = await organizationService.getOrganizationService({
      org_id: req.params.org_id as string,
      userId: req.query.owner_id || req.user?.user_id!,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: organization,
      message: "data get successfully",
    });
  },
);

// create organization
const createOrganizationController = catchAsync(
  async (req: Request, res: Response) => {
    const { org_name, email } = req.body;
    const organizationData =
      await organizationService.createOrganizationService({
        org_name,
        email,
        owner: req.user?.user_id!,
      });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "organization created successfully",
      result: organizationData,
    });
  },
);

// Update organization
const updateOrganizationController = catchAsync(
  async (req: Request, res: Response) => {
    const { org_name, org_image, sandbox } = req.body;
    const org_id = req.params.org_id as string;

    const updateOrganization =
      await organizationService.updateOrganizationService({
        org_id,
        organization: {
          org_name,
          org_image,
          ...(sandbox !== undefined && { sandbox }),
        },
      });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Organization updated successfully",
      result: updateOrganization,
    });
  },
);

// Remove member
const removeMemberController = catchAsync(
  async (req: Request, res: Response) => {
    const org_id = req.params.org_id as string;
    const memberId = req.body.member_id;
    const removeMember = await organizationService.removeTeamMemberService({
      loggedInUserId: req.user?.user_id!,
      org_id,
      userId: memberId,
    });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Member removed successfully",
      result: removeMember,
    });
  },
);

// Update team member
const updateRoleController = catchAsync(async (req: Request, res: Response) => {
  const org_id = req.params.org_id as string;
  const { role, member_id } = req.body;
  const updateTeamMember = await organizationService.updateRoleService({
    org_id,
    teamMember: {
      role,
      user_id: member_id,
    },
    loggedInUserId: req.user?.user_id!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Member updated successfully",
    result: updateTeamMember,
  });
});

// Add member controller
const addMemberController = catchAsync(async (req: Request, res: Response) => {
  const { email, role } = req.body;
  const org_id = req.params.org_id as string;
  const teamMember = await organizationService.addTeamMemberService({
    org_id,
    teamMember: {
      email,
      role,
      user_id: email,
    },
    loggedInUserId: req.user?.user_id!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Member added successfully",
    result: teamMember,
  });
});

// update organization status
const updateOrganizationStatusController = catchAsync(
  async (req: Request, res: Response) => {
    const org_id = req.params.org_id as string;
    const { status } = req.body;
    const updateOrganizationStatus =
      await organizationService.updateOrganizationStatusService({
        org_id,
        status,
      });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Organization status updated successfully",
      result: updateOrganizationStatus,
    });
  },
);

// Delete organization
const deleteOrganizationController = catchAsync(
  async (req: Request, res: Response) => {
    const org_id = req.params.org_id as string;
    const deleteOrganization =
      await organizationService.deleteOrganizationService({
        org_id,
        userId: req.user?.user_id!,
      });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Organization deleted successfully",
      result: deleteOrganization,
    });
  },
);

export const organizationController = {
  getOrganizationsByUserController,
  createOrganizationController,
  addMemberController,
  removeMemberController,
  updateRoleController,
  updateOrganizationController,
  updateOrganizationStatusController,
  deleteOrganizationController,
  getOrganizationByIdController,
};
