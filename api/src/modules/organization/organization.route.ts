import { ENUM_PERMISSIONS, ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { runRequestGuard } from "@/lib/extensionGuards";
import orgMiddleware from "@/middlewares/orgMiddleware";
import express from "express";
import { organizationController } from "./organization.controller";

const organizationRouter: express.Router = express.Router();

// get organizations by user
organizationRouter.get(
  "/user",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  organizationController.getOrganizationsByUserController,
);

// get single organization
organizationRouter.get(
  "/:org_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.VIEW_PROJECTS),
  organizationController.getOrganizationByIdController,
);

// insert organization
organizationRouter.post(
  "/",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  runRequestGuard("organization:create"),
  organizationController.createOrganizationController,
);

// The first organization is required for a usable account, so this recovery
// endpoint deliberately bypasses optional hosted-product policy hooks.
organizationRouter.post(
  "/ensure-default",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  organizationController.ensureDefaultOrganizationController,
);

// add member
organizationRouter.patch(
  "/member/:org_id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_MEMBERS),
  runRequestGuard("organization:member:add"),
  organizationController.addMemberController,
);

// update member role
organizationRouter.patch(
  "/update-role/:org_id",
  authMiddleware.verifyAuth(),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_MEMBERS),
  organizationController.updateRoleController,
);

// remove member
organizationRouter.patch(
  "/remove-member/:org_id",
  authMiddleware.verifyAuth(),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_MEMBERS),
  organizationController.removeMemberController,
);

// update organization
organizationRouter.patch(
  "/:org_id",
  authMiddleware.verifyAuth(),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_ORG),
  organizationController.updateOrganizationController,
);

// update organization status
organizationRouter.patch(
  "/status/:org_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_ORG),
  organizationController.updateOrganizationStatusController,
);

// delete organization
organizationRouter.delete(
  "/:org_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.DELETE_ORG),
  organizationController.deleteOrganizationController,
);

export default organizationRouter;
