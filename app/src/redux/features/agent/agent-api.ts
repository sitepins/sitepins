import { api } from "../api-slice";
import { TAgentGrant, TAgentGrantSettings, TCreatedAgentToken } from "./type";

export const agentApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAgentGrants: builder.query<TAgentGrant[], void>({
      query: () => ({ method: "GET", url: "/agent-grants" }),
      providesTags: ["AgentGrants"],
    }),

    createAgentToken: builder.mutation<
      TCreatedAgentToken,
      TAgentGrantSettings & { name: string; expires_in_days: number }
    >({
      query: (data) => ({ method: "POST", url: "/agent-grants/tokens", data }),
      invalidatesTags: ["AgentGrants"],
    }),

    revokeAgentGrant: builder.mutation<{ revoked: boolean }, string>({
      query: (grantId) => ({
        method: "DELETE",
        url: `/agent-grants/${encodeURIComponent(grantId)}`,
      }),
      invalidatesTags: ["AgentGrants"],
    }),
  }),
});

export const {
  useGetAgentGrantsQuery,
  useCreateAgentTokenMutation,
  useRevokeAgentGrantMutation,
} = agentApi;
