import { ENUM_PERMISSIONS, ENUM_ROLE, ENUM_ROLE_ORG } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import orgMiddleware from "@/middlewares/orgMiddleware";
import { projectLimit } from "@/middlewares/projectLimit";
import { projectMiddleware } from "@/middlewares/projectMiddleware";
import express from "express";
import { projectController } from "./project.controller";

export const projectRouter: express.Router = express.Router();

// get all projects
projectRouter.get(
  "/",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  projectController.getAllProjectController,
);

// get single project
projectRouter.get(
  "/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ), // GET SINGLE PROJECT IS ONLY FOR THOSE WHO ARE MEMBER OF THE ORG
  projectController.getSingleProjectController,
);

// get single project
projectRouter.get(
  "/admin/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  projectController.getSingleProjectController,
);

// get project by user id
projectRouter.get(
  "/user/:userId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectController.getProjectByUserIdController,
);

// get project by org id
projectRouter.get(
  "/orgs/:orgId",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ), // GET PROJECT BY ORG ID IS ONLY FOR THOSE WHO ARE MEMBER OF THE ORG
  projectController.getProjectByOrgIdController,
);

// insert project
projectRouter.post(
  "/create",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // CREATE PROJECT IS ONLY FOR OWNER AND ADMIN
  projectLimit,
  projectController.createProjectController,
);

// update project
projectRouter.patch(
  "/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // UPDATE PROJECT IS ONLY FOR OWNER AND ADMIN
  projectController.updateProjectController,
);

// update project visibility (private/public)
projectRouter.patch(
  "/visibility/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // UPDATE PROJECT VISIBILITY IS ONLY FOR OWNER AND ADMIN
  projectController.updateProjectVisibilityController,
);

// update project status (active/archived)
projectRouter.patch(
  "/status/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // UPDATE PROJECT STATUS IS ONLY FOR OWNER AND ADMIN
  projectController.updateProjectStatusController,
);

// update project generator
projectRouter.patch(
  "/generator/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // UPDATE PROJECT GENERATOR IS ONLY FOR OWNER AND ADMIN
  projectController.updateProjectGeneratorController,
);

// update git connection (repository and branch)
projectRouter.patch(
  "/git/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN), // UPDATE GIT CONNECTION IS ONLY FOR OWNER AND ADMIN
  projectController.updateGitConnectionController,
);

// move project to another org
projectRouter.patch(
  "/move/:orgId/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.DELETE_ORG),
  projectController.moveProjectController,
);

// delete project
projectRouter.delete(
  "/:projectId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  orgMiddleware(ENUM_PERMISSIONS.MANAGE_PROJECTS),
  projectController.deleteProjectController,
);

export default projectRouter;
