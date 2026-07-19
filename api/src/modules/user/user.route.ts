import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import { userController } from "./user.controller";

const userRouter: express.Router = express.Router();

// get single user
userRouter.get(
  "/:id",
  authMiddleware.verifyAuth(
    ENUM_ROLE.ADMIN,
    ENUM_ROLE.USER,
    ENUM_ROLE.MODERATOR
  ),
  userController.getSingleUserController
);

// set password
userRouter.patch(
  "/set-password",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  userController.setPasswordController
);

// update user country
userRouter.patch(
  "/update-country/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userController.updateUserCountryController
);

// update user email
userRouter.patch(
  "/update-email/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  userController.updateUserEmailController
);

// delete user
userRouter.delete(
  "/delete/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userController.deleteUserController
);

// check limits
userRouter.post(
  "/check-limits",
  authMiddleware.verifyAuth(ENUM_ROLE.USER, ENUM_ROLE.ADMIN),
  userController.checkLimitsController
);

export default userRouter;
