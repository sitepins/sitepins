import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import { gitProviderController } from "./git-provider.controller";

const gitProviderRouter: express.Router = express.Router();

// update user provider
gitProviderRouter.post(
  "/create",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.createProviderController
);

// persist rotated oauth tokens
gitProviderRouter.post(
  "/rotate",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.rotateProviderController
);

//  get user All Provider
gitProviderRouter.get(
  "/:userId",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  gitProviderController.getProviderController
);

export default gitProviderRouter;
