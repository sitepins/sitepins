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

const getProviderService = async ({
  userId,
  currentLoginUser,
}: {
  userId: string;
  currentLoginUser: string;
}) => {
  const providers = await GitProvider.find({
    $or: [{ user_id: userId }, { user_id: currentLoginUser }],
  });

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
