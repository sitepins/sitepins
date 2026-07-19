import { api } from "../api-slice";
import { TUserPreference } from "./type";

export const userPreferenceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getUserPreference: builder.query<TUserPreference, string>({
      query: (userId) => ({
        url: `/user-preference/${userId}`,
        method: "GET",
      }),
      providesTags: (result, error, userId) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),

    updateThemePreference: builder.mutation<
      void,
      { userId: string; theme: string }
    >({
      query: ({ userId, theme }) => ({
        url: `/user-preference/theme/${userId}`,
        method: "PATCH",
        data: { theme },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),

    updateCoAuthorPreference: builder.mutation<
      void,
      { userId: string; impersonate: boolean }
    >({
      query: ({ userId, impersonate }) => ({
        url: `/user-preference/impersonate/${userId}`,
        method: "PATCH",
        data: { impersonate },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),

    updateLanguagePreference: builder.mutation<
      void,
      { userId: string; language: string }
    >({
      query: ({ userId, language }) => ({
        url: `/user-preference/language/${userId}`,
        method: "PATCH",
        data: { language },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),

    updateTimezonePreference: builder.mutation<
      void,
      { userId: string; timezone: string }
    >({
      query: ({ userId, timezone }) => ({
        url: `/user-preference/timezone/${userId}`,
        method: "PATCH",
        data: { timezone },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),

    updateUserPreference: builder.mutation<
      void,
      { userId: string; data: Partial<TUserPreference> }
    >({
      query: ({ userId, data }) => ({
        url: `/user-preference/${userId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "UserPreference" as const, id: userId },
      ],
    }),
  }),
});

export const {
  useGetUserPreferenceQuery,
  useUpdateThemePreferenceMutation,
  useUpdateCoAuthorPreferenceMutation,
  useUpdateLanguagePreferenceMutation,
  useUpdateTimezonePreferenceMutation,
  useUpdateUserPreferenceMutation,
} = userPreferenceApi;
