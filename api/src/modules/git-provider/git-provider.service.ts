import { decrypt, encrypt, tokenIndex } from "@/lib/encrypt";
import { GitProvider } from "./git-provider.model";
import { TGitProviderType } from "./git-provider.type";

// OAuth tokens are encrypted at rest (AES-256-GCM, SANDBOX_ENCRYPTION_KEY) so
// a database dump doesn't hand out every user's GitHub/GitLab account. They're
// decrypted on the way out, so callers see exactly what they saw before.
const TOKEN_FIELDS = [
  "access_token",
  "refresh_token",
  "installation_access_token",
] as const;

type TokenBearing = Partial<Record<(typeof TOKEN_FIELDS)[number], string>>;

const encryptTokens = <T extends TokenBearing>(doc: T): T => {
  const out = { ...doc };
  for (const field of TOKEN_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value) {
      out[field] = encrypt(value) as T[typeof field];
    }
  }
  return out;
};

// Tolerates plaintext rows written before encryption was enabled: decrypt()
// returns its input unchanged when the value isn't in `iv:tag:ciphertext` form.
const decryptTokens = <T extends TokenBearing>(doc: T | null): T | null => {
  if (!doc) return doc;
  const out = { ...doc };
  for (const field of TOKEN_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value) {
      try {
        out[field] = decrypt(value) as T[typeof field];
      } catch {
        // leave as-is — key rotated or value not encrypted
      }
    }
  }
  return out;
};

const createProviderService = async (
  provider: TGitProviderType & { user_id: string },
) => {
  const stored = encryptTokens(provider);
  const updateProvider = await GitProvider.findOneAndUpdate(
    { user_id: provider.user_id, provider: provider.provider },
    {
      $set: {
        ...stored,
        // Deterministic index so rotation can find this row without being able
        // to query the (randomly-IV'd) ciphertext.
        refresh_token_index: provider.refresh_token
          ? tokenIndex(provider.refresh_token)
          : null,
      },
    },
    {
      returnDocument: "after",
      upsert: true,
    },
  );
  return decryptTokens(updateProvider?.toObject?.() ?? updateProvider);
};

// OAuth tokens — access control (own vs. org-shared) is enforced in the controller.
const getProviderService = async (userId: string) => {
  const providers = await GitProvider.find({ user_id: userId }).lean();

  return providers.map((p) => decryptTokens(p));
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
  provider: TGitProviderType["provider"];
  old_refresh_token: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at?: number;
  refresh_token_expires_at?: number;
}) => {
  const index = tokenIndex(payload.old_refresh_token);

  // Match the encrypted-at-rest index first, falling back to the plaintext
  // column for rows written before encryption was turned on.
  const filter = index
    ? {
        provider: payload.provider,
        $or: [
          { refresh_token_index: index },
          { refresh_token: payload.old_refresh_token },
        ],
      }
    : {
        provider: payload.provider,
        refresh_token: payload.old_refresh_token,
      };

  const updated = await GitProvider.findOneAndUpdate(
    filter,
    {
      $set: {
        access_token: encrypt(payload.access_token),
        refresh_token: encrypt(payload.refresh_token),
        refresh_token_index: tokenIndex(payload.refresh_token),
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

  return decryptTokens(updated?.toObject?.() ?? updated);
};

export const gitProviderService = {
  getProviderService,
  createProviderService,
  deleteProviderService,
  rotateProviderTokensService,
};
