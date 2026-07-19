"use server";

import { TUserPreference } from "@/redux/features/user-preference/type";
import { fetchApi, mutate } from "../utils";

export type TGetUserPreference = {
  variables: { userId: string };
} & TUserPreference;

export type TUpdateTheme = {
  variables: { userId: string; theme: string };
};

export type TUpdateCoAuthor = {
  variables: { userId: string; impersonate: boolean };
};

export type TUpdatePreference = {
  variables: { userId: string; data: Partial<TUserPreference> };
};

export const getUserPreferenceAction = async (userId: string) => {
  return await fetchApi<TGetUserPreference>({
    endPoint: `/user-preference/${userId}`,
    method: "GET",
    cache: "no-cache",
  });
};

export const updateThemePreferenceAction = async (
  userId: string,
  theme: string,
) => {
  return await mutate<TUpdateTheme>(async () => {
    return await fetchApi<TUpdateTheme>({
      endPoint: `/user-preference/theme/${userId}`,
      method: "PATCH",
      body: { userId, theme },
    });
  });
};

export const updateCoAuthorPreferenceAction = async (
  userId: string,
  impersonate: boolean,
) => {
  return await mutate<TUpdateCoAuthor>(async () => {
    return await fetchApi<TUpdateCoAuthor>({
      endPoint: `/user-preference/impersonate/${userId}`,
      method: "PATCH",
      body: { userId, impersonate },
    });
  });
};

export const updateUserPreferenceAction = async (
  userId: string,
  data: Partial<TUserPreference>,
) => {
  return await mutate<TUpdatePreference>(async () => {
    return await fetchApi<TUpdatePreference>({
      endPoint: `/user-preference/${userId}`,
      method: "PATCH",
      body: { userId, data },
    });
  });
};
