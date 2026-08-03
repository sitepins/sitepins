import { ENUM_ROLE_ORG } from "@/enums/roles";
import { internalOrAuth } from "@/middlewares/internalOrAuth";
import { projectMiddleware } from "@/middlewares/projectMiddleware";
import express from "express";
import { projectPreviewController } from "./project-preview.controller";

const projectPreviewRouter: express.Router = express.Router();

// Preview state carries the live sandbox URL of a (possibly private) site, so
// session callers must be a member of the project's own org. Internal
// server-to-server callers are passed through by projectMiddleware.
const previewAccess = projectMiddleware(
  ENUM_ROLE_ORG.OWNER,
  ENUM_ROLE_ORG.ADMIN,
  ENUM_ROLE_ORG.EDITOR,
);

projectPreviewRouter.get(
  "/:project_id",
  internalOrAuth,
  previewAccess,
  projectPreviewController.getByProjectIdController,
);

projectPreviewRouter.put(
  "/:project_id",
  internalOrAuth,
  previewAccess,
  projectPreviewController.upsertController,
);

projectPreviewRouter.delete(
  "/:project_id",
  internalOrAuth,
  previewAccess,
  projectPreviewController.deleteByProjectIdController,
);

export default projectPreviewRouter;
