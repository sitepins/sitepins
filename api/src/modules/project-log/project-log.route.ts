import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import { projectLogController } from "./project-log.controller";

const projectLogRouter: express.Router = express.Router();

// get all project log
projectLogRouter.get(
  "/",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  projectLogController.getAllProjectLogController
);

// get single project log
projectLogRouter.get(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectLogController.getSingleProjectLogController
);

// update log
projectLogRouter.post(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  projectLogController.createProjectLogController
);

projectLogRouter.delete(
  "/:project_id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  projectLogController.deleteProjectLogController
);

export default projectLogRouter;
