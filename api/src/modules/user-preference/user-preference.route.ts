import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import { userPreferenceController } from "./user-preference.controller";

const userPreferenceRouter: express.Router = express.Router();

// get single user preference
userPreferenceRouter.get(
  "/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.getUserPreferenceController,
);

// update theme preference
userPreferenceRouter.patch(
  "/theme/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.updateThemePreferenceController,
);

// update language preference
userPreferenceRouter.patch(
  "/language/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.updateLanguagePreferenceController,
);

// update timezone preference
userPreferenceRouter.patch(
  "/timezone/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.updateTimezonePreferenceController,
);

// update co-author preference
userPreferenceRouter.patch(
  "/impersonate/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.updateCoAuthorPreferenceController,
);

// update preference
userPreferenceRouter.patch(
  "/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  userPreferenceController.updateUserPreferenceController,
);

export default userPreferenceRouter;
