import { authClient } from "@/lib/auth/auth-client";
import { logger } from "@/lib/logger";
import {
  dedupeFiles,
  filterUploadableFiles,
  normalizeDeleteCommitMessage,
  USER_TRAILER_KEY,
} from "@/lib/utils/git-utils";
import { userPreferenceApi } from "../user-preference/user-preference-api";

/**
 * Provider-neutral scaffolding shared by the GitHub and GitLab commit
 * mutations. The two transports differ (GitHub drives the low-level Git API,
 * GitLab posts a single commit with actions), but everything around them —
 * file filtering, token escalation, author resolution — is the same.
 */

export type CommitFile = { path: string; content?: string; delete?: boolean };

export type PreparedCommit = {
  files: CommitFile[];
  message: string;
};

/**
 * Drops files the provider will reject and collapses duplicate paths, then
 * normalises the message. Returns null when nothing is left to commit.
 */
export const prepareCommit = (
  files: CommitFile[],
  message: string,
): PreparedCommit | null => {
  const prepared = filterUploadableFiles(dedupeFiles(files));
  if (prepared.length === 0) return null;
  return {
    files: prepared,
    message: normalizeDeleteCommitMessage(message, prepared),
  };
};

export const isPermissionError = (error: unknown): boolean => {
  const err = error as
    { status?: unknown; response?: { status?: unknown } } | undefined;
  const status = Number(err?.status ?? err?.response?.status);
  return status === 401 || status === 403;
};

export type FetchResult<T = unknown> = { data?: T; error?: unknown };

/** `fetchWithBQ` is typed as possibly-synchronous, so callbacks mirror that. */
export type MaybeFetchResult<T> = FetchResult<T> | PromiseLike<FetchResult<T>>;

export type CommitTokenSession = {
  /** False once a call has fallen back to the app identity. */
  usingUserToken: () => boolean;
  /** Token for the current identity. */
  token: () => string | undefined;
  /**
   * Runs `call` with the current token. On a 401/403 while still on the user
   * token, drops to the app identity and retries once — and stays there for
   * the rest of the commit, so a single commit never mixes authors.
   */
  // Generic over the whole result so the provider's own error type survives.
  run: <R extends FetchResult<unknown>>(
    call: (token: string | undefined) => R | PromiseLike<R>,
  ) => Promise<R>;
};

export const createCommitTokenSession = (
  userToken?: string,
  appToken?: string,
): CommitTokenSession => {
  let useUserToken = Boolean(userToken);

  return {
    usingUserToken: () => useUserToken,
    token: () => (useUserToken ? userToken : appToken),
    async run<R extends FetchResult<unknown>>(
      call: (token: string | undefined) => R | PromiseLike<R>,
    ) {
      const result = await call(useUserToken ? userToken : appToken);
      if (!result.error || !useUserToken || !isPermissionError(result.error)) {
        return result;
      }
      useUserToken = false;
      // The retry deliberately sends no token, letting the base query apply
      // the app installation credentials.
      return call(undefined);
    },
  };
};

type Dispatcher = {
  (action: unknown): { data?: { impersonate?: boolean } };
};

/**
 * Whether the signed-in user chose to act as the bot, which drops attribution.
 * Failures here must not fail the commit.
 */
export const resolveImpersonatePreference = async (
  dispatch: Dispatcher,
): Promise<boolean> => {
  try {
    const userId = (await authClient.getSession())?.data?.user?.user_id;
    if (!userId) return false;
    const preference = await dispatch(
      userPreferenceApi.endpoints.getUserPreference.initiate(userId),
    );
    return preference.data?.impersonate ?? false;
  } catch (error) {
    logger.warn("Failed to fetch user preferences", error);
    return false;
  }
};

export type TCommitIdentity = { name?: string; email?: string };

/** `name` is the CMS user's; `account` is the provider account behind the user token, when there is one. */
export type TCommitAuthor = { name?: string; account?: TCommitIdentity };

export const resolveCommitAuthor = async <T>({
  session,
  fetchUser,
  mapUser,
}: {
  session: CommitTokenSession;
  /** Provider call for the authenticated user; skipped without a user token. */
  fetchUser: (token: string | undefined) => MaybeFetchResult<T>;
  mapUser: (data: T) => TCommitIdentity;
}): Promise<TCommitAuthor> => {
  const name = (await authClient.getSession())?.data?.user?.full_name;

  if (!session.usingUserToken()) return { name };

  try {
    const result = await session.run(fetchUser);
    if (result.data) return { name, account: mapUser(result.data) };
    if (session.usingUserToken()) {
      logger.warn("Failed to fetch commit author", result.error);
    }
  } catch (error) {
    logger.warn("Failed to fetch commit author", error);
  }
  return { name };
};

const trailerValue = (value: string) =>
  value
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The CMS email is never published; only a linked provider account gets a Co-authored-by. */
export const attributionTrailer = (
  author: TCommitAuthor,
): string | undefined => {
  const coName = author.account?.name && trailerValue(author.account.name);
  const coEmail = author.account?.email && trailerValue(author.account.email);
  if (coName && coEmail) return `Co-authored-by: ${coName} <${coEmail}>`;

  const name = trailerValue(author.name || author.account?.name || "");
  return name ? `${USER_TRAILER_KEY}: ${name}` : undefined;
};

export const resolveAttributionTrailer = async <T>({
  dispatch,
  session,
  fetchUser,
  mapUser,
}: {
  dispatch: Dispatcher;
  session: CommitTokenSession;
  fetchUser: (token: string | undefined) => MaybeFetchResult<T>;
  mapUser: (data: T) => TCommitIdentity;
}): Promise<string | undefined> => {
  if (await resolveImpersonatePreference(dispatch)) return undefined;
  const author = await resolveCommitAuthor({ session, fetchUser, mapUser });
  return attributionTrailer(author);
};
