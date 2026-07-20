import { GitProvider } from "./git-provider.model";
import { GitProviderType } from "./git-provider.type";

const createProviderService = async (
  provider: GitProviderType & { user_id: string },
) => {
  const updateProvider = await GitProvider.findOneAndUpdate(
    { user_id: provider.user_id, provider: provider.provider },
    { $set: provider },
    {
      returnDocument: "after",
      upsert: true,
    },
  );
  return updateProvider;
};

// OAuth tokens — access control (own vs. org-shared) is enforced in the controller.
const getProviderService = async (userId: string) => {
  const providers = await GitProvider.find({ user_id: userId });

  return providers;
};

const deleteProviderService = async (userId: string) => {
  await GitProvider.findOneAndDelete({ user_id: userId });
};

// Persist rotated OAuth tokens onto the row that currently holds the consumed
// refresh token. Matching on the old refresh token (not the session user)
// serves two purposes: a collaborator refreshing the project creator's token
// updates the CREATOR's row instead of corrupting their own, and possession
// of the row's current refresh token is itself the write authorization.
const rotateProviderTokensService = async (payload: {
  provider: GitProviderType["provider"];
  old_refresh_token: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at?: number;
  refresh_token_expires_at?: number;
}) => {
  return GitProvider.findOneAndUpdate(
    { provider: payload.provider, refresh_token: payload.old_refresh_token },
    {
      $set: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        last_refreshed_at: new Date(),
        ...(payload.access_token_expires_at
          ? {
              access_token_expires_at: new Date(
                payload.access_token_expires_at,
              ),
            }
          : {}),
        ...(payload.refresh_token_expires_at
          ? {
              refresh_token_expires_at: new Date(
                payload.refresh_token_expires_at,
              ),
            }
          : {}),
      },
    },
    { returnDocument: "after" },
  );
};

export const gitProviderService = {
  getProviderService,
  createProviderService,
  deleteProviderService,
  rotateProviderTokensService,
};
