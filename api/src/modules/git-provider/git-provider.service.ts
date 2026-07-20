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

// Always scoped to the authenticated user. Git provider records hold OAuth
// access/refresh tokens with repo read/write scope, so they must never be
// readable across users — the caller's own id is the only permitted filter.
const getProviderService = async (userId: string) => {
  const providers = await GitProvider.find({ user_id: userId });

  return providers;
};

const deleteProviderService = async (userId: string) => {
  await GitProvider.findOneAndDelete({ user_id: userId });
};

export const gitProviderService = {
  getProviderService,
  createProviderService,
  deleteProviderService,
};
