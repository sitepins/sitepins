import ApiError from "@/errors/ApiError";
import { logger } from "@/lib/logger";
import { requireOrgAccess } from "@/lib/resourceAuth";
import { User } from "@/modules/user/user.model";
import config from "@/config/variables";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { AgentGrant } from "./agent-grant.model";
import { agentCache } from "./agent.cache";
import {
  AGENT_SCOPE_LABELS,
  AGENT_SCOPES,
  EAgentScope,
  TAgentContext,
  TAgentGrant,
} from "./agent.type";

export const AGENT_TOKEN_PREFIX = "spat_";
const LAST_USED_THROTTLE_MS = 60_000;

export const generateAgentToken = () =>
  `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

// The token is 256 random bits, so an unsalted hash can't be brute-forced.
export const agentTokenIndex = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const BEARER_CHALLENGE = 'Bearer realm="Sitepins"';

export class AgentAuthError extends ApiError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, "");
  }
}

const bearerOf = (authorization: string | undefined) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

// The TTL index removes expired tokens within a minute; this covers that gap.
const isExpired = (grant: TAgentGrant) =>
  Boolean(grant.expires_at && grant.expires_at <= new Date());

const touch = (grant: TAgentGrant) => {
  const last = grant.last_used_at?.getTime() ?? 0;
  if (Date.now() - last < LAST_USED_THROTTLE_MS) return;
  // The grant may be the cached copy; keep it current so the throttle holds.
  grant.last_used_at = new Date();
  AgentGrant.updateOne(
    { grant_id: grant.grant_id },
    { $set: { last_used_at: new Date() } },
  ).catch((error) => logger.error("[agents] last-used update failed", error));
};

/** Cached for 30 s; revoking a token or removing a member clears the cache (forgetAgents), so both apply immediately. */
export async function authenticateAgent(
  authorization: string | undefined,
): Promise<TAgentContext> {
  const token = bearerOf(authorization);
  if (!token?.startsWith(AGENT_TOKEN_PREFIX)) {
    throw new AgentAuthError(
      "Missing Sitepins access token. Create one in Settings → MCP Connection.",
    );
  }

  const tokenIndex = agentTokenIndex(token);
  const cached = agentCache.getAgent(tokenIndex);
  if (cached && !isExpired(cached.grant)) {
    touch(cached.grant);
    return { ...cached, token };
  }

  const grant = await AgentGrant.findOne({ token_index: tokenIndex }).lean();
  const agent = await contextForGrant(grant);
  agentCache.setAgent(tokenIndex, agent);
  return { ...agent, token };
}

const contextForGrant = async (grant: TAgentGrant | null) => {
  if (!grant) {
    throw new AgentAuthError("This access token was revoked or doesn't exist");
  }
  if (isExpired(grant))
    throw new AgentAuthError("This access token has expired");

  const user = await User.findOne({ user_id: grant.user_id })
    .select("user_id full_name email")
    .lean();
  if (!user) throw new AgentAuthError("The account no longer exists");

  // Removing a member from the org cuts off their tokens at once.
  await requireOrgAccess(user.user_id, grant.org_id).catch(() => {
    throw new AgentAuthError(
      "You no longer belong to this token's organization",
      403,
    );
  });

  touch(grant);
  return {
    user_id: user.user_id,
    user_name: user.full_name,
    user_email: user.email,
    grant,
    scopes: new Set(grant.scopes.filter((s) => AGENT_SCOPES.includes(s))),
    client_name: grant.name,
  };
};

const signingSecret = () => {
  const secret = config.better_auth_secret || config.jwt_secret;
  if (!secret) throw new ApiError("The server has no signing secret", 500, "");
  return secret;
};

const sign = (purpose: string, payload: string) =>
  createHmac("sha256", signingSecret())
    .update(`sitepins-${purpose}:${payload}`)
    .digest("base64url");

/** Short-lived, purpose-bound credentials: `<prefix><claims>.<hmac>`. */
const issueSigned = <T extends { e: number }>(
  prefix: string,
  purpose: string,
  claims: T,
) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${prefix}${payload}.${sign(purpose, payload)}`;
};

const verifySigned = <T extends { e: number }>(
  prefix: string,
  purpose: string,
  token: string,
  expiredMessage: string,
): T => {
  const [payload, signature] = token.slice(prefix.length).split(".");
  const expected = payload ? Buffer.from(sign(purpose, payload)) : undefined;
  const given = Buffer.from(signature ?? "");
  if (
    !token.startsWith(prefix) ||
    !expected ||
    expected.length !== given.length ||
    !timingSafeEqual(expected, given)
  ) {
    throw new AgentAuthError("Invalid link or token");
  }
  let claims: T;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    throw new AgentAuthError("Invalid link or token");
  }
  if (claims.e <= Date.now()) throw new AgentAuthError(expiredMessage);
  return claims;
};

export const GIT_READ_TOKEN_PREFIX = "spgt_";
const GIT_READ_TTL_MS = 60 * 60_000;

type TGitReadClaims = { g: string; p: string; e: number };

/**
 * A fetch-only credential for one site, valid for an hour, so clone and sync
 * commands work without the agent's real token being stored or prompted for.
 */
export const issueGitReadToken = (
  agent: TAgentContext,
  projectId: string,
  ttlMs = GIT_READ_TTL_MS,
) => {
  const claims: TGitReadClaims = {
    g: agent.grant.grant_id,
    p: projectId,
    e: Date.now() + ttlMs,
  };
  return {
    token: issueSigned(GIT_READ_TOKEN_PREFIX, "git-read", claims),
    expires_at: new Date(claims.e),
  };
};

/** Accepts only for git fetches of the site it was issued for, and only while its grant is still valid. */
export async function authenticateGitReadToken(
  token: string,
  projectId: string,
): Promise<TAgentContext> {
  const claims = verifySigned<TGitReadClaims>(
    GIT_READ_TOKEN_PREFIX,
    "git-read",
    token,
    "This git access token expired. Call get_clone_command for fresh commands",
  );
  if (claims.p !== projectId) {
    throw new AgentAuthError("This git access token is for another site", 403);
  }
  const grant = await AgentGrant.findOne({ grant_id: claims.g }).lean();
  return { ...(await contextForGrant(grant)), token };
}

export const UPLOAD_TICKET_PREFIX = "spup_";
const UPLOAD_TTL_MS = 15 * 60_000;

export type TUploadClaims = {
  g: string;
  p: string;
  /** Repository path the file is saved to. */
  f: string;
  /** Replace an existing file. */
  o: boolean;
  m?: string;
  n: string;
  e: number;
};

const usedUploads = new Map<string, number>();

export const issueUploadTicket = (
  agent: TAgentContext,
  input: {
    projectId: string;
    path: string;
    overwrite: boolean;
    message?: string;
  },
) => {
  const claims: TUploadClaims = {
    g: agent.grant.grant_id,
    p: input.projectId,
    f: input.path,
    o: input.overwrite,
    ...(input.message && { m: input.message }),
    n: randomBytes(9).toString("base64url"),
    e: Date.now() + UPLOAD_TTL_MS,
  };
  return {
    ticket: issueSigned(UPLOAD_TICKET_PREFIX, "upload", claims),
    expires_at: new Date(claims.e),
  };
};

/** One upload per link; the link itself is the credential, so curl needs no headers. */
export async function redeemUploadTicket(ticket: string) {
  const claims = verifySigned<TUploadClaims>(
    UPLOAD_TICKET_PREFIX,
    "upload",
    ticket,
    "This upload link expired. Call create_upload_url for a new one",
  );
  const now = Date.now();
  for (const [nonce, until] of usedUploads) {
    if (until <= now) usedUploads.delete(nonce);
  }
  if (usedUploads.has(claims.n)) {
    throw new AgentAuthError(
      "This upload link was already used. Call create_upload_url for a new one",
      410,
    );
  }
  usedUploads.set(claims.n, claims.e);
  const grant = await AgentGrant.findOne({ grant_id: claims.g }).lean();
  try {
    return {
      claims,
      agent: { ...(await contextForGrant(grant)), token: ticket },
    };
  } catch (error) {
    usedUploads.delete(claims.n);
    throw error;
  }
}

/** Lets a failed upload be retried with the same link. */
export const releaseUploadTicket = (claims: TUploadClaims) =>
  usedUploads.delete(claims.n);

export const authenticateRequest = (
  req: Request,
  authorization = req.headers.authorization,
) => authenticateAgent(authorization);

export const requireScope = (agent: TAgentContext, scope: EAgentScope) => {
  if (!agent.scopes.has(scope)) {
    throw new ApiError(
      `This token lacks the ${scope} permission. The user can turn on "${AGENT_SCOPE_LABELS[scope]}" for it in Sitepins → Settings → MCP Connection.`,
      403,
      "",
    );
  }
};
