import { ENUM_ROLE, ENUM_ROLE_ORG } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { projectMiddleware } from "@/middlewares/projectMiddleware";
import express from "express";
import { projectLogController } from "./project-log.controller";

const projectLogRouter: express.Router = express.Router();

// Logs belong to a project, so access follows the project's own org.
const projectMember = projectMiddleware(
  ENUM_ROLE_ORG.OWNER,
  ENUM_ROLE_ORG.ADMIN,
  ENUM_ROLE_ORG.EDITOR,
);

// get all project log
projectLogRouter.get(
  "/",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  projectLogController.getAllProjectLogController,
);

// get single project log
projectLogRouter.get(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMember,
  projectLogController.getSingleProjectLogController,
);

// update log
projectLogRouter.post(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  projectMember,
  projectLogController.createProjectLogController,
);

projectLogRouter.delete(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMember,
  projectLogController.deleteProjectLogController,
);

export default projectLogRouter;
