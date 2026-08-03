import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { selfOrAdmin } from "@/middlewares/selfOrAdmin";
import express from "express";
import { userPreferenceController } from "./user-preference.controller";

const userPreferenceRouter: express.Router = express.Router();

// `:id` is a user id — a caller may only read/write their own preferences.
const ownPreference = selfOrAdmin("id");

// get single user preference
userPreferenceRouter.get(
  "/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.getUserPreferenceController,
);

// update theme preference
userPreferenceRouter.patch(
  "/theme/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.updateThemePreferenceController,
);

// update language preference
userPreferenceRouter.patch(
  "/language/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.updateLanguagePreferenceController,
);

// update timezone preference
userPreferenceRouter.patch(
  "/timezone/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.updateTimezonePreferenceController,
);

// update co-author preference
userPreferenceRouter.patch(
  "/impersonate/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.updateCoAuthorPreferenceController,
);

// update preference
userPreferenceRouter.patch(
  "/:id",
  authMiddleware.verifyAuth(ENUM_ROLE.USER),
  ownPreference,
  userPreferenceController.updateUserPreferenceController,
);

export default userPreferenceRouter;
