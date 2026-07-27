import { UserPreference } from "./user-preference.model";
import { UserPreferenceType } from "./user-preference.type";

// get user preference
const getUserPreferenceService = async (id: string) => {
  const userPreference = await UserPreference.findOne({ user_id: id });
  return userPreference;
};

// update / create user preference
const updateUserPreferenceService = async (
  id: string,
  preference: UserPreferenceType,
) => {
  const result = await UserPreference.findOneAndUpdate(
    { user_id: id },
    preference,
    {
      returnDocument: "after",
      upsert: true,
    },
  );

  return result;
};

// update theme preference
const updateThemePreferenceService = async (id: string, theme: string) => {
  const result = await UserPreference.findOneAndUpdate(
    { user_id: id },
    { theme },
    {
      returnDocument: "after",
      upsert: true,
    },
  );

  return result;
};

// update language preference
const updateLanguagePreferenceService = async (
  id: string,
  language: string,
) => {
  const result = await UserPreference.findOneAndUpdate(
    { user_id: id },
    { language },
    {
      returnDocument: "after",
      upsert: true,
    },
  );

  return result;
};

// update timezone preference
const updateTimezonePreferenceService = async (
  id: string,
  timezone: string,
) => {
  const result = await UserPreference.findOneAndUpdate(
    { user_id: id },
    { timezone },
    {
      returnDocument: "after",
      upsert: true,
    },
  );

  return result;
};

// update co-author preference
const updateCoAuthorPreferenceService = async (
  id: string,
  impersonate: boolean,
) => {
  const result = await UserPreference.findOneAndUpdate(
    { user_id: id },
    { impersonate },
    {
      returnDocument: "after",
      upsert: true,
    },
  );

  return result;
};

export const userPreferenceService = {
  getUserPreferenceService,
  updateUserPreferenceService,
  updateThemePreferenceService,
  updateLanguagePreferenceService,
  updateTimezonePreferenceService,
  updateCoAuthorPreferenceService,
};
