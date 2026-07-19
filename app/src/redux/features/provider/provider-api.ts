import { authClient } from "@/lib/auth/auth-client";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { api } from "../api-slice";
import { updateConfig } from "../config/slice";
import { TProvider } from "./type";

export const providerApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProviders: builder.query<
      TProvider[],
      | { user_id: string | undefined; preferredProvider?: string }
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
      transformResponse: (response: any[]) =>
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
        const state = getState() as any;
        const preferredProvider =
          typeof arg === "object" ? arg.preferredProvider : undefined;
        const targetProvider = preferredProvider || state.config.provider;

        const { data: auth } = await authClient.getSession();
        const loginUserId = auth?.user.user_id;
        const targetUserId = typeof arg === "object" ? arg.user_id : arg;

        // Find GitHub providers
        const githubProviders = providers.filter((item) =>
          isGitHubProvider(item.provider),
        );

        const loginUserGithubProvider = githubProviders.find(
          (item) =>
            item.user_id === loginUserId && isGitHubProvider(item.provider),
        );

        const selectedGithubProvider = githubProviders.find(
          (item) =>
            item.user_id === targetUserId && isGitHubProvider(item.provider),
        );

        // Find GitLab providers
        const gitlabProviders = providers.filter((item) =>
          isGitLabProvider(item.provider),
        );

        const loginUserGitlabProvider = gitlabProviders.find(
          (item) =>
            item.user_id === loginUserId && isGitLabProvider(item.provider),
        );

        const selectedGitlabProvider = gitlabProviders.find(
          (item) =>
            item.user_id === targetUserId && isGitLabProvider(item.provider),
        );

        // Determine which provider to use
        // Use preferredProvider if specified, otherwise fallback to existing logic
        const useGitlab = isGitLabProvider(targetProvider)
          ? gitlabProviders.length > 0
          : githubProviders.length === 0 && gitlabProviders.length > 0;

        if (useGitlab) {
          dispatch(
            updateConfig({
              currentLoginUserToken: loginUserGitlabProvider?.accessToken!,
              token: selectedGitlabProvider?.accessToken!,
              provider: "Gitlab",
              refreshToken: selectedGitlabProvider?.refreshToken || "",
              accessTokenExpiresAt:
                selectedGitlabProvider?.accessTokenExpiresAt || 0,
              refreshTokenExpiresAt:
                selectedGitlabProvider?.refreshTokenExpiresAt || 0,
              lastRefreshedAt: selectedGitlabProvider?.lastRefreshedAt || 0,
            }),
          );
        } else if (githubProviders.length > 0) {
          dispatch(
            updateConfig({
              currentLoginUserToken: loginUserGithubProvider?.accessToken!,
              token: selectedGithubProvider?.accessToken!,
              provider: "Github",
              refreshToken: selectedGithubProvider?.refreshToken || "",
              accessTokenExpiresAt:
                selectedGithubProvider?.accessTokenExpiresAt || 0,
              refreshTokenExpiresAt:
                selectedGithubProvider?.refreshTokenExpiresAt || 0,
              lastRefreshedAt: selectedGithubProvider?.lastRefreshedAt || 0,
            }),
          );
        }
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
