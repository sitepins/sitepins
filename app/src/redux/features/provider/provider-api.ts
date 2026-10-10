import { authClient } from "@/lib/auth/auth-client";
import { RootState } from "@/redux/store";
import { api } from "../api-slice";
import { updateConfig } from "../config/slice";
import { fetchDelegatedToken } from "./delegated-token";
import { selectProviderConfig, withDelegatedToken } from "./provider-config";
import { TProvider } from "./type";

/** Provider record as the API returns it, before snake_case → camelCase mapping. */
type TProviderResponse = Omit<
  TProvider,
  | "accessToken"
  | "accessTokenExpiresAt"
  | "installationAccessToken"
  | "tokenType"
  | "refreshToken"
  | "refreshTokenExpiresAt"
  | "lastRefreshedAt"
> & {
  access_token: string;
  access_token_expires_at?: number | Date | string;
  installation_access_token: string;
  token_type: string;
  refresh_token: string;
  refresh_token_expires_at?: number | Date | string;
  last_refreshed_at?: number | Date | string;
};

export const providerApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProviders: builder.query<
      TProvider[],
      | {
          user_id: string | undefined;
          preferredProvider?: string;
          /** Lets a non-owner member fetch a project-scoped token. */
          projectId?: string;
        }
      | string
      | undefined
    >({
      query: (arg) => {
        const user_id = typeof arg === "object" ? arg.user_id : arg;
        return {
          url: `/provider/${user_id ?? ""}`,
          method: "GET",
        };
      },
      transformResponse: (response: TProviderResponse[]): TProvider[] =>
        response.map((provider) => ({
          ...provider,
          accessToken: provider.access_token,
          accessTokenExpiresAt: provider.access_token_expires_at,
          installationAccessToken: provider.installation_access_token,
          tokenType: provider.token_type,
          refreshToken: provider.refresh_token,
          refreshTokenExpiresAt: provider.refresh_token_expires_at,
          lastRefreshedAt: provider.last_refreshed_at,
        })),
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const { data: providers } = await queryFulfilled;
        const state = getState() as RootState;
        const preferredProvider =
          typeof arg === "object" ? arg.preferredProvider : undefined;

        const { data: auth } = await authClient.getSession();
        const selection = selectProviderConfig({
          providers,
          loginUserId: auth?.user.user_id,
          targetUserId: typeof arg === "object" ? arg.user_id : arg,
          targetProvider: preferredProvider || state.config.provider,
        });
        if (!selection) return;

        const projectId = typeof arg === "object" ? arg.projectId : undefined;
        if (!selection.delegated || !projectId) {
          dispatch(updateConfig(selection.config));
          return;
        }

        const delegated = await fetchDelegatedToken(projectId);
        dispatch(
          updateConfig(
            withDelegatedToken(selection.config, projectId, delegated),
          ),
        );
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map((provider) => ({
                type: "Providers" as const,
                id: provider._id,
              })),
              { type: "Providers", id: "LIST" },
            ]
          : [{ type: "Providers", id: "LIST" }],
    }),

    // Create a new provider
    createProvider: builder.mutation<TProvider, Partial<TProvider>>({
      query: (provider) => ({
        url: "/provider/create",
        method: "POST",
        data: provider,
      }),
      // Invalidate the providers cache to trigger a refetch
      invalidatesTags: ["Providers"],
    }),
  }),
});

export const { useGetProvidersQuery, useCreateProviderMutation } = providerApi;
