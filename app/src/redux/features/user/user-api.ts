import { api } from "../api-slice";
import { TUser } from "./type";

export const userApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getUserDetails: builder.query<TUser, string>({
      query: (userId) => ({
        url: `/user/${userId}`,
        method: "GET",
      }),
      providesTags: (result, error, userId) => [{ type: "User", id: userId }],
    }),

    updateUserCountry: builder.mutation<
      void,
      { userId: string; country: string }
    >({
      query: ({ userId, country }) => ({
        url: `/user/update-country/${userId}`,
        method: "PATCH",
        data: { country },
      }),

      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
      ],
    }),

    deleteUser: builder.mutation<
      void,
      { user_id: string; payload: { reason?: string } }
    >({
      query: ({ user_id, payload }) => ({
        url: `/user/delete/${user_id}`,
        method: "DELETE",
        data: payload,
      }),
    }),

    setPassword: builder.mutation<void, { newPassword: string }>({
      query: (body) => ({
        url: `/user/set-password`,
        method: "PATCH",
        data: body,
      }),
    }),

    checkLimits: builder.mutation<void, any>({
      query: () => ({
        url: `/user/check-limits`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useGetUserDetailsQuery,
  useUpdateUserCountryMutation,
  useDeleteUserMutation,
  useSetPasswordMutation,
  useCheckLimitsMutation,
} = userApi;
