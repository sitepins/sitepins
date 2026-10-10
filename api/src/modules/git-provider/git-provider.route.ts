import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { internalOnly } from "@/middlewares/internalOnly";
import { internalOrRole } from "@/middlewares/internalOrAuth";
import express from "express";
import { gitProviderController } from "./git-provider.controller";

const gitProviderRouter: express.Router = express.Router();

// update user provider
gitProviderRouter.post(
  "/create",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.createProviderController,
);

// persist rotated oauth tokens
gitProviderRouter.post(
  "/rotate",
  internalOrRole(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.rotateProviderController,
);

// owner tokens for a project member — web server only
gitProviderRouter.get(
  "/project-grant/:projectId",
  internalOnly,
  gitProviderController.getProjectGrantController,
);

//  get user All Provider
gitProviderRouter.get(
  "/:userId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.getProviderController,
);

export default gitProviderRouter;
