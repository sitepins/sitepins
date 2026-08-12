import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { selfOrAdmin } from "@/middlewares/selfOrAdmin";
import express from "express";
import { userController } from "./user.controller";

const userRouter: express.Router = express.Router();

// get single user — own profile only (platform admins/moderators excepted).
// Without this, predictable user ids made every account's email readable.
userRouter.get(
  "/:id",
  authMiddleware.verifyAuth(
    ENUM_ROLE.ADMIN,
    ENUM_ROLE.USER,
    ENUM_ROLE.MODERATOR,
  ),
  selfOrAdmin("id", [ENUM_ROLE.ADMIN, ENUM_ROLE.MODERATOR]),
  userController.getSingleUserController,
);

// set password
userRouter.patch(
  "/set-password",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER),
  userController.setPasswordController,
);

// update user country
userRouter.patch(
  "/update-country/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  selfOrAdmin("id"),
  userController.updateUserCountryController,
);

// update user email
userRouter.patch(
  "/update-email/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  userController.updateUserEmailController,
);

// delete user
userRouter.delete(
  "/delete/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userController.deleteUserController,
);

export default userRouter;
