import { ENUM_ROLE, ENUM_ROLE_ORG } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { projectMiddleware } from "@/middlewares/projectMiddleware";
import express from "express";
import { projectContentController } from "./project-content.controller";

const projectContentRouter: express.Router = express.Router();

// GET  /project-content/:project_id          — list all files (no content body)
// org members with VIEW_PROJECTS permission only
projectContentRouter.get(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ),
  projectContentController.getProjectContentListController,
);

// GET  /project-content/:project_id/file?file=<path>  — read one file
// org members with VIEW_PROJECTS permission only
projectContentRouter.get(
  "/:project_id/file",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ),
  projectContentController.getSingleProjectContentController,
);

// POST /project-content/:project_id          — create or update a file
// org members with MANAGE_PROJECTS, plus EDITOR role for save
projectContentRouter.post(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ),
  projectContentController.upsertProjectContentController,
);

// DELETE /project-content/:project_id/file?file=<path>  — delete one file
// org members with OWNER, ADMIN, or EDITOR role
projectContentRouter.delete(
  "/:project_id/file",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectMiddleware(
    ENUM_ROLE_ORG.OWNER,
    ENUM_ROLE_ORG.ADMIN,
    ENUM_ROLE_ORG.EDITOR,
  ),
  projectContentController.deleteProjectContentController,
);

// DELETE /project-content/:project_id        — delete all files in a project
// ADMIN only — no org-level check needed
projectContentRouter.delete(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  projectContentController.deleteAllProjectContentController,
);

export default projectContentRouter;
