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
  }),
});

export const {
  useGetUserDetailsQuery,
  useDeleteUserMutation,
  useSetPasswordMutation,
} = userApi;
