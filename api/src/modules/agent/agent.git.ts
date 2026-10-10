import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import { getAppUrl } from "@/lib/appUrl";
import {
  createGitHubClient,
  parseGitHubRepository,
} from "@/lib/git-engine/github";
import {
  assertGitLabRepository,
  createGitLabClient,
} from "@/lib/git-engine/gitlab";
import { TGitClient } from "@/lib/git-engine/types";
import { TProjectType } from "@/modules/project/project.type";

type TProjectToken = {
  provider: "Github" | "Gitlab";
  token: string;
  expires_at: number;
};

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const UNKNOWN_EXPIRY_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { token: TProjectToken; until: number }>();

export const isGitLabProject = (project: Pick<TProjectType, "provider">) =>
  project.provider.toLowerCase() === "gitlab";

/** The web app mints these (it holds the GitHub App key); see app/src/lib/git/project-token.ts. */
const fetchProjectToken = async (
  projectId: string,
  userId: string,
): Promise<TProjectToken> => {
  const appUrl = getAppUrl();
  if (!appUrl || !config.internal_secret) {
    throw new ApiError(
      "APP_URL and INTERNAL_API_SECRET must be set for agent git access",
      500,
      "",
    );
  }
  const res = await fetch(`${appUrl}/api/internal/project-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": config.internal_secret,
    },
    body: JSON.stringify({ projectId, userId }),
  });
  const body = (await res
    .json()
    .catch(() => ({}))) as Partial<TProjectToken> & { error?: string };
  if (!res.ok || !body.token || !body.provider) {
    const status = [403, 404, 409].includes(res.status) ? res.status : 502;
    throw new ApiError(
      body.error || "Couldn't get access to the repository",
      status,
      "",
    );
  }
  return body as TProjectToken;
};

export const getProjectToken = async (
  projectId: string,
  userId: string,
): Promise<TProjectToken> => {
  const key = `${projectId}:${userId}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.token;
  const token = await fetchProjectToken(projectId, userId);
  const until = token.expires_at
    ? token.expires_at - REFRESH_MARGIN_MS
    : Date.now() + UNKNOWN_EXPIRY_TTL_MS;
  cache.set(key, { token, until });
  return token;
};

export const createProjectGitClient = async (
  project: Pick<
    TProjectType,
    "project_id" | "provider" | "repository" | "branch"
  >,
  userId: string,
  branch = project.branch,
): Promise<TGitClient> => {
  const { token } = await getProjectToken(project.project_id, userId);
  const options = { repository: project.repository, branch, token };
  return isGitLabProject(project)
    ? createGitLabClient(options)
    : createGitHubClient(options);
};

/** Upstream URL for git's smart-HTTP protocol, plus the Basic credentials the host expects. */
export const gitRemoteFor = async (
  project: Pick<TProjectType, "project_id" | "provider" | "repository">,
  userId: string,
) => {
  // The repository string becomes part of an upstream URL.
  if (isGitLabProject(project)) assertGitLabRepository(project.repository);
  else parseGitHubRepository(project.repository);
  const { token } = await getProjectToken(project.project_id, userId);
  return isGitLabProject(project)
    ? {
        url: `https://gitlab.com/${project.repository}.git`,
        username: "oauth2",
        password: token,
      }
    : {
        url: `https://github.com/${project.repository}.git`,
        username: "x-access-token",
        password: token,
      };
};
