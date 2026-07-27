import { internalOrAuth } from "@/middlewares/internalOrAuth";
import express from "express";
import { projectPreviewController } from "./project-preview.controller";

const projectPreviewRouter: express.Router = express.Router();

projectPreviewRouter.get(
  "/:project_id",
  internalOrAuth,
  projectPreviewController.getByProjectIdController,
);

projectPreviewRouter.put(
  "/:project_id",
  internalOrAuth,
  projectPreviewController.upsertController,
);

projectPreviewRouter.delete(
  "/:project_id",
  internalOrAuth,
  projectPreviewController.deleteByProjectIdController,
);

export default projectPreviewRouter;
